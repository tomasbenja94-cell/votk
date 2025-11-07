const pool = require('../db/connection');

async function checkCredentials() {
  try {
    console.log('🔍 Verificando credenciales del panel web...\n');

    // Verificar usuario
    const userResult = await pool.query(
      "SELECT value FROM config WHERE key = 'web_user'"
    );
    
    // Verificar contraseña
    const passResult = await pool.query(
      "SELECT value FROM config WHERE key = 'web_pass'"
    );

    if (userResult.rows.length === 0) {
      console.log('⚠️  Usuario no configurado');
      console.log('💡 Se inicializará automáticamente en el próximo login');
      console.log('   Usuario por defecto: flipendo\n');
    } else {
      console.log(`✅ Usuario configurado: ${userResult.rows[0].value}`);
    }

    if (passResult.rows.length === 0) {
      console.log('⚠️  Contraseña no configurada');
      console.log('💡 Se inicializará automáticamente en el próximo login');
      console.log('   Contraseña por defecto: fucker123\n');
    } else {
      console.log(`✅ Contraseña configurada: ${'*'.repeat(passResult.rows[0].value.length)}`);
    }

    if (userResult.rows.length > 0 && passResult.rows.length > 0) {
      console.log('\n📋 Credenciales actuales:');
      console.log(`   Usuario: ${userResult.rows[0].value}`);
      console.log(`   Contraseña: ${passResult.rows[0].value}`);
      console.log('\n💡 Puedes cambiar estas credenciales desde el panel web o directamente en la base de datos.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error verificando credenciales:', error);
    process.exit(1);
  }
}

checkCredentials();

