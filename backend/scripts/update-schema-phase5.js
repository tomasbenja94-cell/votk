/* eslint-disable no-console */
const pool = require('../db/connection');

async function run() {
  console.log('🚀 Iniciando actualización de esquema (Fase 5 - Webhooks)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      event TEXT NOT NULL,
      secret TEXT,
      active BOOLEAN DEFAULT true,
      headers JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_webhooks_event ON webhooks(event)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active)');

  console.log('✅ Esquema actualizado correctamente (Fase 5)');
  process.exit(0);
}

run().catch((error) => {
  console.error('❌ Error actualizando esquema (Fase 5):', error);
  process.exit(1);
});

