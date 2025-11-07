const pool = require('../db/connection');

class AuditLogger {
  async log(actor, action, details = null) {
    try {
      await pool.query(
        'INSERT INTO audit_logs (actor, action, details) VALUES ($1, $2, $3)',
        [actor, action, details ? JSON.stringify(details) : null]
      );
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }

  async getLogs(limit = 100, offset = 0, actor = null) {
    try {
      let query = 'SELECT * FROM audit_logs';
      const params = [];
      
      if (actor) {
        query += ' WHERE actor = $1';
        params.push(actor);
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }
}

module.exports = new AuditLogger();

