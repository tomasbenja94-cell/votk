const pool = require('../../db/connection');
const { isAdmin } = require('../../utils/helpers');

class NotificationService {
  /**
   * Notifica a todos los admins sobre un cambio de estado
   */
  async notifyAdmins(bot, action, details) {
    try {
      // Get all admins
      const adminsResult = await pool.query(
        'SELECT telegram_id, username FROM admins WHERE telegram_id IS NOT NULL'
      );

      const message = this.formatNotification(action, details);

      // Send to each admin
      for (const admin of adminsResult.rows) {
        try {
          await bot.telegram.sendMessage(
            admin.telegram_id,
            message,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error(`Error notifying admin ${admin.username}:`, error.message);
        }
      }

      // Also send to admin groups if configured
      // This would require parsing group links or storing chat IDs
    } catch (error) {
      console.error('Error in notifyAdmins:', error);
    }
  }

  /**
   * Formatea el mensaje de notificación
   */
  formatNotification(action, details) {
    switch (action) {
      case 'pago_confirmado':
        return `✅ *Pago Confirmado*\n\n` +
               `👤 Admin: @${details.admin}\n` +
               `📋 Transacción: #${details.transactionId}\n` +
               `👥 Usuario: @${details.username}\n` +
               `💰 Monto: ${details.amount} USDT\n` +
               `✅ Estado: PAGADO`;

      case 'pago_cancelado':
        return `⚠️ *Pago Cancelado*\n\n` +
               `👤 Admin: @${details.admin}\n` +
               `📋 Transacción: #${details.transactionId}\n` +
               `👥 Usuario: @${details.username}\n` +
               `💰 Monto: ${details.amount} USDT\n` +
               `📝 Motivo: ${details.motivo || 'Sin motivo'}\n` +
               `💸 Estado: REEMBOLSADO (interno)`;

      case 'carga_confirmada':
        return `✅ *Carga Confirmada*\n\n` +
               `👤 Admin: @${details.admin}\n` +
               `👥 Usuario: @${details.username}\n` +
               `💰 Monto: ${details.amount} USDT\n` +
               `✅ Estado: ACREDITADO`;

      default:
        return `📢 *Notificación*\n\n${JSON.stringify(details)}`;
    }
  }

  /**
   * Notifica al usuario sobre cambios en su transacción
   */
  async notifyUser(bot, userId, action, details) {
    try {
      const userPrefs = await pool.query(
        'SELECT notify_instant, notify_daily_summary FROM users WHERE telegram_id = $1',
        [userId]
      );

      if (userPrefs.rows.length === 0) {
        console.warn(`No se encontraron preferencias para usuario ${userId}, omitiendo notificación`);
        return;
      }

      const { notify_instant: notifyInstant, notify_daily_summary: notifyDailySummary } = userPrefs.rows[0];

      // Si las notificaciones instantáneas están desactivadas, omitir envío
      if (!notifyInstant) {
        if (notifyDailySummary) {
          console.log(`Notificación instantánea omitida para ${userId} (prefiere resumen diario)`);
        } else {
          console.log(`Notificación instantánea desactivada para ${userId}`);
        }
        return;
      }

      let message = '';

      switch (action) {
        case 'pago_aprobado':
          message = `✅ *Pago acreditado con éxito*\n\n` +
                   `🔄 Estado actualizado: PAGADO\n` +
                   `💰 Monto aplicado: ${details.amount} USDT`;
          break;

        case 'pago_cancelado':
          message = `⚠️ *Operación cancelada*\n\n` +
                   `📝 Motivo: ${details.motivo}\n` +
                   `💸 El importe fue reintegrado a su saldo virtual.`;
          break;

        case 'carga_confirmada':
          message = `✅ *Depósito confirmado*\n\n` +
                   `💰 Monto acreditado: ${details.amount} USDT\n` +
                   `💵 Su saldo fue actualizado correctamente.`;
          break;

        default:
          message = `📢 ${JSON.stringify(details)}`;
      }

      await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user:', error);
    }
  }
}

module.exports = new NotificationService();
