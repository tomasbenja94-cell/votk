const auditLogger = require('../../services/auditLogger');

async function getLogs(req, res) {
  try {
    const { limit = 100, offset = 0, actor } = req.query;
    
    const logs = await auditLogger.getLogs(
      parseInt(limit),
      parseInt(offset),
      actor || null
    );
    
    res.json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getLogs };

