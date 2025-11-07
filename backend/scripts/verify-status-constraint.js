const pool = require('../db/connection');

async function verifyConstraint() {
  try {
    const result = await pool.query(`
      SELECT constraint_name, pg_get_constraintdef(oid) as definition 
      FROM pg_constraint 
      WHERE conrelid = 'transactions'::regclass 
      AND contype = 'c' 
      AND conname LIKE '%status%'
    `);
    
    console.log('Current constraint:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    // Test if 'admitido' is allowed
    const testResult = await pool.query(`
      SELECT 'admitido'::text = ANY(ARRAY['pendiente','procesando','admitido','pagado','cancelado']::text[]) as is_allowed
    `);
    
    console.log('\nIs "admitido" allowed?', testResult.rows[0].is_allowed);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verifyConstraint();

