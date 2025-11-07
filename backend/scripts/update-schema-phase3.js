const pool = require('../db/connection');

async function updateSchemaPhase3() {
  console.log('🚀 Iniciando actualización de esquema (Fase 3 - Alertas de pendientes)');

  try {
    await pool.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMP
    `);

    await pool.query(`
      INSERT INTO config (key, value, updated_at)
      VALUES ('pending_alert_minutes', '45', NOW())
      ON CONFLICT (key) DO NOTHING
    `);

    await pool.query(`
      INSERT INTO config (key, value, updated_at)
      VALUES ('daily_summary_hour', '20', NOW())
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('✅ Esquema actualizado: columna alerted_at y configuración pending_alert_minutes');
  } catch (error) {
    console.error('❌ Error actualizando esquema (fase 3):', error);
  } finally {
    await pool.end();
  }
}

updateSchemaPhase3();


