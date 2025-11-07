const jwt = require('jsonwebtoken');
const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    // Check credentials from database
    const userResult = await pool.query(
      "SELECT value FROM config WHERE key = 'web_user'"
    );
    const passResult = await pool.query(
      "SELECT value FROM config WHERE key = 'web_pass'"
    );

    const validUser = userResult.rows[0]?.value || 'flipendo';
    const validPass = passResult.rows[0]?.value || 'fucker123';

    if (username !== validUser || password !== validPass) {
      await auditLogger.log('system', 'login_failed', { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    await auditLogger.log(username, 'login_success');

    res.json({ token, username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { login };
