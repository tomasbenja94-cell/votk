const pool = require('../../db/connection');
const { getOrCreateUser, formatCurrency, formatARS, isAdmin, getAdminContext } = require('../../utils/helpers');
const priceService = require('../../services/priceService');
const stateManager = require('../handlers/stateManager');
const messageService = require('../../services/messageService');
const chatManager = require('../utils/chatManager');
const animationManager = require('../utils/animations');

const ADMIN_COMMANDS_BY_ROLE = {
  superadmin: [
    '/admin - Acceder al panel de administración',
    '/cancelar <ID> <motivo> - Cancelar una transacción',
    '/wallet - Ver wallets configuradas',
    '/logs - Ver logs del sistema',
    '/config - Ver configuración del bot',
    '/setgroupchatid <link> - Configurar chat de administración',
    '/eliminarsaldo <telegram_id> <monto> - Ajustar saldo de un usuario',
    '/banear @usuario <minutos> - Banear usuarios temporalmente',
    '/noticia - Enviar noticia a todos los usuarios',
    '/resumen - Resumen diario de operaciones',
    '/trc20 - Enlace de Tronscan (grupos)',
    '/bep20 - Enlace de BSCScan (grupos)',
    '/comandosop - Ver esta lista'
  ],
  operador: [
    '/admin - Acceder al panel de administración',
    '/cancelar <ID> <motivo> - Cancelar una transacción',
    '/logs - Ver logs del sistema',
    '/resumen - Resumen diario de operaciones',
    '/trc20 - Enlace de Tronscan (grupos)',
    '/bep20 - Enlace de BSCScan (grupos)',
    '/comandosop - Ver esta lista'
  ],
  auditor: [
    '/admin - Acceder al panel de administración',
    '/logs - Ver logs del sistema',
    '/comandosop - Ver esta lista'
  ]
};

function buildNotificationMenu(user) {
  const statusText = user.notify_instant
    ? '🔔 Recibirá avisos inmediatos en el bot.'
    : user.notify_daily_summary
      ? '🕒 Recibirá un resumen diario en el bot.'
      : '🔕 Las notificaciones automáticas están desactivadas.';

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{
          text: `${user.notify_instant ? '✅' : '☑️'} Avisos inmediatos`,
          callback_data: 'notif_pref_instant'
        }],
        [{
          text: `${user.notify_daily_summary ? '✅' : '☑️'} Resumen diario`,
          callback_data: 'notif_pref_summary'
        }],
        [{
          text: `${!user.notify_instant && !user.notify_daily_summary ? '✅' : '☑️'} Desactivar`,
          callback_data: 'notif_pref_off'
        }],
        [{ text: '⬅️ Volver al menú', callback_data: 'notif_pref_back' }]
      ]
    }
  };

  const message = `🔔 *Preferencias de notificaciones*

${statusText}

*Opciones disponibles:*
• Avisos inmediatos: notificamos cada operación al instante.
• Resumen diario: enviamos un resumen consolidado en el bot.
• Desactivar: se detienen las notificaciones automáticas.`;

  return { message, keyboard };
}

const commands = {
  async start(ctx) {
    try {
      // Intentar eliminar menú anterior si existe
      const previousMenu = chatManager.getMainMenuMessage(ctx.from.id);
      if (previousMenu) {
        try {
          await ctx.telegram.deleteMessage(previousMenu.chatId, previousMenu.messageId);
        } catch (deleteError) {
          if (deleteError.response?.error_code !== 400 && deleteError.response?.error_code !== 404) {
            console.warn('Error deleting previous main menu:', deleteError.message);
          }
        } finally {
          chatManager.clearMainMenuMessage(ctx.from.id);
        }
      }

      // Limpiar chat anterior (no crítico si falla)
      try {
        await chatManager.cleanChat(ctx, ctx.from.id);
      } catch (cleanError) {
        console.warn('Error cleaning chat (non-critical):', cleanError.message);
      }

      // Get or create user
      let user;
      try {
        user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      } catch (userError) {
        console.error('Error getting/creating user:', userError);
        console.error('Error stack:', userError.stack);
        throw new Error(`Error al registrar usuario: ${userError.message}`);
      }
      
      // Welcome message with new format
      const welcomeMessage = `🤖 *Bienvenido a Binopolis Pay*\n\n` +
        `Estimado/a ${ctx.from.first_name || 'cliente'},\n\n` +
        `Somos su plataforma corporativa para gestionar pagos automatizados con activos digitales.\n\n` +
        `*Comandos disponibles:*\n` +
        `/pagar - Iniciar una solicitud de pago\n` +
        `/preguntas - Realizar consultas frecuentes\n` +
        `/saldo - Consultar su saldo disponible\n` +
        `/cargar - Acreditar fondos en su cuenta`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '💳 PAGAR' }],
            [{ text: '💰 CARGAR SALDO' }],
            [{ text: '💵 SALDO' }],
            [{ text: '📊 HISTORIAL' }],
            [{ text: '🔔 NOTIFICACIONES' }],
            [{ text: '❓ PREGUNTAS' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(welcomeMessage, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
      chatManager.setMainMenuMessage(ctx.from.id, ctx.chat.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in /start:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        userId: ctx.from?.id,
        username: ctx.from?.username
      });
      
      // Try to get error message from service, but fallback if it fails
      try {
        const errorMsg = await messageService.getMessage('error_register');
        await ctx.reply(errorMsg);
      } catch (msgError) {
        console.error('Error getting error message:', msgError);
        await ctx.reply(`❌ Error al registrar usuario. Intenta nuevamente.\n\nDetalle: ${error.message}`);
      }
    }
  },

  async saldo(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      // Mostrar animación de carga
      const loadingMsg = await ctx.reply('[⏳] Procesando consulta de saldo...', { parse_mode: 'Markdown' });
      chatManager.registerBotMessage(ctx.from.id, loadingMsg.message_id);

      await animationManager.showProgress(
        ctx,
        loadingMsg.message_id,
        '[⏳] Procesando consulta de saldo',
        1000,
        3
      );

      // Get saldo message from database
      const saldoMessage = await messageService.getMessage('saldo', {
        saldo: saldoUsdt.toFixed(2)
      });

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await animationManager.showResult(ctx, loadingMsg.message_id, true, saldoMessage);
      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        keyboard.reply_markup
      );
    } catch (error) {
      console.error('Error in /saldo:', error);
      const errorMsg = await messageService.getMessage('error_generic');
      ctx.reply(errorMsg);
    }
  },

  async cargar(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      stateManager.setState(ctx.from.id, 'cargar_waiting_amount');
      
      const message = await messageService.getMessage('cargar_menu');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in /cargar:', error);
      const errorMsg = await messageService.getMessage('cargar_error');
      ctx.reply(errorMsg);
    }
  },

  async pagarMultas(ctx) {
    try {
      await ctx.reply('@binopolisPAY_bot');
      // No callback query para responder en uso directo del comando
    } catch (error) {
      console.error('Error in pagarMultas:', error);
      await ctx.answerCbQuery('❌ Error', true);
    }
  },

  async pagarMultasPBA(ctx) {
    try {
      await ctx.reply('MULTAS PBA : @binopolisPAY_bot');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error in pagarMultasPBA:', error);
      await ctx.answerCbQuery('❌ Error', true);
    }
  },

  async pagarMultasEntreRios(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_otra_multa_waiting_servicio');
      stateManager.setData(ctx.from.id, { type: 'multas', multa_tipo: 'ENTRE_RIOS' });
      
      const message = await messageService.getMessage('pagar_multas_entre_rios');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMultasEntreRios:', error);
      await ctx.reply('❌ Error al iniciar pago de multas Entre Ríos');
    }
  },

  async pagarMultasCABA(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_caba_waiting_patente');
      stateManager.setData(ctx.from.id, { type: 'multas', multa_tipo: 'CABA' });
      
      const message = await messageService.getMessage('pagar_multas_caba');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMultasCABA:', error);
      await ctx.reply('❌ Error al iniciar pago de multas CABA');
    }
  },

  async pagarMultasCorrientes(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_otra_multa_waiting_servicio');
      stateManager.setData(ctx.from.id, { type: 'multas', multa_tipo: 'CORRIENTES' });
      
      const message = await messageService.getMessage('pagar_multas_corrientes');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMultasCorrientes:', error);
      await ctx.reply('❌ Error al iniciar pago de multas Corrientes');
    }
  },

  async pagarMultasSantaFe(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_otra_multa_waiting_servicio');
      stateManager.setData(ctx.from.id, { type: 'multas', multa_tipo: 'SANTA_FE' });
      
      const message = await messageService.getMessage('pagar_multas_santa_fe');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMultasSantaFe:', error);
      await ctx.reply('❌ Error al iniciar pago de multas Santa Fe');
    }
  },

  async pagarMultasOtra(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_otra_multa_waiting_servicio');
      stateManager.setData(ctx.from.id, { type: 'multas', multa_tipo: 'OTRA' });
      
      const message = await messageService.getMessage('pagar_multas_otra');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMultasOtra:', error);
      await ctx.reply('❌ Error al iniciar pago de otra multa');
    }
  },

  async pagarRentas(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      // Check if user has any balance first
      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt <= 0) {
        const noBalanceMsg = `⚠️ *Saldo insuficiente*\n\n` +
          `Saldo disponible: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Acredite fondos mediante /cargar para continuar.`;
        
        const keyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }
      
      const message = await messageService.getMessage('pagar_rentas_menu');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🚗 AUTOMOTOR' }],
            [{ text: '🏠 INMOBILIARIO' }],
            [{ text: '📈 INGRESOS BRUTOS' }],
            [{ text: '📄 SELLOS' }],
            [{ text: '🚓 MULTAS DE CAMINERA' }],
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarRentas:', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      ctx.reply(errorMsg);
    }
  },

  async pagarOtra(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      // Check if user has any balance first
      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt <= 0) {
        const noBalanceMsg = `⚠️ *Saldo insuficiente*\n\n` +
          `Saldo disponible: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Acredite fondos mediante /cargar para continuar.`;
        
        const keyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }
      
      stateManager.setState(ctx.from.id, 'pagar_otra_waiting_servicio');
      stateManager.setData(ctx.from.id, { type: 'otra' });
      
      const message = await messageService.getMessage('pagar_otra_menu');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarOtra:', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      ctx.reply(errorMsg);
    }
  },

  async pagarRentasAutomotor(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_rentas_automotor_waiting_patente');
      stateManager.setData(ctx.from.id, { type: 'rentas', renta_tipo: 'AUTOMOTOR' });
      
      const message = await messageService.getMessage('pagar_rentas_automotor');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarRentasAutomotor:', error);
      await ctx.reply('❌ Error al iniciar pago de rentas automotor');
    }
  },

  async pagarRentasInmobiliario(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_rentas_inmobiliario_waiting_cuenta');
      stateManager.setData(ctx.from.id, { type: 'rentas', renta_tipo: 'INMOBILIARIO' });
      
      const message = await messageService.getMessage('pagar_rentas_inmobiliario');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarRentasInmobiliario:', error);
      await ctx.reply('❌ Error al iniciar pago de rentas inmobiliario');
    }
  },

  async pagarRentasIngresos(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_rentas_ingresos_waiting_inscripcion');
      stateManager.setData(ctx.from.id, { type: 'rentas', renta_tipo: 'INGRESOS_BRUTOS' });
      
      const message = await messageService.getMessage('pagar_rentas_ingresos');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarRentasIngresos:', error);
      await ctx.reply('❌ Error al iniciar pago de ingresos brutos');
    }
  },

  async pagarRentasSellos(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_rentas_sellos_waiting_identificacion');
      stateManager.setData(ctx.from.id, { type: 'rentas', renta_tipo: 'SELLOS' });
      
      const message = await messageService.getMessage('pagar_rentas_sellos');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarRentasSellos:', error);
      await ctx.reply('❌ Error al iniciar pago de sellos');
    }
  },

  async pagarRentasCaminera(ctx) {
    try {
      stateManager.setState(ctx.from.id, 'pagar_rentas_caminera_waiting_dato');
      stateManager.setData(ctx.from.id, { type: 'rentas', renta_tipo: 'MULTAS_CAMINERA' });
      
      const message = await messageService.getMessage('pagar_rentas_caminera');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarRentasCaminera:', error);
      await ctx.reply('❌ Error al iniciar pago de multas de caminera');
    }
  },

  async pagarMacro(ctx) {
    try {
      // NO limpiar mensajes aquí - solo al finalizar o cancelar

      // Check if user has any balance first
      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt <= 0) {
        const noBalanceMsg = `⚠️ *Saldo insuficiente*\n\n` +
          `Saldo disponible: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Acredite fondos mediante /cargar para continuar.`;
        
        const keyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }

      stateManager.setState(ctx.from.id, 'pagar_macro_waiting_nombre_servicio');
      stateManager.setData(ctx.from.id, { type: 'macro_pluspagos' });
      
      const message = await messageService.getMessage('pagar_macro_menu');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMacro:', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      ctx.reply(errorMsg);
    }
  },

  async pagar(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      // Check if user has any balance first
      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt <= 0) {
        const noBalanceMsg = await messageService.getMessage('error_no_balance', {
          saldo: saldoUsdt.toFixed(2)
        });
        
        const keyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }

      const message = `💼 *Gestión de pagos*\n\n` +
        `¿Qué operación desea realizar?\n\n` +
        `*Comandos disponibles:*\n` +
        `/multas - Gestionar pagos de multas\n` +
        `/macro - Operaciones Macro / PlusPagos\n` +
        `/rentas - Rentas Córdoba\n` +
        `/otroservicio - Pago de otros servicios`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏦 PAGAR MACRO / PLUSPAGOS' }],
            [{ text: '🏛️ PAGAR RENTAS CÓRDOBA' }],
            [{ text: '🔹 PAGAR OTRO SERVICIO' }],
            [{ text: '🚗 PAGAR MULTAS PBA' }],
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in /pagar:', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      ctx.reply(errorMsg);
    }
  },

  async historial(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      
      // Mostrar animación de carga
      const loadingMsg = await ctx.reply('[+] Consultando historial...', { parse_mode: 'Markdown' });
      chatManager.registerBotMessage(ctx.from.id, loadingMsg.message_id);

      await animationManager.showProgress(
        ctx,
        loadingMsg.message_id,
        '[+] Consultando historial',
        1000,
        3
      );

      // Obtener pagos y recargas del usuario (solo completados)
      const transactionsResult = await pool.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         AND status IN ('pagado', 'admitido')
         ORDER BY created_at DESC 
         LIMIT 20`,
        [user.id]
      );

      const transactions = transactionsResult.rows;

      if (transactions.length === 0) {
        const noHistorialMsg = `📊 *Historial*\n\n` +
          `No tienes pagos o recargas registrados.\n\n` +
          `⬅️ *Regresar al menú principal*`;

        const keyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        await animationManager.showResult(ctx, loadingMsg.message_id, true, noHistorialMsg);
        await ctx.telegram.editMessageReplyMarkup(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          keyboard.reply_markup
        );
        return;
      }

      // Formatear historial
      let historialText = `📊 *Movimientos recientes:*\n\n`;
      
      transactions.forEach((tx) => {
        const date = new Date(tx.created_at);
        const fecha = date.toLocaleDateString('es-AR', { 
          day: '2-digit', 
          month: '2-digit'
        });

        let tipoTexto = '';
        if (tx.type === 'carga') {
          tipoTexto = 'Carga de saldo';
        } else if (tx.type === 'pago') {
          // Determinar tipo de pago basado en los datos
          if (tx.amount_ars) {
            tipoTexto = 'Pago de multa';
          } else {
            tipoTexto = 'Pago';
          }
        } else {
          tipoTexto = tx.type || 'Movimiento';
        }

        historialText += `🔹 ${fecha} – ${tipoTexto} – ${parseFloat(tx.amount_usdt).toFixed(2)} USDT\n`;
      });

      historialText += `\n⬅️ *Regresar al menú principal*`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await animationManager.showResult(ctx, loadingMsg.message_id, true, historialText);
      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        keyboard.reply_markup
      );
    } catch (error) {
      console.error('Error in historial:', error);
      const errorMsg = await messageService.getMessage('error_generic');
      await ctx.reply(errorMsg || '❌ Error al consultar historial');
    }
  },

  async movimientos(ctx) {
    try {
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      
      // Mostrar animación de carga
      const loadingMsg = await ctx.reply('[+] Consultando movimientos...', { parse_mode: 'Markdown' });
      chatManager.registerBotMessage(ctx.from.id, loadingMsg.message_id);

      await animationManager.showProgress(
        ctx,
        loadingMsg.message_id,
        '[+] Consultando movimientos',
        1000,
        3
      );

      // Obtener todas las transacciones del usuario
      const transactionsResult = await pool.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [user.id]
      );

      const transactions = transactionsResult.rows;

      if (transactions.length === 0) {
        const noMovimientosMsg = `📋 *Tus Movimientos*\n\n` +
          `No tienes movimientos registrados.\n\n` +
          `⬅️ *Regresar al menú principal*`;

        const keyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        await animationManager.showResult(ctx, loadingMsg.message_id, true, noMovimientosMsg);
        await ctx.telegram.editMessageReplyMarkup(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          keyboard.reply_markup
        );
        return;
      }

      // Formatear movimientos
      let movimientosText = `📋 *Tus Movimientos*\n\n`;
      
      transactions.forEach((tx, index) => {
        const date = new Date(tx.created_at);
        const fecha = date.toLocaleDateString('es-AR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        let tipoEmoji = '💰';
        let tipoTexto = 'Pago';
        if (tx.type === 'carga') {
          tipoEmoji = '🪙';
          tipoTexto = 'Carga';
        } else if (tx.type === 'reembolso') {
          tipoEmoji = '↩️';
          tipoTexto = 'Reembolso';
        }

        let estadoEmoji = '⏳';
        let estadoTexto = 'En proceso';
        if (tx.status === 'pagado') {
          estadoEmoji = '✅';
          estadoTexto = 'Pagado';
        } else if (tx.status === 'cancelado') {
          estadoEmoji = '❌';
          estadoTexto = 'Cancelado';
        } else if (tx.status === 'admitido') {
          estadoEmoji = '📝';
          estadoTexto = 'Admitido';
        } else if (tx.status === 'procesando') {
          estadoEmoji = '⏳';
          estadoTexto = 'En proceso';
        }

        movimientosText += `${tipoEmoji} *${tipoTexto}* - ${estadoEmoji} ${estadoTexto}\n`;
        movimientosText += `💵 ${parseFloat(tx.amount_usdt).toFixed(2)} USDT`;
        
        if (tx.amount_ars) {
          movimientosText += ` (${formatARS(tx.amount_ars)} ARS)`;
        }
        
        movimientosText += `\n📅 ${fecha}`;
        
        if (tx.identifier) {
          movimientosText += `\n🔖 ${tx.identifier}`;
        }
        
        if (tx.motivo) {
          movimientosText += `\n📝 ${tx.motivo}`;
        }
        
        const formatStep = (label, done, timestamp) => {
          const emoji = done ? '✅' : '⏳';
          const timeText = done && timestamp
            ? ` (${new Date(timestamp).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })})`
            : '';
          return `${emoji} ${label}${timeText}`;
        };

        const timelineLines = [];
        timelineLines.push(formatStep('Recibido', true, tx.created_at));

        if (tx.status === 'cancelado') {
          timelineLines.push(formatStep('Cancelado', true, tx.cancelled_at || tx.updated_at));
        } else {
          const reviewDone = Boolean(tx.review_started_at) || ['procesando', 'admitido', 'pagado'].includes(tx.status);
          timelineLines.push(formatStep('En revisión', reviewDone, tx.review_started_at));

          const admitDone = ['admitido', 'pagado'].includes(tx.status);
          timelineLines.push(formatStep('Admitido', admitDone, tx.admitted_at));

          const paidDone = tx.status === 'pagado';
          timelineLines.push(formatStep('Pagado', paidDone, tx.paid_at));
        }

        movimientosText += `\n📈 Estado:\n${timelineLines.join('\n')}`;
        
        movimientosText += `\n\n`;
      });

      movimientosText += `\n⬅️ *Regresar al menú principal*`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await animationManager.showResult(ctx, loadingMsg.message_id, true, movimientosText);
      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        keyboard.reply_markup
      );
    } catch (error) {
      console.error('Error in /movimientos:', error);
      const errorMsg = await messageService.getMessage('error_generic');
      await ctx.reply(errorMsg || '❌ Error al consultar movimientos');
    }
  },

  async comandos(ctx) {
    try {
      const message = `*📋 COMANDOS DEL BOT*\n\n` +
        `*Comandos principales:*\n` +
        `/start - Muestra el menú principal\n` +
        `/pagar - Iniciar un pago\n` +
        `/preguntas - Centro de ayuda con IA\n` +
        `/cargar - Cargar saldo a tu cuenta\n` +
        `/saldo - Ver tu saldo disponible\n` +
        `/movimientos - Ver tu historial de transacciones\n` +
        `/notificaciones - Configurar tus notificaciones\n` +
        `/comandos - Ver esta lista de comandos\n` +
        `/politicas - Ver las políticas del servicio\n\n` +
        `*Opciones disponibles:*\n` +
        `• PAGAR: Multas, Macro/PlusPagos, Rentas Córdoba, Otro Servicio\n` +
        `• CARGAR SALDO: Recarga tu cuenta con USDT\n` +
        `• SALDO: Consulta tu saldo actual\n` +
        `• HISTORIAL: Revisa todas tus transacciones`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in /comandos:', error);
      await ctx.reply('❌ Error al mostrar comandos');
    }
  },

  async comandosgrupo(ctx) {
    try {
      const adminContext = await getAdminContext(ctx.from.id, ctx.from.username);
      if (!adminContext || adminContext.active === false) {
        await ctx.reply('❌ Solo administradores pueden usar este comando.');
        return;
      }

      // Verificar que está en un grupo
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        await ctx.reply('❌ Este comando solo puede usarse en grupos.');
        return;
      }

      const message = `*📋 COMANDOS DEL BOT EN GRUPOS*\n\n` +
        `*Solo para administradores:*\n\n` +
        `/trc20 - Muestra el enlace de Tronscan para transacciones TRC20\n` +
        `/bep20 - Muestra el enlace de BSCScan para transacciones BEP20\n` +
        `/comandosgrupo - Ver esta lista de comandos de grupo\n` +
        `/comandosop - Ver comandos de administración\n\n` +
        `*Nota:* Estos comandos solo funcionan en grupos de administración configurados.`;

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error in /comandosgrupo:', error);
      await ctx.reply('❌ Error al mostrar comandos de grupo');
    }
  },

  async me(ctx) {
    try {
      const userId = ctx.from?.id;
      const username = ctx.from?.username ? `@${ctx.from.username}` : 'sin_username';
      const firstName = ctx.from?.first_name || '';
      const lastName = ctx.from?.last_name || '';

      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

      const lines = [
        '🧾 *Identificación de usuario*',
        '',
        `🆔 *ID:* ${userId}`,
        `👤 *Usuario:* ${username}`,
      ];

      if (fullName) {
        lines.push(`📛 *Nombre:* ${fullName}`);
      }

      lines.push('', '⬅️ *Regresar al menú principal*');

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await ctx.replyWithMarkdown(lines.join('\n'), keyboard);
    } catch (error) {
      console.error('Error in /me:', error);
      await ctx.reply('❌ No fue posible obtener tus datos. Intenta nuevamente.');
    }
  },

  async comandosop(ctx) {
    try {
      const adminContext = await getAdminContext(ctx.from.id, ctx.from.username);
      if (!adminContext || adminContext.active === false) {
        await ctx.reply('❌ Solo administradores pueden usar este comando.');
        return;
      }

      const role = adminContext.role || 'superadmin';
      const commandsList = ADMIN_COMMANDS_BY_ROLE[role] || ADMIN_COMMANDS_BY_ROLE.superadmin;

      const message = `*⚙️ COMANDOS DE ADMINISTRACIÓN*\n\n` +
        `Rol actual: *${role.toUpperCase()}*\n\n` +
        `*Comandos disponibles:*\n` +
        `${commandsList.map((cmd) => `• ${cmd}`).join('\n')}`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in /comandosop:', error);
      await ctx.reply('❌ Error al mostrar comandos de administración');
    }
  },

  async preguntas(ctx) {
    try {
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      stateManager.setState(ctx.from.id, 'preguntas_waiting_question');

      const message = `❓ *Centro de Preguntas*\n\n` +
        `Estoy listo para ayudarte con información del servicio.\n\n` +
        `✍️ *Escribe tu pregunta en un mensaje.*\n` +
        `✅ La IA responderá automáticamente con los datos del bot.\n\n` +
        `📌 Para volver al menú principal usa el botón o escribe *MENU*.`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in /preguntas:', error);
      await ctx.reply('❌ No fue posible abrir el centro de preguntas. Intenta nuevamente.');
    }
  },

  async notificaciones(ctx) {
    try {
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const { message, keyboard } = buildNotificationMenu(user);

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in /notificaciones:', error);
      await ctx.reply('❌ Error al mostrar tus preferencias de notificación. Intenta nuevamente.');
    }
  },

  async setNotificationPreference(ctx, preference) {
    try {
      if (preference === 'back') {
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          // ignore
        }
        await ctx.answerCbQuery();
        await commands.start(ctx);
        return;
      }

      await getOrCreateUser(ctx.from.id, ctx.from.username);

      let notifyInstant = false;
      let notifyDaily = false;

      switch (preference) {
        case 'instant':
          notifyInstant = true;
          notifyDaily = false;
          break;
        case 'summary':
          notifyInstant = false;
          notifyDaily = true;
          break;
        case 'off':
        default:
          notifyInstant = false;
          notifyDaily = false;
          break;
      }

      const result = await pool.query(
        'UPDATE users SET notify_instant = $1, notify_daily_summary = $2 WHERE telegram_id = $3 RETURNING *',
        [notifyInstant, notifyDaily, ctx.from.id]
      );

      if (result.rows.length === 0) {
        await ctx.answerCbQuery('❌ No se pudieron actualizar las preferencias', true);
        return;
      }

      const updatedUser = result.rows[0];
      const { message, keyboard } = buildNotificationMenu(updatedUser);

      try {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      } catch (editError) {
        console.warn('No se pudo editar el mensaje de notificaciones:', editError.message);
        const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
      }

      const confirmation =
        preference === 'instant' ? '✅ Notificaciones inmediatas activadas' :
        preference === 'summary' ? '🕒 Recibirás un resumen diario' :
        '🔕 Notificaciones desactivadas';

      await ctx.answerCbQuery(confirmation, { show_alert: true });
    } catch (error) {
      console.error('Error updating notification preference:', error);
      await ctx.answerCbQuery('❌ Error al actualizar preferencias', true);
    }
  },

  async politicas(ctx) {
    try {
      const message = `*📜 POLÍTICAS DEL SERVICIO*\n\n` +
        `*Importante sobre el saldo:*\n\n` +
        `El saldo cargado en el bot *NO se reembolsa realmente*.\n\n` +
        `Cuando cargas saldo a tu cuenta:\n` +
        `• El saldo queda registrado como saldo interno en el bot\n` +
        `• Puedes usarlo para realizar pagos\n` +
        `• No se puede retirar o convertir de vuelta a USDT\n` +
        `• El saldo es de uso exclusivo dentro del bot\n\n` +
        `*Términos de uso:*\n` +
        `• Los pagos procesados no son reembolsables\n` +
        `• El saldo cargado es definitivo\n` +
        `• Asegúrate de cargar solo el monto que necesitas\n\n` +
        `*Contacto:*\n` +
        `Para consultas, contacta a los administradores del servicio.`;

      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🏠 MENU PRINCIPAL' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in /politicas:', error);
      await ctx.reply('❌ Error al mostrar políticas');
    }
  }
};

// Command aliases for menú abreviado
commands.multas = commands.pagarMultas;
commands.macro = commands.pagarMacro;
commands.rentas = commands.pagarRentas;
commands.otroservicio = commands.pagarOtra;

module.exports = commands;
