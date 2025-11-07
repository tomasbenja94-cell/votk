const jwt = require('jsonwebtoken');
const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    // Check credentials from database
    let userResult = await pool.query(
      "SELECT value FROM config WHERE key = 'web_user'"
    );
    let passResult = await pool.query(
      "SELECT value FROM config WHERE key = 'web_pass'"
    );

    // Si no existen las credenciales en la BD, inicializarlas con valores por defecto
    if (userResult.rows.length === 0) {
      const defaultUser = 'flipendo';
      await pool.query(
        "INSERT INTO config (key, value, updated_at) VALUES ('web_user', $1, NOW()) ON CONFLICT (key) DO NOTHING",
        [defaultUser]
      );
      userResult = await pool.query(
        "SELECT value FROM config WHERE key = 'web_user'"
      );
    }

    if (passResult.rows.length === 0) {
      const defaultPass = 'fucker123';
      await pool.query(
        "INSERT INTO config (key, value, updated_at) VALUES ('web_pass', $1, NOW()) ON CONFLICT (key) DO NOTHING",
        [defaultPass]
      );
      passResult = await pool.query(
        "SELECT value FROM config WHERE key = 'web_pass'"
      );
    }

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
