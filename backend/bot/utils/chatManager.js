/**
 * Gestor de limpieza de chat y mensajes
 */

class ChatManager {
  constructor() {
    this.userMessages = new Map(); // userId -> [messageIds]
    this.botMessages = new Map(); // userId -> [messageIds]
    this.mainMenuMessages = new Map(); // userId -> { chatId, messageId }
  }

  /**
   * Registra un mensaje del usuario
   */
  registerUserMessage(userId, messageId) {
    if (!this.userMessages.has(userId)) {
      this.userMessages.set(userId, []);
    }
    this.userMessages.get(userId).push(messageId);
    // Keep only last 10 messages to avoid memory issues
    if (this.userMessages.get(userId).length > 10) {
      this.userMessages.set(userId, this.userMessages.get(userId).slice(-10));
    }
  }

  /**
   * Registra un mensaje del bot
   */
  registerBotMessage(userId, messageId) {
    if (!messageId) return;
    if (!this.botMessages.has(userId)) {
      this.botMessages.set(userId, []);
    }
    // Evitar duplicados
    if (!this.botMessages.get(userId).includes(messageId)) {
      this.botMessages.get(userId).push(messageId);
    }
    // Keep only last 50 messages to avoid memory issues (aumentado para mejor limpieza)
    if (this.botMessages.get(userId).length > 50) {
      this.botMessages.set(userId, this.botMessages.get(userId).slice(-50));
    }
  }

  /**
   * Limpia mensajes anteriores del usuario y del bot
   */
  async cleanChat(ctx, userId, keepLast = 0) {
    try {
      const chatId = ctx.chat.id;
      
      // Limpiar mensajes del bot (eliminar TODOS si keepLast = 0)
      const botMsgs = this.botMessages.get(userId) || [];
      const messagesToDelete = keepLast > 0 ? botMsgs.slice(0, botMsgs.length - keepLast) : [...botMsgs];
      
      // Eliminar mensajes con un pequeño delay para evitar rate limits
      for (const messageId of messagesToDelete) {
        try {
          await ctx.telegram.deleteMessage(chatId, messageId);
          // Pequeño delay para evitar rate limits
          await this.sleep(50);
        } catch (error) {
          // Ignorar errores si el mensaje ya no existe o fue eliminado
          if (error.response?.error_code !== 400 && error.response?.error_code !== 404) {
            console.warn(`Error deleting message ${messageId}:`, error.message);
          }
        }
      }
      
      // Actualizar la lista de mensajes
      if (keepLast > 0) {
        this.botMessages.set(userId, botMsgs.slice(-keepLast));
      } else {
        this.botMessages.set(userId, []);
      }
      if (keepLast === 0) {
        this.clearMainMenuMessage(userId);
      }

      // Limpiar mensajes del usuario (solo los que podemos eliminar)
      const userMsgs = this.userMessages.get(userId) || [];
      for (const messageId of userMsgs) {
        try {
          await ctx.telegram.deleteMessage(chatId, messageId);
          await this.sleep(50);
        } catch (error) {
          // No podemos eliminar mensajes del usuario en chats privados
          // Ignorar errores silenciosamente
        }
      }
      this.userMessages.set(userId, []);
    } catch (error) {
      console.error('Error cleaning chat:', error);
    }
  }

  /**
   * Elimina todos los mensajes del bot de un usuario (método más agresivo)
   * Intenta eliminar mensajes en un rango razonable
   */
  async deleteAllBotMessages(telegram, chatId, userId) {
    try {
      const botMsgs = this.botMessages.get(userId) || [];
      
      console.log(`Deleting ${botMsgs.length} bot messages for user ${userId}`);
      
      // Eliminar todos los mensajes registrados
      const deletePromises = [];
      for (const messageId of botMsgs) {
        deletePromises.push(
          telegram.deleteMessage(chatId, messageId).catch(error => {
            // Ignorar errores si el mensaje no existe o ya fue eliminado
            if (error.response?.error_code !== 400 && 
                error.response?.error_code !== 404 && 
                !error.message.includes('message to delete not found')) {
              console.warn(`Error deleting bot message ${messageId}:`, error.message);
            }
            return null; // Retornar null para indicar que falló pero continuar
          })
        );
      }
      
      // Ejecutar eliminaciones en paralelo con un pequeño delay entre grupos
      const batchSize = 5;
      for (let i = 0; i < deletePromises.length; i += batchSize) {
        const batch = deletePromises.slice(i, i + batchSize);
        await Promise.all(batch);
        if (i + batchSize < deletePromises.length) {
          await this.sleep(100); // Delay entre batches
        }
      }
      
      // Limpiar el historial
      this.botMessages.set(userId, []);
      
      console.log(`Successfully processed deletion of bot messages for user ${userId}`);
      
      return true;
    } catch (error) {
      console.error('Error in deleteAllBotMessages:', error);
      return false;
    }
  }

  /**
   * Helper para enviar mensaje y registrar automáticamente
   */
  async sendMessageAndRegister(telegram, chatId, userId, message, options = {}) {
    try {
      const result = await telegram.sendMessage(chatId, message, options);
      if (result && result.message_id && userId) {
        this.registerBotMessage(userId, result.message_id);
      }
      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpia todo el historial de un usuario
   */
  clearHistory(userId) {
    this.userMessages.set(userId, []);
    this.botMessages.set(userId, []);
    this.clearMainMenuMessage(userId);
  }

  setMainMenuMessage(userId, chatId, messageId) {
    if (!userId || !messageId) return;
    this.mainMenuMessages.set(userId, { chatId, messageId });
  }

  getMainMenuMessage(userId) {
    return this.mainMenuMessages.get(userId) || null;
  }

  clearMainMenuMessage(userId) {
    this.mainMenuMessages.delete(userId);
  }
}

module.exports = new ChatManager();
