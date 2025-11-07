const pool = require('../../db/connection');

async function getStats(req, res) {
  try {
    // Total users
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Total USDT in balances
    const balanceResult = await pool.query(
      'SELECT SUM(saldo_usdt) as total FROM users'
    );
    const totalUSDT = parseFloat(balanceResult.rows[0].total || 0);

    // Total transactions
    const transactionsResult = await pool.query(
      'SELECT COUNT(*) as count FROM transactions'
    );
    const totalTransactions = parseInt(transactionsResult.rows[0].count);

    // Recent transactions
    const recentTransactionsResult = await pool.query(
      `SELECT t.*, u.username, u.telegram_id 
       FROM transactions t 
       JOIN users u ON t.user_id = u.id 
       ORDER BY t.created_at DESC 
       LIMIT 10`
    );

    res.json({
      totalUsers,
      totalUSDT,
      totalTransactions,
      recentTransactions: recentTransactionsResult.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getStats };

