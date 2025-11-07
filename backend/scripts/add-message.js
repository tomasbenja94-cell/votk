const pool = require('../db/connection');

async function addMessage() {
  try {
    await pool.query(`
      INSERT INTO bot_messages (key, message, description, category) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (key) 
      DO UPDATE SET message = EXCLUDED.message, description = EXCLUDED.description
    `, [
      'pagar_sin_saldo',
      '❌ No tienes saldo disponible.\n\nTu saldo actual: {saldo} USDT\n\nPrimero debes cargar saldo usando /cargar',
      'Sin saldo para pagar',
      'pagar'
    ]);
    
    console.log('✅ Message added successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

addMessage();
