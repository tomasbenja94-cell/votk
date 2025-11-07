const pool = require('../db/connection');

async function testAdmitido() {
  try {
    // Try to update a test transaction to 'admitido' status
    const result = await pool.query(`
      UPDATE transactions 
      SET status = 'admitido' 
      WHERE id = (SELECT id FROM transactions ORDER BY id DESC LIMIT 1)
      RETURNING id, status
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Estado "admitido" funciona correctamente');
      console.log('Transaction ID:', result.rows[0].id, 'Status:', result.rows[0].status);
    } else {
      console.log('⚠️ No hay transacciones para probar');
    }
    
    process.exit(0);
  } catch (error) {
    if (error.code === '23514') {
      console.error('❌ Error: El estado "admitido" NO está permitido en el constraint');
      console.error('Detalle:', error.detail);
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

testAdmitido();

