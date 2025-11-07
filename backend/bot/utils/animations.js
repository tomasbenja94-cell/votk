/**
 * Sistema de animaciones para mensajes del bot
 */

class AnimationManager {
  constructor() {
    this.animations = new Map();
  }

  /**
   * Muestra una animación de progreso en un mensaje
   * @param {Context} ctx - Contexto de Telegraf
   * @param {number} messageId - ID del mensaje a editar
   * @param {string} baseText - Texto base del mensaje
   * @param {number} duration - Duración en ms (default: 2000)
   * @param {number} steps - Número de pasos (default: 4)
   */
  async showProgress(ctx, messageId, baseText, duration = 2000, steps = 4) {
    const delay = duration / steps;
    
    for (let i = 0; i <= steps; i++) {
      const progress = Math.round((i / steps) * 100);
      const bars = Math.round((i / steps) * 20);
      const filledBars = '▓'.repeat(bars);
      const emptyBars = '▒'.repeat(20 - bars);
      
      const text = `${baseText}\n\n[${filledBars}${emptyBars}] ${progress}%`;
      
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          messageId,
          null,
          text,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        // Si el mensaje no se puede editar, continuar
        console.error('Error editing message:', error.message);
        break;
      }
      
      if (i < steps) {
        await this.sleep(delay);
      }
    }
  }

  /**
   * Muestra animación de "Procesando..."
   */
  async showProcessing(ctx, messageId, action = 'Procesando') {
    const phases = [
      `${action}...`,
      `${action}...`,
      `${action}...`,
    ];
    
    for (const phase of phases) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          messageId,
          null,
          `[+] ${phase}`,
          { parse_mode: 'Markdown' }
        );
        await this.sleep(500);
      } catch (error) {
        break;
      }
    }
  }

  /**
   * Actualiza mensaje con resultado final
   */
  async showResult(ctx, messageId, success, message) {
    const icon = success ? '✅' : '❌';
    const text = `${icon} ${message}`;
    
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        text,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error showing result:', error.message);
    }
  }

  /**
   * Muestra un contador de progreso durante 1 minuto (60 segundos)
   * @param {Context} ctx - Contexto de Telegraf
   * @param {number} messageId - ID del mensaje a editar
   * @param {string} baseText - Texto base del mensaje
   * @param {number} durationSeconds - Duración en segundos (default: 60)
   */
  async showCountdown(ctx, messageId, baseText, durationSeconds = 60) {
    const totalSteps = durationSeconds; // 60 pasos de 1 segundo cada uno
    
    for (let i = 0; i <= totalSteps; i++) {
      const remaining = durationSeconds - i;
      const progress = Math.round((i / totalSteps) * 100);
      const bars = Math.round((i / totalSteps) * 20);
      const filledBars = '█'.repeat(bars);
      const emptyBars = '▒'.repeat(20 - bars);
      
      const text = `${baseText}\n\n[${filledBars}${emptyBars}] ${progress}%`;
      
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          messageId,
          null,
          text,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Error editing countdown message:', error.message);
        break;
      }
      
      if (i < totalSteps) {
        await this.sleep(1000); // 1 segundo entre actualizaciones
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AnimationManager();
