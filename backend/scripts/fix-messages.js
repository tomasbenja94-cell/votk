const pool = require('../db/connection');

async function fixMessages() {
  try {
    console.log('Fixing message newlines...');
    
    // Get all messages
    const result = await pool.query('SELECT key, message FROM bot_messages');
    
    for (const row of result.rows) {
      // Replace literal \n with actual newlines
      const fixedMessage = row.message.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      
      // Update if changed
      if (fixedMessage !== row.message) {
        await pool.query(
          'UPDATE bot_messages SET message = $1 WHERE key = $2',
          [fixedMessage, row.key]
        );
        console.log(`✅ Fixed: ${row.key}`);
      }
    }
    
    console.log('✅ All messages fixed!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixMessages();
