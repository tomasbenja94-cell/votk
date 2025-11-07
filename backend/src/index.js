const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const routes = require('../api/routes');
const { startBot } = require('../bot/bot');
const pool = require('../db/connection');
const autoCancelService = require('../services/autoCancelService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function initialize() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Start bot (don't fail if bot has issues)
    startBot().catch((error) => {
      console.error('⚠️  Bot error (continuing anyway):', error.message);
      console.log('💡 The web panel will still work. Fix bot issues separately.');
    });

    // Start auto-cancel service for old orders
    autoCancelService.start();

    // Start server
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ API available at http://localhost:${PORT}/api`);
      console.log(`✅ Web panel: http://localhost:3000`);
    });
  } catch (error) {
    console.error('❌ Initialization error:', error);
    process.exit(1);
  }
}

initialize();

