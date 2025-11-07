const pool = require('../db/connection');

async function fixConstraint() {
  try {
    console.log('Actualizando constraint de status...');
    
    // Drop old constraint
    await pool.query(`
      ALTER TABLE transactions 
      DROP CONSTRAINT IF EXISTS transactions_status_check;
    `);
    
    // Add new constraint with 'admitido'
    await pool.query(`
      ALTER TABLE transactions 
      ADD CONSTRAINT transactions_status_check 
      CHECK (status IN ('pendiente','procesando','admitido','pagado','cancelado'));
    `);
    
    console.log('✅ Constraint actualizado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixConstraint();

