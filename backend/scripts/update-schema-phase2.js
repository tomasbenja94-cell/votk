const pool = require('../db/connection');

async function updateSchemaPhase2() {
  console.log('🚀 Iniciando actualización de esquema (Fase 2 - Roles de administradores)');

  try {
    await pool.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('superadmin','operador','auditor')) DEFAULT 'superadmin'
    `);

    await pool.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true
    `);

    await pool.query(`
      UPDATE admins
      SET role = 'superadmin'
      WHERE role IS NULL
    `);

    await pool.query(`
      UPDATE admins
      SET active = true
      WHERE active IS NULL
    `);

    console.log('✅ Esquema actualizado: roles y estado para administradores');
  } catch (error) {
    console.error('❌ Error actualizando esquema (fase 2):', error);
  } finally {
    await pool.end();
  }
}

updateSchemaPhase2();


