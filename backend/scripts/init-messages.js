const pool = require('../db/connection');
const fs = require('fs');
const path = require('path');

async function initializeMessages() {
  try {
    console.log('Initializing bot messages...');
    
    // Read messages schema
    const schemaPath = path.join(__dirname, '../db/messages_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    await pool.query(schema);
    
    console.log('✅ Bot messages initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing messages:', error);
    process.exit(1);
  }
}

initializeMessages();
