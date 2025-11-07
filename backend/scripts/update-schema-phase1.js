const pool = require('../db/connection');

async function updateSchemaPhase1() {
  console.log('🚀 Iniciando actualización de esquema (Fase 1)');

  try {
    // Users table - notification preferences
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS notify_instant BOOLEAN DEFAULT true
    `);

    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN notify_instant SET DEFAULT true
    `);

    await pool.query(`
      UPDATE users SET notify_instant = true WHERE notify_instant IS NULL
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS notify_daily_summary BOOLEAN DEFAULT false
    `);

    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN notify_daily_summary SET DEFAULT false
    `);

    await pool.query(`
      UPDATE users SET notify_daily_summary = false WHERE notify_daily_summary IS NULL
    `);

    // Transactions table - stage timestamps
    await pool.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS admitted_at TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP
    `);

    console.log('✅ Esquema actualizado correctamente');
  } catch (error) {
    console.error('❌ Error actualizando el esquema:', error);
  } finally {
    await pool.end();
  }
}

updateSchemaPhase1();

