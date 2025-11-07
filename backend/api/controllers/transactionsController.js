const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');
const notificationService = require('../../bot/services/notificationService');

async function getAll(req, res) {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        t.*,
        u.username,
        u.telegram_id,
        a.username as admin_username
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN admins a ON t.admin_id = a.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (status) {
      conditions.push(`t.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM transactions t';
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }
    const countParams = status ? [status] : [];
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, motivo } = req.body;
    
    if (!status || !['pagado', 'cancelado', 'pendiente', 'procesando'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Get transaction before update
    const txBefore = await pool.query(
      'SELECT t.*, u.telegram_id, u.username FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1',
      [id]
    );
    
    if (txBefore.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = txBefore.rows[0];
    
    // Check if already processed
    if (transaction.status === 'pagado' && status === 'cancelado') {
      return res.status(400).json({ error: 'Cannot cancel an already paid transaction' });
    }
    
    if (transaction.status === 'cancelado' && status === 'pagado') {
      return res.status(400).json({ error: 'Cannot pay a cancelled transaction' });
    }
    
    // Use transaction to prevent race conditions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Lock the transaction row
      const lockedTx = await client.query(
        'SELECT status, type, amount_usdt, user_id FROM transactions WHERE id = $1 FOR UPDATE',
        [id]
      );
      
      if (lockedTx.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      const lockedTransaction = lockedTx.rows[0];
      
      // If cancelling, refund balance if it was a payment
      if (status === 'cancelado' && lockedTransaction.type === 'pago' && lockedTransaction.status !== 'cancelado') {
        await client.query(
          'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
          [lockedTransaction.amount_usdt, lockedTransaction.user_id]
        );
        console.log(`Refunded ${lockedTransaction.amount_usdt} USDT to user for cancelled transaction ${id}`);
      }
      
      // Update transaction status
      await client.query(
        'UPDATE transactions SET status = $1, motivo = $2, updated_at = NOW() WHERE id = $3',
        [status, motivo || null, id]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    
    // Log audit
    await auditLogger.log(
      req.user.username,
      `transaction_${status}`,
      { transactionId: id, status, motivo }
    );
    
    // If cancelling, notify user
    if (status === 'cancelado' && transaction.telegram_id) {
      try {
        const bot = require('../../bot/bot').bot;
        await notificationService.notifyUser(bot, transaction.telegram_id, 'pago_cancelado', {
          motivo: motivo || 'Cancelado desde panel de administración'
        });
      } catch (notifyError) {
        console.error('Error notifying user:', notifyError);
      }
    }
    
    // Get updated transaction
    const updatedTx = await pool.query(
      `SELECT 
        t.*,
        u.username,
        u.telegram_id,
        a.username as admin_username
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN admins a ON t.admin_id = a.id
      WHERE t.id = $1`,
      [id]
    );
    
    res.json(updatedTx.rows[0]);
  } catch (error) {
    console.error('Update transaction status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, updateStatus };

