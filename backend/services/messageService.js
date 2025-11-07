const pool = require('../db/connection');

class MessageService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
    this.lastCacheUpdate = 0;
  }

  async getMessage(key, variables = {}) {
    try {
      // Check cache first
      const now = Date.now();
      if (now - this.lastCacheUpdate < this.cacheTimeout && this.cache.has(key)) {
        let message = this.cache.get(key);
        return this.replaceVariables(message, variables);
      }

      // Get from database
      const result = await pool.query(
        'SELECT message FROM bot_messages WHERE key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        console.warn(`Message key not found: ${key}`);
        return `[Mensaje no configurado: ${key}]`;
      }

      const message = result.rows[0].message;
      
      // Update cache
      this.cache.set(key, message);
      this.lastCacheUpdate = now;

      return this.replaceVariables(message, variables);
    } catch (error) {
      console.error('Error getting message:', error);
      return `[Error al obtener mensaje: ${key}]`;
    }
  }

  replaceVariables(message, variables) {
    let result = message;
    
    // Replace {variable} with actual values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, value);
    }

    // Convert \n to actual newlines (handle both escaped and literal)
    result = result.replace(/\\n/g, '\n');
    result = result.replace(/\\t/g, '\t');
    result = result.replace(/\\r/g, '\r');

    return result;
  }

  async getAllMessages() {
    try {
      const result = await pool.query(
        'SELECT * FROM bot_messages ORDER BY category, key'
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting all messages:', error);
      return [];
    }
  }

  async updateMessage(key, message) {
    try {
      await pool.query(
        'UPDATE bot_messages SET message = $1, updated_at = NOW() WHERE key = $2',
        [message, key]
      );
      
      // Clear entire cache to ensure fresh data
      this.clearCache();
      
      return true;
    } catch (error) {
      console.error('Error updating message:', error);
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }
}

module.exports = new MessageService();
