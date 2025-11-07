const pool = require('../db/connection');

async function addBansTable() {
  try {
    // Create banned_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS banned_users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        username TEXT,
        banned_by BIGINT NOT NULL,
        banned_by_username TEXT,
        reason TEXT,
        banned_until TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(telegram_id)
      );
    `);

    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_banned_users_telegram_id ON banned_users(telegram_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_banned_users_banned_until ON banned_users(banned_until);
    `);

    console.log('✅ Tabla banned_users creada exitosamente');
  } catch (error) {
    console.error('❌ Error al crear tabla banned_users:', error);
  } finally {
    pool.end();
  }
}

addBansTable();

