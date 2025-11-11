const pool = require('../db/connection');

(async () => {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS fee_percentage NUMERIC(5,2) DEFAULT 20
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS fee_min_amount_ars NUMERIC(18,2) DEFAULT 0
    `);

    console.log('✅ Columnas fee_percentage y fee_min_amount_ars verificadas.');
  } catch (error) {
    console.error('❌ Error actualizando columnas de usuarios:', error);
  } finally {
    await pool.end();
  }
})();

