const express = require('express');
const router = express.Router();
const authController = require('./controllers/authController');
const usersController = require('./controllers/usersController');
const walletsController = require('./controllers/walletsController');
const configController = require('./controllers/configController');
const dashboardController = require('./controllers/dashboardController');
const codeController = require('./controllers/codeController');
const auditController = require('./controllers/auditController');
const messagesController = require('./controllers/messagesController');
const walletTransactionsController = require('./controllers/walletTransactionsController');
const transactionsController = require('./controllers/transactionsController');
const adminsController = require('./controllers/adminsController');
const { authenticateToken } = require('./middleware/auth');

// Auth routes
router.post('/api/login', authController.login);

// Protected routes
router.get('/api/dashboard', authenticateToken, dashboardController.getStats);
router.get('/api/users', authenticateToken, usersController.getAll);
router.put('/api/users/:id', authenticateToken, usersController.update);
router.delete('/api/users/:id', authenticateToken, usersController.delete);
router.get('/api/users/:telegramId/balance', usersController.getBalance);
router.get('/api/status/:telegramId', usersController.getStatus);

router.get('/api/wallets', authenticateToken, walletsController.getAll);
router.post('/api/wallets', authenticateToken, walletsController.create);
router.put('/api/wallets/:id', authenticateToken, walletsController.update);
router.delete('/api/wallets/:id', authenticateToken, walletsController.delete);

router.get('/api/config', authenticateToken, configController.get);
router.put('/api/config', authenticateToken, configController.update);

router.get('/api/code', authenticateToken, codeController.getFiles);
router.get('/api/code/:file', authenticateToken, codeController.getFile);
router.put('/api/code/:file', authenticateToken, codeController.updateFile);

router.get('/api/audit', authenticateToken, auditController.getLogs);

router.get('/api/messages', authenticateToken, messagesController.getAll);
router.put('/api/messages', authenticateToken, messagesController.update);

router.get('/api/wallet-transactions', authenticateToken, walletTransactionsController.getTransactions);

router.get('/api/admins', authenticateToken, adminsController.getAll);
router.put('/api/admins/:id', authenticateToken, adminsController.update);

router.get('/api/transactions', authenticateToken, transactionsController.getAll);
router.put('/api/transactions/:id/status', authenticateToken, transactionsController.updateStatus);
router.post('/api/transactions/clear-all', authenticateToken, transactionsController.clearAll);
router.get('/api/transactions/deleted', authenticateToken, transactionsController.getDeleted);
router.get('/api/transactions/deleted/pdf', authenticateToken, transactionsController.downloadDeletedPDF);
router.get('/api/transactions/export', authenticateToken, transactionsController.exportTransactions);

module.exports = router;

