const messageService = require('../../services/messageService');
const auditLogger = require('../../services/auditLogger');

async function getAll(req, res) {
  try {
    const messages = await messageService.getAllMessages();
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(400).json({ error: 'Key and message are required' });
    }

    const success = await messageService.updateMessage(key, message);

    if (!success) {
      return res.status(500).json({ error: 'Failed to update message' });
    }

    // Clear cache to ensure changes take effect immediately
    messageService.clearCache();

    await auditLogger.log(
      req.user.username,
      'update_bot_message',
      { key }
    );

    res.json({ message: 'Message updated successfully. Changes will take effect immediately.' });
  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, update };
