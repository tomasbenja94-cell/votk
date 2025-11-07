const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');

async function get(req, res) {
  try {
    const result = await pool.query(
      'SELECT key, value FROM config ORDER BY key'
    );

    const config = {};
    result.rows.forEach(row => {
      // Try to parse JSON values
      try {
        config[row.key] = JSON.parse(row.value);
      } catch (e) {
        config[row.key] = row.value;
      }
    });

    res.json(config);
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const config = req.body;

    for (const [key, value] of Object.entries(config)) {
      await pool.query(
        `INSERT INTO config (key, value, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (key) 
         DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, typeof value === 'object' ? JSON.stringify(value) : value]
      );
    }

    await auditLogger.log(
      req.user.username,
      'update_config',
      { keys: Object.keys(config) }
    );

    res.json({ message: 'Config updated successfully' });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { get, update };
