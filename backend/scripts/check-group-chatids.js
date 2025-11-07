const pool = require('../db/connection');

async function checkGroupChatIds() {
  try {
    const result = await pool.query(
      "SELECT key, value FROM config WHERE key LIKE 'group_chat_id_%'"
    );
    
    console.log('Grupos configurados:');
    result.rows.forEach(row => {
      console.log(`  ${row.key.replace('group_chat_id_', '')}: ${row.value}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkGroupChatIds();

