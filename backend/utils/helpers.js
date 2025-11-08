const pool = require('../db/connection');

// Generate unique identifier for transactions
// Format: ORDEN #00 (using timestamp as counter)
function generateIdentifier() {
  // Use last 6 digits of timestamp as order number
  const timestamp = Date.now();
  const orderNumber = String(timestamp).slice(-6);
  const identifier = `ORDEN #${orderNumber}`;
  return identifier;
}

// Encode identifier for callback_data (replace spaces and # with safe characters)
function encodeIdentifier(identifier) {
  return identifier.replace(/#/g, '_HASH_').replace(/\s/g, '_SPACE_');
}

// Decode identifier from callback_data
function decodeIdentifier(encoded) {
  return encoded.replace(/_HASH_/g, '#').replace(/_SPACE_/g, ' ');
}

// Get admin context with role and active flag
async function getAdminContext(telegramId, username) {
  try {
    if (!telegramId && !username) {
      return null;
    }
    
    // Normalize username (remove @ if present, handle case insensitive)
    const normalizedUsername = username ? username.replace('@', '').toLowerCase() : null;
    
    // Check by telegram_id first (most reliable)
    if (telegramId) {
      const resultById = await pool.query(
        'SELECT * FROM admins WHERE telegram_id = $1',
        [telegramId.toString()]
      );
      if (resultById.rows.length > 0) {
        console.log(`Admin encontrado por telegram_id: ${telegramId}`);
        const admin = resultById.rows[0];
        if (admin.active === false) {
          return null;
        }
        if (!admin.role) {
          admin.role = 'superadmin';
        }
        return admin;
      }
    }
    
    // Check by username (case insensitive, with or without @)
    if (normalizedUsername) {
      const resultByUsername = await pool.query(
        `SELECT * FROM admins WHERE 
         LOWER(REPLACE(COALESCE(username, ''), '@', '')) = $1`,
        [normalizedUsername]
      );
      
      if (resultByUsername.rows.length > 0) {
        // Update telegram_id if it's missing
        const admin = resultByUsername.rows[0];
        if (!admin.telegram_id && telegramId) {
          await pool.query(
            'UPDATE admins SET telegram_id = $1 WHERE id = $2',
            [telegramId.toString(), admin.id]
          );
          console.log(`Admin actualizado: telegram_id agregado para ${admin.username}`);
          admin.telegram_id = telegramId.toString();
        }
        console.log(`Admin encontrado por username: ${normalizedUsername}`);
        if (admin.active === false) {
          return null;
        }
        if (!admin.role) {
          admin.role = 'superadmin';
        }
        return admin;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error checking admin:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      telegramId,
      username
    });
    return null;
  }
}

// Check if user is admin (legacy boolean helper)
async function isAdmin(telegramId, username) {
  const admin = await getAdminContext(telegramId, username);
  return !!admin;
}

// Get or create user
async function getOrCreateUser(telegramId, username) {
  try {
    if (!telegramId) {
      throw new Error('telegram_id is required');
    }

    // Normalize username (can be null)
    const normalizedUsername = username || null;

    let result = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    if (result.rows.length === 0) {
      // Create new user
      try {
        result = await pool.query(
          'INSERT INTO users (telegram_id, username, last_active, saldo_usdt) VALUES ($1, $2, NOW(), 0) RETURNING *',
          [telegramId, normalizedUsername]
        );
        console.log(`New user created: ${telegramId} (@${normalizedUsername || 'sin_username'})`);
      } catch (insertError) {
        console.error('Error inserting user:', insertError);
        // If insert fails, try to get the user again (maybe it was created by another process)
        result = await pool.query(
          'SELECT * FROM users WHERE telegram_id = $1',
          [telegramId]
        );
        if (result.rows.length === 0) {
          throw insertError; // Re-throw if still not found
        }
      }
    } else {
      // Update last active and username
      try {
        await pool.query(
          'UPDATE users SET last_active = NOW(), username = COALESCE($1, username) WHERE telegram_id = $2',
          [normalizedUsername, telegramId]
        );
        // Re-fetch to get updated data
        result = await pool.query(
          'SELECT * FROM users WHERE telegram_id = $1',
          [telegramId]
        );
      } catch (updateError) {
        console.warn('Error updating user (non-critical):', updateError.message);
        // Continue with existing data
      }
    }

    if (!result.rows || result.rows.length === 0) {
      throw new Error('User not found after creation/update');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting/creating user:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      telegramId,
      username
    });
    throw error;
  }
}

// Format currency
function formatCurrency(amount, currency = 'USDT') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'USDT' ? 'USD' : 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Format ARS amount with points and comma (Argentine format)
// Example: 1026600 -> "$1.026.600,00"
function formatARS(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '$0,00';
  
  // Split integer and decimal parts
  const parts = num.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  // Add points every 3 digits from right to left
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return `$${formattedInteger},${decimalPart}`;
}

function escapeMarkdown(text = '') {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text).replace(/([_*[\]()~`>#+=|{}])/g, '\\$1');
}

module.exports = {
  generateIdentifier,
  encodeIdentifier,
  decodeIdentifier,
  getAdminContext,
  isAdmin,
  getOrCreateUser,
  formatCurrency,
  formatARS,
  escapeMarkdown
};

