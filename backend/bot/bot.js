const { Telegraf } = require('telegraf');
const pool = require('../db/connection');
const config = require('../config/default.json');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN || config.bot_token);
const chatManager = require('./utils/chatManager');

// Middleware para verificar baneos
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id) {
    try {
      const result = await pool.query(
        `SELECT * FROM banned_users 
         WHERE telegram_id = $1 
         AND banned_until > NOW()`,
        [ctx.from.id.toString()]
      );

      if (result.rows.length > 0) {
        const ban = result.rows[0];
        const bannedUntil = new Date(ban.banned_until);
        const now = new Date();
        const minutesLeft = Math.ceil((bannedUntil - now) / (1000 * 60));
        
        await ctx.reply(
          `🚫 *Estás baneado*\n\n` +
          `Razón: ${ban.reason || 'Pago falso detectado'}\n` +
          `Baneado por: ${ban.banned_by_username || 'Administrador'}\n` +
          `Tiempo restante: ${minutesLeft} minutos\n\n` +
          `No podrás usar el bot hasta que expire el baneo.`,
          { parse_mode: 'Markdown' }
        );
        return; // Stop processing
      }
    } catch (error) {
      console.error('Error checking ban:', error);
      // Continue if there's an error checking ban
    }
  }
  
  await next();
});

// Middleware para registrar automáticamente todos los mensajes del bot
bot.use(async (ctx, next) => {
  // Guardar el método original de reply
  const originalReply = ctx.reply.bind(ctx);
  const originalReplyWithMarkdown = ctx.replyWithMarkdown.bind(ctx);
  const originalReplyWithPhoto = ctx.replyWithPhoto.bind(ctx);
  
  // Interceptar reply para registrar el mensaje
  ctx.reply = async function(...args) {
    const result = await originalReply(...args);
    if (result && result.message_id && ctx.from) {
      chatManager.registerBotMessage(ctx.from.id, result.message_id);
    }
    return result;
  };
  
  ctx.replyWithMarkdown = async function(...args) {
    const result = await originalReplyWithMarkdown(...args);
    if (result && result.message_id && ctx.from) {
      chatManager.registerBotMessage(ctx.from.id, result.message_id);
    }
    return result;
  };
  
  ctx.replyWithPhoto = async function(...args) {
    const result = await originalReplyWithPhoto(...args);
    if (result && result.message_id && ctx.from) {
      chatManager.registerBotMessage(ctx.from.id, result.message_id);
    }
    return result;
  };
  
  await next();
});

// Load handlers
const commandHandlers = require('./commands');
const messageHandlers = require('./handlers/messageHandlers');
const adminHandlers = require('./admin/adminHandlers');

// Register commands
bot.command('start', commandHandlers.start);
bot.command('saldo', commandHandlers.saldo);
bot.command('cargar', async (ctx) => {
  // Check if admin command first
  const messageText = ctx.message.text;
  const parts = messageText.split(' ');
  
  if (parts.length >= 3 && parts[1].startsWith('@')) {
    // Admin command
    await adminHandlers.cargar(ctx);
  } else {
    // User command
    await commandHandlers.cargar(ctx);
  }
});
bot.command('pagar', commandHandlers.pagar);
bot.command('multas', commandHandlers.multas);
bot.command('macro', commandHandlers.macro);
bot.command('rentas', commandHandlers.rentas);
bot.command('otroservicio', commandHandlers.otroservicio);
bot.command('movimientos', commandHandlers.movimientos);
bot.command('preguntas', commandHandlers.preguntas);
bot.command('me', commandHandlers.me);
bot.command('admin', adminHandlers.authenticate);
bot.command('cancelar', adminHandlers.cancelar);
bot.command('wallet', adminHandlers.wallet);
bot.command('logs', adminHandlers.logs);
bot.command('config', adminHandlers.config);
bot.command('setgroupchatid', adminHandlers.setGroupChatId);
bot.command('eliminarsaldo', adminHandlers.eliminarSaldo);
bot.command('trc20', adminHandlers.trc20);
bot.command('bep20', adminHandlers.bep20);
bot.command('comandos', commandHandlers.comandos);
bot.command('comandosgrupo', commandHandlers.comandosgrupo);
bot.command('comandosop', commandHandlers.comandosop);
bot.command('allcomands', commandHandlers.allcomands);
bot.command('politicas', commandHandlers.politicas);
bot.command('banear', adminHandlers.banear);
bot.command('notificaciones', commandHandlers.notificaciones);
bot.command('noticia', adminHandlers.noticia);
bot.command('resumen', adminHandlers.resumen);
bot.command('info', adminHandlers.userInfo);

// Register callbacks
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  try {
    if (data.startsWith('cargar_confirm_order_')) {
      await adminHandlers.handleCargarConfirmOrder(ctx, data);
      return;
    } else if (data.startsWith('cargar_reject_order_')) {
      await adminHandlers.handleCargarRejectOrder(ctx, data);
      return;
    } else if (data.startsWith('cargar_confirm_')) {
      await messageHandlers.handleCargarConfirm(ctx);
    } else if (data.startsWith('cargar_cancel_')) {
      await messageHandlers.handleCargarCancel(ctx);
    } else if (data.startsWith('macro_confirm_')) {
      await messageHandlers.handleMacroConfirm(ctx, data);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('macro_cancel_')) {
      await messageHandlers.handleMacroCancel(ctx);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('multa_confirm_')) {
      await messageHandlers.handleMultaConfirm(ctx, data);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data === 'multa_cancel') {
      await messageHandlers.handleMultaCancel(ctx);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('pago_confirm_otra_') || data.startsWith('pago_confirm_rentas_')) {
      await messageHandlers.handlePagoConfirmOtraRentas(ctx, data);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('pago_cancel_otra') || data.startsWith('pago_cancel_rentas')) {
      await messageHandlers.handlePagoCancelOtraRentas(ctx, data);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('pago_admitir_')) {
      await adminHandlers.handlePagoAdmitir(ctx);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('pago_confirm_')) {
      await adminHandlers.handlePagoConfirm(ctx);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data.startsWith('pago_cancel_')) {
      await adminHandlers.handlePagoCancel(ctx);
      return; // Don't call answerCbQuery again, it's already called in the handler
    } else if (data === 'action_pagar') {
      await commandHandlers.pagar(ctx);
    } else if (data === 'action_pagar_multas') {
      await commandHandlers.pagarMultas(ctx);
    } else if (data === 'action_pagar_macro') {
      await commandHandlers.pagarMacro(ctx);
    } else if (data === 'action_pagar_rentas') {
      await commandHandlers.pagarRentas(ctx);
    } else if (data === 'action_pagar_otra') {
      await commandHandlers.pagarOtra(ctx);
    } else if (data === 'action_multas_pba') {
      await commandHandlers.pagarMultasPBA(ctx);
    } else if (data === 'action_multas_entre_rios') {
      await commandHandlers.pagarMultasEntreRios(ctx);
    } else if (data === 'action_multas_caba') {
      await commandHandlers.pagarMultasCABA(ctx);
    } else if (data === 'action_multas_corrientes') {
      await commandHandlers.pagarMultasCorrientes(ctx);
    } else if (data === 'action_multas_santa_fe') {
      await commandHandlers.pagarMultasSantaFe(ctx);
    } else if (data === 'action_multas_otra') {
      await commandHandlers.pagarMultasOtra(ctx);
    } else if (data === 'action_rentas_automotor') {
      await commandHandlers.pagarRentasAutomotor(ctx);
    } else if (data === 'action_rentas_inmobiliario') {
      await commandHandlers.pagarRentasInmobiliario(ctx);
    } else if (data === 'action_rentas_ingresos') {
      await commandHandlers.pagarRentasIngresos(ctx);
    } else if (data === 'action_rentas_sellos') {
      await commandHandlers.pagarRentasSellos(ctx);
    } else if (data === 'action_rentas_caminera') {
      await commandHandlers.pagarRentasCaminera(ctx);
    } else if (data === 'action_saldo') {
      await commandHandlers.saldo(ctx);
    } else if (data === 'action_cargar') {
      await commandHandlers.cargar(ctx);
    } else if (data === 'action_historial') {
      await commandHandlers.historial(ctx);
    } else if (data === 'pago_completado_menu') {
      // Answer callback query first
      await ctx.answerCbQuery('✅ Volviendo al menú...');
      
      // Delete the confirmation message
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.log('Could not delete confirmation message:', deleteError.message);
      }
      
      // Clean all old messages and show start menu
      const chatManager = require('./utils/chatManager');
      try {
        await chatManager.cleanChat(ctx, ctx.from.id, 0);
        chatManager.clearHistory(ctx.from.id);
      } catch (cleanError) {
        console.log('Error cleaning chat:', cleanError.message);
      }
      
      // Show start menu
      await commandHandlers.start(ctx);
      return;
    } else if (data === 'action_back') {
      await commandHandlers.start(ctx);
    } else if (data === 'admin_users') {
      await adminHandlers.handleAdminUsers(ctx);
    } else if (data === 'admin_wallets') {
      await adminHandlers.handleAdminWallets(ctx);
    } else if (data === 'admin_stats') {
      await adminHandlers.handleAdminStats(ctx);
    } else if (data === 'admin_logs') {
      await adminHandlers.handleAdminLogs(ctx);
    } else if (data === 'admin_back') {
      await adminHandlers.showAdminMenu(ctx);
    } else if (data.startsWith('notif_pref_')) {
      const preference = data.replace('notif_pref_', '');
      await commandHandlers.setNotificationPreference(ctx, preference);
      return;
    } else {
      await ctx.answerCbQuery('Acción no reconocida', true);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling callback:', error);
    await ctx.answerCbQuery('Error al procesar la acción', true);
  }
});

// Handle photo uploads (for proof images)
bot.on('photo', messageHandlers.handlePhoto);

// Handle text messages (for flow states and reply keyboard buttons)
bot.on('text', async (ctx) => {
  // Register user message for cleanup
  const chatManager = require('./utils/chatManager');
  chatManager.registerUserMessage(ctx.from.id, ctx.message.message_id);
  
  const text = ctx.message.text.trim();
  
  // Handle reply keyboard buttons first (with emojis)
  if (text === '💳 PAGAR' || text === 'PAGAR') {
    await commandHandlers.pagar(ctx);
    return;
  } else if (text === '💰 CARGAR SALDO' || text === 'CARGAR SALDO') {
    await commandHandlers.cargar(ctx);
    return;
  } else if (text === '💵 SALDO' || text === 'SALDO') {
    await commandHandlers.saldo(ctx);
    return;
  } else if (text === '📊 HISTORIAL' || text === 'HISTORIAL') {
    await commandHandlers.historial(ctx);
    return;
  } else if (text === '🔔 NOTIFICACIONES' || text === 'NOTIFICACIONES') {
    await commandHandlers.notificaciones(ctx);
    return;
  } else if (text === '❓ PREGUNTAS' || text === 'PREGUNTAS') {
    await commandHandlers.preguntas(ctx);
    return;
  } else if (text === '🏠 MENU PRINCIPAL' || text === 'MENU PRINCIPAL') {
    await commandHandlers.start(ctx);
    return;
  } else if (text === '🏦 PAGAR MACRO / PLUSPAGOS' || text === 'PAGAR MACRO / PLUSPAGOS') {
    await commandHandlers.pagarMacro(ctx);
    return;
  } else if (text === '🏛️ PAGAR RENTAS CÓRDOBA' || text === 'PAGAR RENTAS CÓRDOBA') {
    await commandHandlers.pagarRentas(ctx);
    return;
  } else if (text === '🔹 PAGAR OTRO SERVICIO' || text === 'PAGAR OTRO SERVICIO') {
    await commandHandlers.pagarOtra(ctx);
    return;
  } else if (text === '🚗 PAGAR MULTAS PBA' || text === 'PAGAR MULTAS PBA') {
    await commandHandlers.pagarMultas(ctx);
    return;
  } else if (text === '🚗 AUTOMOTOR' || text === 'AUTOMOTOR') {
    await commandHandlers.pagarRentasAutomotor(ctx);
    return;
  } else if (text === '🏠 INMOBILIARIO' || text === 'INMOBILIARIO') {
    await commandHandlers.pagarRentasInmobiliario(ctx);
    return;
  } else if (text === '📈 INGRESOS BRUTOS' || text === 'INGRESOS BRUTOS') {
    await commandHandlers.pagarRentasIngresos(ctx);
    return;
  } else if (text === '📄 SELLOS' || text === 'SELLOS') {
    await commandHandlers.pagarRentasSellos(ctx);
    return;
  } else if (text === '🚓 MULTAS DE CAMINERA' || text === 'MULTAS DE CAMINERA') {
    await commandHandlers.pagarRentasCaminera(ctx);
    return;
  }
  
  const state = require('./handlers/stateManager').getState(ctx.from.id);
  
  // Check if it's admin or cancelar motivo
  if (state === 'cancelar_waiting_motivo') {
    await adminHandlers.handleCancelarMotivo(ctx, ctx.message.text);
  } else if (state === 'admin_waiting_actas') {
    await adminHandlers.handleAdminActas(ctx, ctx.message.text);
  } else {
    await messageHandlers.handleText(ctx);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Ocurrió un error. Por favor intenta nuevamente.');
});

// Initialize bot
async function startBot() {
  try {
    // Set bot commands menu - configure autocomplete menu
    try {
            await bot.telegram.setMyCommands([
              { command: 'start', description: '💠 MENU - Menú principal' },
              { command: 'saldo', description: '💰 VER SALDO - Ver saldo disponible' },
              { command: 'cargar', description: '🪙 CARGAR - Acreditar saldo a tu cuenta' },
              { command: 'pagar', description: '💸 PAGAR - Menú general de pagos' },
              { command: 'preguntas', description: '❓ PREGUNTAS - Centro de ayuda con IA' },
              { command: 'multas', description: '🏛️ MULTAS - Gestionar pagos de multas' },
              { command: 'macro', description: '🏦 MACRO - Operaciones Macro / PlusPagos' },
              { command: 'rentas', description: '🏠 RENTAS - Rentas Córdoba' },
              { command: 'otroservicio', description: '🧾 OTRO SERVICIO - Otros pagos' },
              { command: 'me', description: '🧾 MIS DATOS - Ver tu ID y usuario' },
              { command: 'movimientos', description: '📋 MOVIMIENTOS - Ver todos tus movimientos' },
              { command: 'notificaciones', description: '🔔 Configurar notificaciones' },
              { command: 'resumen', description: '📈 RESUMEN - Estadísticas del día (admins)' }
            ]);
      console.log('✅ Bot commands menu configured');
    } catch (cmdError) {
      console.warn('⚠️  Could not set bot commands:', cmdError.message);
    }
    
    await bot.launch();
    console.log('✅ Bot started successfully');
    
    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    if (error.response?.error_code === 409) {
      console.error('⚠️  Bot error: Another instance is already running');
      console.log('💡 If you need to restart the bot, stop all other instances first');
      throw error; // Re-throw so caller can handle it
    }
    console.error('Error starting bot:', error);
    throw error; // Re-throw so caller can handle it
  }
}

module.exports = { bot, startBot };
