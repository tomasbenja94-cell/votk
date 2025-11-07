const pool = require('../db/connection');

async function checkAdmins() {
  try {
    console.log('Verificando admins en la base de datos...');
    
    const result = await pool.query('SELECT * FROM admins ORDER BY id');
    
    console.log('\n📋 Admins encontrados:');
    if (result.rows.length === 0) {
      console.log('  ⚠️  No hay admins en la base de datos');
    } else {
      result.rows.forEach(admin => {
        console.log(`  ID: ${admin.id}`);
        console.log(`  Username: ${admin.username}`);
        console.log(`  Telegram ID: ${admin.telegram_id || '❌ NO CONFIGURADO'}`);
        console.log('');
      });
    }
    
    // Test connection
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Conexión a la base de datos: OK');
    console.log(`   Hora del servidor: ${testResult.rows[0].now}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

checkAdmins();

