const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');

async function getAll(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM wallets ORDER BY id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const { label, network, address, active } = req.body;

    const result = await pool.query(
      'INSERT INTO wallets (label, network, address, active) VALUES ($1, $2, $3, $4) RETURNING *',
      [label, network, address, active !== false]
    );

    await auditLogger.log(
      req.user.username,
      'create_wallet',
      { label, network, address }
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { label, network, address, active } = req.body;

    const result = await pool.query(
      'UPDATE wallets SET label = $1, network = $2, address = $3, active = $4 WHERE id = $5 RETURNING *',
      [label, network, address, active !== false, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    await auditLogger.log(
      req.user.username,
      'update_wallet',
      { walletId: id, label, network, address }
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteWallet(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM wallets WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    await auditLogger.log(
      req.user.username,
      'delete_wallet',
      { walletId: id }
    );

    res.json({ message: 'Wallet deleted successfully' });
  } catch (error) {
    console.error('Delete wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, create, update, delete: deleteWallet };

