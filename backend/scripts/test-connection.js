const pool = require('../db/connection');
require('dotenv').config();

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL || 'Using default');
    
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result.rows[0].now);
    
    // Test if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('\n✅ Tables found:', tablesResult.rows.length);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure PostgreSQL is running');
    console.error('   2. Check DATABASE_URL in .env file');
    console.error('   3. If using Docker: docker-compose ps');
    process.exit(1);
  }
}

testConnection();
