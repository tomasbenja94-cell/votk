const pool = require('../../db/connection');
const auditLogger = require('../../services/auditLogger');

const ALLOWED_EVENTS = ['transactions.created', 'transactions.status_changed', '*'];

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (typeof key === 'string' && key.trim().length > 0 && value !== undefined && value !== null) {
      acc[key.trim()] = String(value);
    }
    return acc;
  }, {});
}

async function getAll(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, url, event, secret IS NOT NULL AS has_secret, active, headers, created_at, updated_at
       FROM webhooks
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({ error: 'Error al obtener webhooks' });
  }
}

async function create(req, res) {
  try {
    const { name, url, event, secret, headers, active = true } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return res.status(400).json({ error: 'Nombre inválido (mínimo 3 caracteres)' });
    }

    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'URL inválida. Debe comenzar con http:// o https://' });
    }

    if (!event || !ALLOWED_EVENTS.includes(event)) {
      return res.status(400).json({ error: 'Evento inválido' });
    }

    const sanitizedHeaders = sanitizeHeaders(headers);

    const result = await pool.query(
      `INSERT INTO webhooks (name, url, event, secret, active, headers)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, url, event, secret IS NOT NULL AS has_secret, active, headers, created_at, updated_at`,
      [name.trim(), url.trim(), event, secret ? secret.trim() : null, active, sanitizedHeaders]
    );

    await auditLogger.log(
      req.user.username,
      'webhook_create',
      { id: result.rows[0].id, name: result.rows[0].name, event: result.rows[0].event }
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({ error: 'Error al crear webhook' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, url, event, secret, headers, active } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID requerido' });
    }

    const existing = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook no encontrado' });
    }

    const updates = {
      name: name !== undefined ? name : existing.rows[0].name,
      url: url !== undefined ? url : existing.rows[0].url,
      event: event !== undefined ? event : existing.rows[0].event,
      secret: secret === '' ? null : (secret !== undefined ? secret : existing.rows[0].secret),
      headers: headers !== undefined ? sanitizeHeaders(headers) : existing.rows[0].headers,
      active: typeof active === 'boolean' ? active : existing.rows[0].active
    };

    if (!updates.name || updates.name.trim().length < 3) {
      return res.status(400).json({ error: 'Nombre inválido (mínimo 3 caracteres)' });
    }

    if (!updates.url || !isValidUrl(updates.url)) {
      return res.status(400).json({ error: 'URL inválida. Debe comenzar con http:// o https://' });
    }

    if (!updates.event || !ALLOWED_EVENTS.includes(updates.event)) {
      return res.status(400).json({ error: 'Evento inválido' });
    }

    const result = await pool.query(
      `UPDATE webhooks
       SET name = $1,
           url = $2,
           event = $3,
           secret = $4,
           headers = $5,
           active = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, url, event, secret IS NOT NULL AS has_secret, active, headers, created_at, updated_at`,
      [
        updates.name.trim(),
        updates.url.trim(),
        updates.event,
        updates.secret ? updates.secret.trim() : null,
        updates.headers,
        updates.active,
        id
      ]
    );

    await auditLogger.log(
      req.user.username,
      'webhook_update',
      { id: result.rows[0].id, name: result.rows[0].name, event: result.rows[0].event }
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({ error: 'Error al actualizar webhook' });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'ID requerido' });
    }

    const existing = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook no encontrado' });
    }

    await pool.query('DELETE FROM webhooks WHERE id = $1', [id]);

    await auditLogger.log(
      req.user.username,
      'webhook_delete',
      { id: existing.rows[0].id, name: existing.rows[0].name, event: existing.rows[0].event }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Error al eliminar webhook' });
  }
}

function listEvents(req, res) {
  res.json(ALLOWED_EVENTS);
}

module.exports = {
  getAll,
  create,
  update,
  remove,
  listEvents,
  ALLOWED_EVENTS
};

