const pool = require('../db/connection');

// Get arguments from command line
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Uso: node add-admin.js <telegram_id> [username]');
  console.log('Ejemplo: node add-admin.js 123456789 @usuario');
  process.exit(1);
}

const telegramId = args[0];
const username = args[1] || `user_${telegramId}`;

async function addAdmin() {
  try {
    console.log(`Agregando admin: ${username} (Telegram ID: ${telegramId})...`);
    
    // Check if admin already exists
    const existing = await pool.query(
      'SELECT * FROM admins WHERE telegram_id = $1 OR username = $2',
      [telegramId, username]
    );
    
    if (existing.rows.length > 0) {
      // Update existing
      await pool.query(
        'UPDATE admins SET telegram_id = $1, username = $2 WHERE id = $3',
        [telegramId, username, existing.rows[0].id]
      );
      console.log(`✅ Admin actualizado: ${username}`);
    } else {
      // Insert new
      await pool.query(
        'INSERT INTO admins (username, telegram_id) VALUES ($1, $2)',
        [username, telegramId]
      );
      console.log(`✅ Admin agregado: ${username}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addAdmin();

