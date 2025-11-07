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

    // Daily volume (últimos 7 días)
    const dailyVolumeResult = await pool.query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*)::int as count,
         COALESCE(SUM(amount_usdt), 0)::float as total_usdt,
         COALESCE(SUM(amount_ars), 0)::float as total_ars
       FROM transactions
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`
    );

    const typeBreakdownResult = await pool.query(
      `SELECT type, COUNT(*)::int as count
       FROM transactions
       GROUP BY type`
    );

    const statusBreakdownResult = await pool.query(
      `SELECT status, COUNT(*)::int as count
       FROM transactions
       GROUP BY status`
    );

    const overduePendingResult = await pool.query(
      `SELECT COUNT(*)::int as count
       FROM transactions
       WHERE status IN ('pendiente', 'procesando')
         AND created_at <= NOW() - INTERVAL '2 hours'`
    );

    const highValueResult = await pool.query(
      `SELECT COUNT(*)::int as count
       FROM transactions
       WHERE amount_usdt >= 100`
    );

    res.json({
      totalUsers,
      totalUSDT,
      totalTransactions,
      recentTransactions: recentTransactionsResult.rows,
      dailyVolume: dailyVolumeResult.rows,
      typeBreakdown: typeBreakdownResult.rows,
      statusBreakdown: statusBreakdownResult.rows,
      alerts: {
        pendingOverdue: overduePendingResult.rows[0]?.count || 0,
        highValue: highValueResult.rows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getStats };

