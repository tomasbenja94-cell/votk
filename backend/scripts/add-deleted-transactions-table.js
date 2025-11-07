const pool = require('../db/connection');

async function addDeletedTransactionsTable() {
  try {
    // Create deleted_transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deleted_transactions (
        id SERIAL PRIMARY KEY,
        original_id INT,
        user_id INT,
        telegram_id BIGINT,
        username TEXT,
        type TEXT,
        amount_usdt NUMERIC(18,2),
        amount_ars NUMERIC(18,2),
        identifier TEXT,
        status TEXT,
        admin_id INT,
        proof_image TEXT,
        motivo TEXT,
        original_created_at TIMESTAMP,
        original_updated_at TIMESTAMP,
        deleted_at TIMESTAMP DEFAULT NOW(),
        deleted_by TEXT
      );
    `);

    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deleted_transactions_deleted_at ON deleted_transactions(deleted_at);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deleted_transactions_telegram_id ON deleted_transactions(telegram_id);
    `);

    console.log('✅ Tabla deleted_transactions creada exitosamente');
  } catch (error) {
    console.error('❌ Error al crear tabla deleted_transactions:', error);
  } finally {
    pool.end();
  }
}

addDeletedTransactionsTable();

