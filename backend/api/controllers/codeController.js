const fs = require('fs');
const path = require('path');
const auditLogger = require('../../services/auditLogger');

const BACKEND_DIR = path.join(__dirname, '../../');

async function getFiles(req, res) {
  try {
    const files = [];
    
    function scanDirectory(dir, relativePath = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relative = path.join(relativePath, entry.name);
        
        // Skip node_modules, uploads, and other non-essential directories
        if (entry.name === 'node_modules' || entry.name === 'uploads' || 
            entry.name === '.git' || entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          scanDirectory(fullPath, relative);
        } else if (entry.isFile() && 
                   (entry.name.endsWith('.js') || entry.name.endsWith('.json') ||
                    entry.name.endsWith('.sql') || entry.name.endsWith('.jsx') ||
                    entry.name.endsWith('.css'))) {
          // Normalize path separators for web
          const webPath = relative.replace(/\\/g, '/');
          files.push({
            path: webPath,
            name: entry.name,
            type: entry.name.split('.').pop(),
            fullPath: relative
          });
        }
      }
    }
    
    scanDirectory(BACKEND_DIR);
    
    res.json(files);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getFile(req, res) {
  try {
    const { file } = req.params;
    // Decode URL and normalize path separators
    const decodedFile = decodeURIComponent(file);
    const normalizedFile = decodedFile.replace(/\//g, path.sep);
    const filePath = path.join(BACKEND_DIR, normalizedFile);
    
    // Normalize paths for comparison
    const normalizedBackendDir = path.normalize(BACKEND_DIR);
    const normalizedFilePath = path.normalize(filePath);
    
    // Security: prevent directory traversal
    if (!normalizedFilePath.startsWith(normalizedBackendDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found: ' + filePath });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    res.json({ content, path: file });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}

async function updateFile(req, res) {
  try {
    const { file } = req.params;
    const { content } = req.body;
    
    // Decode URL and normalize path separators
    const decodedFile = decodeURIComponent(file);
    const normalizedFile = decodedFile.replace(/\//g, path.sep);
    const filePath = path.join(BACKEND_DIR, normalizedFile);
    
    // Normalize paths for comparison
    const normalizedBackendDir = path.normalize(BACKEND_DIR);
    const normalizedFilePath = path.normalize(filePath);
    
    // Security: prevent directory traversal
    if (!normalizedFilePath.startsWith(normalizedBackendDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Create backup
    if (fs.existsSync(filePath)) {
      const backupPath = filePath + '.backup.' + Date.now();
      fs.copyFileSync(filePath, backupPath);
    }
    
    // Write new content
    fs.writeFileSync(filePath, content, 'utf8');
    
    await auditLogger.log(
      req.user.username,
      'update_code',
      { file, backupCreated: true }
    );
    
    res.json({ message: 'File updated successfully' });
  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}

module.exports = { getFiles, getFile, updateFile };

