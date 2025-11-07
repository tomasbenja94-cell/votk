const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');

async function getAll(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { saldo_usdt, username } = req.body;

    const result = await pool.query(
      'UPDATE users SET saldo_usdt = $1, username = $2 WHERE id = $3 RETURNING *',
      [saldo_usdt, username, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await auditLogger.log(
      req.user.username,
      'update_user',
      { userId: id, saldo_usdt, username }
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await auditLogger.log(
      req.user.username,
      'delete_user',
      { userId: id }
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getBalance(req, res) {
  try {
    const { telegramId } = req.params;
    
    // Validate telegramId
    if (!telegramId || telegramId === 'undefined' || isNaN(telegramId)) {
      return res.status(400).json({ error: 'Invalid telegram_id' });
    }
    
    const telegramIdNum = parseInt(telegramId);
    if (isNaN(telegramIdNum)) {
      return res.status(400).json({ error: 'telegram_id must be a number' });
    }
    
    const result = await pool.query(
      'SELECT saldo_usdt FROM users WHERE telegram_id = $1',
      [telegramIdNum]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ balance: result.rows[0].saldo_usdt || 0 });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getStatus(req, res) {
  try {
    const { telegramId } = req.params;
    
    // Validate telegramId
    if (!telegramId || telegramId === 'undefined' || isNaN(telegramId)) {
      return res.status(400).json({ error: 'Invalid telegram_id' });
    }
    
    const telegramIdNum = parseInt(telegramId);
    if (isNaN(telegramIdNum)) {
      return res.status(400).json({ error: 'telegram_id must be a number' });
    }
    
    const userResult = await pool.query(
      'SELECT id, saldo_usdt FROM users WHERE telegram_id = $1',
      [telegramIdNum]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    // Get pending transactions
    const pendingResult = await pool.query(
      `SELECT id, type, amount_usdt, status, created_at 
       FROM transactions 
       WHERE user_id = $1 AND status = 'pendiente' 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );
    
    const response = {
      balance: parseFloat(userResult.rows[0].saldo_usdt || 0),
      notification: null
    };
    
    // Check for recent status changes (last 30 seconds)
    if (pendingResult.rows.length > 0) {
      const transaction = pendingResult.rows[0];
      const timeDiff = Date.now() - new Date(transaction.created_at).getTime();
      
      if (timeDiff < 30000) { // 30 seconds
        if (transaction.status === 'pendiente') {
          response.notification = {
            message: '⏳ Pago en revisión',
            type: 'warning'
          };
        }
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, update, delete: deleteUser, getBalance, getStatus };

