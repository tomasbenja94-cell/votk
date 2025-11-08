const pool = require('../db/connection');
const groupManager = require('../bot/utils/groupManager');
const config = require('../config/default.json');
const webhookService = require('./webhookService');

/**
 * Servicio para cancelar automáticamente órdenes sin confirmar por más de 24 horas
 */
class AutoCancelService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Inicia el servicio de cancelación automática
   * Verifica cada hora si hay órdenes pendientes por más de 24 horas
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ AutoCancelService ya está corriendo');
      return;
    }

    console.log('✅ AutoCancelService iniciado - Verificando órdenes cada hora');
    
    // Verificar inmediatamente al iniciar
    this.checkAndCancelOldOrders();

    // Verificar cada hora (3600000 ms)
    this.intervalId = setInterval(() => {
      this.checkAndCancelOldOrders();
    }, 3600000); // 1 hora

    this.isRunning = true;
  }

  /**
   * Detiene el servicio
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ AutoCancelService detenido');
  }

  /**
   * Busca y cancela órdenes sin confirmar por más de 24 horas
   */
  async checkAndCancelOldOrders() {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      // Buscar transacciones en estado 'procesando' o 'pendiente' creadas hace más de 24 horas
      const result = await pool.query(
        `SELECT t.*, u.telegram_id, u.username 
         FROM transactions t 
         JOIN users u ON t.user_id = u.id 
         WHERE t.status IN ('procesando', 'pendiente') 
         AND t.created_at < $1 
         AND t.type = 'pago'`,
        [twentyFourHoursAgo]
      );

      const oldTransactions = result.rows;

      if (oldTransactions.length === 0) {
        console.log('✅ No hay órdenes antiguas para cancelar');
        return;
      }

      console.log(`📋 Encontradas ${oldTransactions.length} órdenes antiguas para cancelar`);

      for (const transaction of oldTransactions) {
        try {
          await this.cancelOldOrder(transaction);
        } catch (error) {
          console.error(`Error cancelando orden ${transaction.id}:`, error);
        }
      }

      console.log(`✅ Proceso de cancelación automática completado`);
    } catch (error) {
      console.error('Error en checkAndCancelOldOrders:', error);
    }
  }

  /**
   * Cancela una orden antigua y borra el mensaje del grupo
   */
  async cancelOldOrder(transaction) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Reembolsar saldo si fue deducido (status 'procesando')
      if (transaction.status === 'procesando') {
        await client.query(
          'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
          [transaction.amount_usdt, transaction.user_id]
        );
      }

      // Actualizar estado a cancelado
      await client.query(
        `UPDATE transactions 
         SET status = 'cancelado', 
             motivo = 'Cancelado automáticamente: Orden sin confirmar por más de 24 horas',
             updated_at = NOW(),
             alerted_at = NULL,
             review_started_at = CASE
               WHEN review_started_at IS NOT NULL THEN review_started_at
               ELSE NOW()
             END,
             admitted_at = admitted_at,
             paid_at = paid_at,
             cancelled_at = COALESCE(cancelled_at, NOW())
         WHERE id = $1`,
        [transaction.id]
      );

      await client.query('COMMIT');

      await webhookService.emit('transactions.status_changed', {
        transactionId: transaction.id,
        previousStatus: transaction.status,
        newStatus: 'cancelado',
        eventSource: 'auto_cancel',
        motivo: 'Cancelado automáticamente por inactividad'
      });

      // Intentar borrar el mensaje del grupo si existe
      try {
        const proofImage = transaction.proof_image || '';
        if (proofImage.startsWith('group_message|')) {
          const parts = proofImage.split('|');
          if (parts.length >= 3) {
            const groupChatId = parts[1];
            const groupMessageId = parts[2];
            
            // Requerir el bot dinámicamente
            const bot = require('../bot/bot').bot;
            try {
              await bot.telegram.deleteMessage(groupChatId, parseInt(groupMessageId));
              console.log(`✅ Mensaje de orden ${transaction.id} eliminado del grupo`);
            } catch (deleteError) {
              console.log(`⚠️ No se pudo eliminar mensaje de orden ${transaction.id}:`, deleteError.message);
            }
          }
        }
      } catch (error) {
        console.error(`Error borrando mensaje de orden ${transaction.id}:`, error);
      }

      // Notificar al usuario
      try {
        const bot = require('../bot/bot').bot;
        await bot.telegram.sendMessage(
          transaction.telegram_id,
          `⚠️ *Orden cancelada automáticamente*\n\n` +
          `La orden #${transaction.id} fue cancelada porque no se confirmó en un plazo mayor a 24 horas.\n\n` +
          `Si se había deducido saldo, el importe fue restituido.\n\n` +
          `💡 Utilice /movimientos para revisar el detalle de sus operaciones.`,
          { parse_mode: 'Markdown' }
        );
      } catch (notifyError) {
        console.error(`Error notificando usuario ${transaction.telegram_id}:`, notifyError);
      }

      console.log(`✅ Orden ${transaction.id} cancelada automáticamente`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new AutoCancelService();

