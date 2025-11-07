const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Try to connect to default postgres database first to create our database
async function createDatabase() {
  const adminPool = new Pool({
    connectionString: process.env.DATABASE_URL?.replace(/\/binopolis_pay/, '/postgres') || 
                     'postgresql://postgres:postgres@localhost:5432/postgres',
    ssl: false
  });

  try {
    console.log('Attempting to create database...');
    await adminPool.query('CREATE DATABASE binopolis_pay');
    console.log('✅ Database created successfully');
  } catch (error) {
    if (error.code === '42P04') {
      console.log('ℹ️  Database already exists, continuing...');
    } else {
      console.error('❌ Error creating database:', error.message);
      console.log('\n💡 Please create the database manually:');
      console.log('   Option 1: Install PostgreSQL and run: createdb binopolis_pay');
      console.log('   Option 2: Use pgAdmin to create database "binopolis_pay"');
      console.log('   Option 3: Use Docker: docker-compose up -d postgres');
      throw error;
    }
  } finally {
    await adminPool.end();
  }
}

async function initializeDatabase() {
  try {
    // Try to create database first
    try {
      await createDatabase();
    } catch (error) {
      // Continue if database creation fails - it might already exist
      console.log('Continuing with schema initialization...');
    }

    // Now connect to our database and run schema
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 
                       'postgresql://postgres:postgres@localhost:5432/binopolis_pay',
      ssl: false
    });

    console.log('Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Read and execute schema
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Executing schema...');
    await pool.query(schema);
    
    console.log('✅ Database initialized successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure PostgreSQL is installed and running');
    console.log('   2. Check your DATABASE_URL in .env file');
    console.log('   3. Verify PostgreSQL credentials are correct');
    console.log('   4. Try: npm run init-db');
    process.exit(1);
  }
}

initializeDatabase();

