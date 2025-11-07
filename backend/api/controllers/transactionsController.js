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

async function clearAll(req, res) {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get all transactions
      const allTransactions = await client.query(`
        SELECT 
          t.*,
          u.telegram_id,
          u.username
        FROM transactions t
        LEFT JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `);
      
      if (allTransactions.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json({ message: 'No hay transacciones para limpiar', deleted: 0 });
      }
      
      // Move all transactions to deleted_transactions
      for (const tx of allTransactions.rows) {
        await client.query(`
          INSERT INTO deleted_transactions (
            original_id, user_id, telegram_id, username, type, amount_usdt, amount_ars,
            identifier, status, admin_id, proof_image, motivo,
            original_created_at, original_updated_at, deleted_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          tx.id,
          tx.user_id,
          tx.telegram_id,
          tx.username,
          tx.type,
          tx.amount_usdt,
          tx.amount_ars,
          tx.identifier,
          tx.status,
          tx.admin_id,
          tx.proof_image,
          tx.motivo,
          tx.created_at,
          tx.updated_at,
          req.user.username || 'admin'
        ]);
      }
      
      // Delete all transactions
      await client.query('DELETE FROM transactions');
      
      await client.query('COMMIT');
      
      // Log audit
      await auditLogger.log(
        req.user.username,
        'clear_all_transactions',
        { count: allTransactions.rows.length }
      );
      
      res.json({
        message: `Se limpiaron ${allTransactions.rows.length} transacciones`,
        deleted: allTransactions.rows.length
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Clear all transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDeleted(req, res) {
  try {
    const { month, year } = req.query;
    
    let query = 'SELECT * FROM deleted_transactions WHERE 1=1';
    const params = [];
    
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM deleted_at) = $${params.length + 1} AND EXTRACT(YEAR FROM deleted_at) = $${params.length + 2}`;
      params.push(parseInt(month), parseInt(year));
    }
    
    query += ' ORDER BY deleted_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      transactions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get deleted transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function downloadDeletedPDF(req, res) {
  try {
    const { month, year } = req.query;
    
    let query = 'SELECT * FROM deleted_transactions WHERE 1=1';
    const params = [];
    
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM deleted_at) = $${params.length + 1} AND EXTRACT(YEAR FROM deleted_at) = $${params.length + 2}`;
      params.push(parseInt(month), parseInt(year));
    }
    
    query += ' ORDER BY deleted_at DESC';
    
    const result = await pool.query(query, params);
    
    // Generate simple text-based PDF (using text/plain for now, can upgrade to pdfkit later)
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="movimientos-eliminados-${month || 'all'}-${year || 'all'}.pdf"`);
    
    doc.pipe(res);
    
    doc.fontSize(20).text('Movimientos Eliminados', { align: 'center' });
    doc.moveDown();
    
    if (month && year) {
      doc.fontSize(14).text(`Mes: ${month}/${year}`, { align: 'center' });
      doc.moveDown();
    }
    
    doc.fontSize(12);
    doc.text(`Total de movimientos: ${result.rows.length}`);
    doc.moveDown();
    
    // Table header
    doc.font('Helvetica-Bold');
    doc.text('Fecha', 50, doc.y);
    doc.text('Usuario', 150, doc.y);
    doc.text('Tipo', 250, doc.y);
    doc.text('Monto USDT', 320, doc.y);
    doc.text('Monto ARS', 420, doc.y);
    doc.text('Estado', 520, doc.y);
    doc.moveDown();
    
    // Table rows
    doc.font('Helvetica');
    let yPos = doc.y;
    result.rows.forEach((tx, index) => {
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }
      
      const date = new Date(tx.deleted_at).toLocaleDateString('es-AR');
      doc.text(date || '-', 50, yPos);
      doc.text(tx.username || `ID: ${tx.telegram_id}` || '-', 150, yPos);
      doc.text(tx.type || '-', 250, yPos);
      doc.text(parseFloat(tx.amount_usdt || 0).toFixed(2), 320, yPos);
      doc.text(tx.amount_ars ? `$${parseFloat(tx.amount_ars).toLocaleString('es-AR')}` : '-', 420, yPos);
      doc.text(tx.status || '-', 520, yPos);
      
      yPos += 20;
    });
    
    doc.end();
  } catch (error) {
    console.error('Download deleted PDF error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, updateStatus, clearAll, getDeleted, downloadDeletedPDF };

