const pool = require('../../db/connection');

const ALLOWED_ROLES = ['superadmin', 'operador', 'auditor'];

async function getAll(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, username, telegram_id, role, active, created_at FROM admins ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Error al obtener administradores' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { role, active } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID de administrador requerido' });
    }

    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const result = await pool.query('SELECT * FROM admins WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Administrador no encontrado' });
    }

    const admin = result.rows[0];
    const newRole = role || admin.role || 'superadmin';
    const newActive = typeof active === 'boolean' ? active : admin.active;

    await pool.query(
      'UPDATE admins SET role = $1, active = $2, updated_at = NOW() WHERE id = $3',
      [newRole, newActive, id]
    );

    res.json({ id: parseInt(id, 10), role: newRole, active: newActive });
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ error: 'Error al actualizar administrador' });
  }
}

async function create(req, res) {
  try {
    const { username, telegram_id: telegramId, role } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username requerido' });
    }

    const normalizedRole = role && ALLOWED_ROLES.includes(role) ? role : 'operador';
    const cleanedUsername = username.trim();
    const storedUsername = cleanedUsername.startsWith('@') ? cleanedUsername : `@${cleanedUsername}`;
    const normalizedUsername = storedUsername.replace('@', '').toLowerCase();
    const telegramValue = telegramId ? String(telegramId).trim() : null;

    const existingByUsername = await pool.query(
      `SELECT id FROM admins WHERE LOWER(REPLACE(COALESCE(username, ''), '@', '')) = $1`,
      [normalizedUsername]
    );

    if (existingByUsername.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un administrador con ese username' });
    }

    if (telegramValue) {
      const existingByTelegram = await pool.query(
        'SELECT id FROM admins WHERE telegram_id = $1',
        [telegramValue]
      );

      if (existingByTelegram.rows.length > 0) {
        return res.status(400).json({ error: 'Ya existe un administrador con ese Telegram ID' });
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO admins (username, telegram_id, role, active)
       VALUES ($1, $2, $3, true)
       RETURNING id, username, telegram_id, role, active, created_at`,
      [storedUsername, telegramValue, normalizedRole]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ error: 'Error al crear administrador' });
  }
}

module.exports = { getAll, update, create };


