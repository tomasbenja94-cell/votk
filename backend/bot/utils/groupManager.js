const config = require('../../config/default.json');

/**
 * Manager para grupos de administración
 */
class GroupManager {
  constructor() {
    // Cache de chat_ids de grupos
    // Formato: { "invite_link": "chat_id" }
    this.groupChatIds = new Map();
  }

  /**
   * Obtiene el chat_id de un grupo desde su link de invitación
   * Nota: Los links de invitación no se pueden convertir directamente a chat_id
   * El chat_id debe obtenerse cuando el bot recibe un mensaje del grupo
   * 
   * Para obtener el chat_id manualmente:
   * 1. Agregar el bot al grupo
   * 2. Enviar un mensaje al grupo
   * 3. Ver el chat_id en los logs o usar @userinfobot
   * 
   * Alternativamente, el chat_id se puede obtener del objeto ctx.update cuando
   * el bot recibe un mensaje del grupo
   */
  async getGroupChatId(bot, inviteLink) {
    // Si ya tenemos el chat_id en cache, lo retornamos
    if (this.groupChatIds.has(inviteLink)) {
      return this.groupChatIds.get(inviteLink);
    }

    // Intentar obtener el chat_id de la base de datos
    try {
      const pool = require('../../db/connection');
      const result = await pool.query(
        'SELECT value FROM config WHERE key = $1',
        [`group_chat_id_${inviteLink}`]
      );
      
      if (result.rows.length > 0) {
        const chatId = result.rows[0].value;
        this.groupChatIds.set(inviteLink, chatId);
        return chatId;
      }
    } catch (error) {
      console.error('Error getting group chat_id from DB:', error);
    }

    // Si no tenemos el chat_id, retornamos null
    // El administrador debe configurarlo manualmente
    return null;
  }

  /**
   * Guarda el chat_id de un grupo
   */
  async saveGroupChatId(inviteLink, chatId) {
    try {
      const pool = require('../../db/connection');
      await pool.query(
        `INSERT INTO config (key, value, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`group_chat_id_${inviteLink}`, chatId.toString()]
      );
      this.groupChatIds.set(inviteLink, chatId.toString());
      return true;
    } catch (error) {
      console.error('Error saving group chat_id:', error);
      return false;
    }
  }

  /**
   * Envía un mensaje a todos los grupos de administración
   */
  async sendToAdminGroups(bot, message, options = {}) {
    const adminGroups = config.admin_groups || [];
    const results = [];

    for (const inviteLink of adminGroups) {
      try {
        const chatId = await this.getGroupChatId(bot, inviteLink);
        
        if (chatId) {
          try {
            const baseOptions = options ? { ...options } : {};
            const sent = await bot.telegram.sendMessage(chatId, message, baseOptions);
            results.push({ inviteLink, success: true, messageId: sent.message_id });
          } catch (error) {
            console.error(`Error sending message to group ${inviteLink}:`, error.message);
            if (
              error.code === 400 &&
              typeof error.description === 'string' &&
              error.description.includes("can't parse entities")
            ) {
              try {
                const fallbackOptions = options ? { ...options } : {};
                delete fallbackOptions.parse_mode;
                const sentFallback = await bot.telegram.sendMessage(chatId, message, fallbackOptions);
                console.log(`✅ Resent message to ${inviteLink} without parse_mode due to formatting issues`);
                results.push({ inviteLink, success: true, messageId: sentFallback.message_id, fallback: true });
                continue;
              } catch (fallbackError) {
                console.error(`Fallback send failed for group ${inviteLink}:`, fallbackError.message);
                results.push({ inviteLink, success: false, error: fallbackError.message });
                continue;
              }
            }
            results.push({ inviteLink, success: false, error: error.message });
          }
        } else {
          console.warn(`Chat ID not found for group: ${inviteLink}`);
          console.warn(`To set the chat_id, use the /setgroupchatid command in the group`);
          results.push({ inviteLink, success: false, error: 'Chat ID not configured' });
        }
      } catch (error) {
        console.error(`Error processing group ${inviteLink}:`, error);
        results.push({ inviteLink, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Envía una foto con mensaje a todos los grupos de administración
   */
  async sendPhotoToAdminGroups(bot, photoBuffer, caption, options = {}) {
    const adminGroups = config.admin_groups || [];
    const results = [];

    for (const inviteLink of adminGroups) {
      try {
        const chatId = await this.getGroupChatId(bot, inviteLink);
        
        if (chatId) {
          try {
            const payload = { caption, ...(options || {}) };
            const sent = await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, payload);
            results.push({ inviteLink, success: true, messageId: sent.message_id });
          } catch (error) {
            console.error(`Error sending photo to group ${inviteLink}:`, error.message);
            if (
              error.code === 400 &&
              typeof error.description === 'string' &&
              error.description.includes("can't parse entities")
            ) {
              try {
                const fallbackOptions = { ...options };
                const fallbackPayload = { caption, ...fallbackOptions };
                delete fallbackPayload.parse_mode;
                const sentFallback = await bot.telegram.sendPhoto(chatId, { source: photoBuffer }, fallbackPayload);
                console.log(`✅ Resent photo to ${inviteLink} without parse_mode due to formatting issues`);
                results.push({ inviteLink, success: true, messageId: sentFallback.message_id, fallback: true });
                continue;
              } catch (fallbackError) {
                console.error(`Fallback photo send failed for group ${inviteLink}:`, fallbackError.message);
                results.push({ inviteLink, success: false, error: fallbackError.message });
                continue;
              }
            }
            results.push({ inviteLink, success: false, error: error.message });
          }
        } else {
          console.warn(`Chat ID not found for group: ${inviteLink}`);
          results.push({ inviteLink, success: false, error: 'Chat ID not configured' });
        }
      } catch (error) {
        console.error(`Error processing group ${inviteLink}:`, error);
        results.push({ inviteLink, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Envía una foto a los grupos de transferencias
   */
  async sendPhotoToTransferGroups(bot, fileId, caption, options = {}) {
    const transferGroups = config.transfer_groups || [];
    const results = [];

    for (const inviteLink of transferGroups) {
      try {
        const chatId = await this.getGroupChatId(bot, inviteLink);
        
        if (chatId) {
          try {
            const payload = { caption, ...(options || {}) };
            const sent = await bot.telegram.sendPhoto(chatId, fileId, payload);
            results.push({ inviteLink, success: true, messageId: sent.message_id });
          } catch (error) {
            console.error(`Error sending photo to transfer group ${inviteLink}:`, error.message);
            if (
              error.code === 400 &&
              typeof error.description === 'string' &&
              error.description.includes("can't parse entities")
            ) {
              try {
                const fallbackOptions = { ...options };
                const fallbackPayload = { caption, ...fallbackOptions };
                delete fallbackPayload.parse_mode;
                const sentFallback = await bot.telegram.sendPhoto(chatId, fileId, fallbackPayload);
                console.log(`✅ Resent photo to transfer group ${inviteLink} without parse_mode due to formatting issues`);
                results.push({ inviteLink, success: true, messageId: sentFallback.message_id, fallback: true });
                continue;
              } catch (fallbackError) {
                console.error(`Fallback transfer photo send failed for group ${inviteLink}:`, fallbackError.message);
                results.push({ inviteLink, success: false, error: fallbackError.message });
                continue;
              }
            }
            results.push({ inviteLink, success: false, error: error.message });
          }
        } else {
          console.warn(`Chat ID not found for transfer group: ${inviteLink}`);
          results.push({ inviteLink, success: false, error: 'Chat ID not configured' });
        }
      } catch (error) {
        console.error(`Error processing transfer group ${inviteLink}:`, error);
        results.push({ inviteLink, success: false, error: error.message });
      }
    }

    return results;
  }
}

module.exports = new GroupManager();
