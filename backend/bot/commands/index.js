const pool = require('../../db/connection');
const { getOrCreateUser, formatCurrency, formatARS } = require('../../utils/helpers');
const priceService = require('../../services/priceService');
const stateManager = require('../handlers/stateManager');
const messageService = require('../../services/messageService');
const chatManager = require('../utils/chatManager');
const animationManager = require('../utils/animations');

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
      
      // Get welcome message from database
      const welcomeMessage = await messageService.getMessage('welcome', {
        first_name: ctx.from.first_name || 'Usuario'
      });

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'PAGAR', callback_data: 'action_pagar' }],
            [{ text: 'CARGAR SALDO', callback_data: 'action_cargar' }],
            [{ text: 'SALDO', callback_data: 'action_saldo' }],
            [{ text: 'HISTORIAL', callback_data: 'action_historial' }]
          ]
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
      const loadingMsg = await ctx.reply('[+] Consultando saldo...', { parse_mode: 'Markdown' });
      chatManager.registerBotMessage(ctx.from.id, loadingMsg.message_id);

      await animationManager.showProgress(
        ctx,
        loadingMsg.message_id,
        '[+] Consultando saldo',
        1000,
        3
      );

      // Get saldo message from database
      const saldoMessage = await messageService.getMessage('saldo', {
        saldo: saldoUsdt.toFixed(2)
      });

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
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
      // Limpiar mensajes anteriores
      await chatManager.cleanChat(ctx, ctx.from.id, 1);

      // Check if user has any balance first
      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt <= 0) {
        const noBalanceMsg = `❌ *No tienes saldo disponible*\n\n` +
          `Tu saldo actual: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Primero debes cargar saldo usando /cargar`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }
      
      const message = await messageService.getMessage('pagar_multas_menu');

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'MULTAS PBA', callback_data: 'action_multas_pba' }],
            [{ text: 'MULTAS ENTRE RÍOS', callback_data: 'action_multas_entre_rios' }],
            [{ text: 'MULTAS CABA', callback_data: 'action_multas_caba' }],
            [{ text: 'MULTAS CORRIENTES', callback_data: 'action_multas_corrientes' }],
            [{ text: 'MULTAS SANTA FE', callback_data: 'action_multas_santa_fe' }],
            [{ text: 'PAGAR OTRA MULTA', callback_data: 'action_multas_otra' }],
            [{ text: 'Regresar', callback_data: 'action_pagar' }]
          ]
        }
      };

      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error) {
      console.error('Error in pagarMultas:', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      ctx.reply(errorMsg);
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_multas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_multas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_multas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_multas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_multas' }]
          ]
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
        const noBalanceMsg = `❌ *No tienes saldo disponible*\n\n` +
          `Tu saldo actual: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Primero debes cargar saldo usando /cargar`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }
      
      const message = await messageService.getMessage('pagar_rentas_menu');

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'AUTOMOTOR', callback_data: 'action_rentas_automotor' }],
            [{ text: 'INMOBILIARIO', callback_data: 'action_rentas_inmobiliario' }],
            [{ text: 'INGRESOS BRUTOS', callback_data: 'action_rentas_ingresos' }],
            [{ text: 'SELLOS', callback_data: 'action_rentas_sellos' }],
            [{ text: 'MULTAS DE CAMINERA', callback_data: 'action_rentas_caminera' }],
            [{ text: 'Regresar', callback_data: 'action_pagar' }]
          ]
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
        const noBalanceMsg = `❌ *No tienes saldo disponible*\n\n` +
          `Tu saldo actual: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Primero debes cargar saldo usando /cargar`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_rentas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_rentas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_rentas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_rentas' }]
          ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_pagar_rentas' }]
          ]
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
        const noBalanceMsg = `❌ *No tienes saldo disponible*\n\n` +
          `Tu saldo actual: ${saldoUsdt.toFixed(2)} USDT\n\n` +
          `Primero debes cargar saldo usando /cargar`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
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
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
          }
        };

        const sentMessage = await ctx.replyWithMarkdown(noBalanceMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
        return;
      }

      const message = await messageService.getMessage('pagar_menu');

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'PAGAR MULTAS', callback_data: 'action_pagar_multas' }],
            [{ text: 'PAGAR MACRO / PLUSPAGOS', callback_data: 'action_pagar_macro' }],
            [{ text: 'PAGAR RENTAS CÓRDOBA', callback_data: 'action_pagar_rentas' }],
            [{ text: 'PAGAR OTRA COSA', callback_data: 'action_pagar_otra' }],
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
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
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
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
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
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
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
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
        
        movimientosText += `\n\n`;
      });

      movimientosText += `\n⬅️ *Regresar al menú principal*`;

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
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
  }
};

module.exports = commands;
