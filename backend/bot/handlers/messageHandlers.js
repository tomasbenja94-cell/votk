const pool = require('../../db/connection');
const { getOrCreateUser, generateIdentifier, encodeIdentifier, decodeIdentifier, formatCurrency, formatARS, formatPercentage, getAdminContext } = require('../../utils/helpers');
const priceService = require('../../services/priceService');
const stateManager = require('./stateManager');
const messageService = require('../../services/messageService');
const chatManager = require('../utils/chatManager');
const animationManager = require('../utils/animations');
const webhookService = require('../../services/webhookService');
const groupManager = require('../utils/groupManager');
const qaService = require('../../services/qaService');
const commands = require('../commands');
const adminHandlers = require('../admin/adminHandlers');
const config = require('../../config/default.json');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const sanitizeForPDF = (value, fallback = 'N/A') => {
  if (value === null || value === undefined) return fallback;
  const cleaned = value
    .toString()
    .replace(/[^\w\sÁÉÍÓÚáéíóúÑñ0-9\.\,\-\/\$#:]/g, '')
    .trim();
  return cleaned || fallback;
};

function createReceiptPDFBuffer({ transactionId, headerName, serviceName, codeLabel, codeValue, amountFormatted }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const cleanServiceName = sanitizeForPDF(serviceName, 'N/A');
      const cleanHeader = sanitizeForPDF(headerName || cleanServiceName, cleanServiceName).toUpperCase();
      const cleanCodeLabel = sanitizeForPDF(codeLabel, 'Dato');
      const cleanCodeValue = sanitizeForPDF(codeValue, 'N/A');
      const cleanAmount = sanitizeForPDF(amountFormatted, 'N/A');

      doc.fontSize(14).text(`Transacción #: ${transactionId}`, { align: 'left' });
      doc.moveDown();
      const borderLine = '==============================';
      doc.fontSize(18).text(borderLine, { align: 'center' });
      doc.fontSize(16).text(`PAGO - ${cleanHeader}`, { align: 'center' });
      doc.fontSize(18).text(borderLine, { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(`Servicio: ${cleanServiceName}`);
      doc.text(`${cleanCodeLabel}: ${cleanCodeValue}`);
      doc.text(`Monto ARS: ${cleanAmount}`);
      doc.moveDown();
      doc.fontSize(14).text('COMPROBANTE DE PAGO.', { align: 'center' });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function sendPaymentReceiptPDF(ctx, details) {
  try {
    const pdfBuffer = await createReceiptPDFBuffer(details);
    const filename = `comprobante-${details.transactionId}.pdf`;
    return await ctx.replyWithDocument({ source: pdfBuffer, filename });
  } catch (error) {
    console.error('Error sending payment receipt PDF:', error);
    return null;
  }
}

const DEFAULT_FEE_PERCENTAGE = 20;

const resolveUserFeeSettings = (user = {}) => {
  const percentRaw = user && user.fee_percentage !== undefined && user.fee_percentage !== null
    ? parseFloat(user.fee_percentage)
    : DEFAULT_FEE_PERCENTAGE;
  const minRaw = user && user.fee_min_amount_ars !== undefined && user.fee_min_amount_ars !== null
    ? parseFloat(user.fee_min_amount_ars)
    : 0;

  return {
    percent: Number.isFinite(percentRaw) ? percentRaw : DEFAULT_FEE_PERCENTAGE,
    minArs: Number.isFinite(minRaw) ? minRaw : 0
  };
};

const calculateFeeForUser = async ({ user, amountArs, precomputedUSDT = null }) => {
  const amountArsNumber = parseFloat(amountArs) || 0;
  const { percent, minArs } = resolveUserFeeSettings(user);
  const totalUsdt = precomputedUSDT !== null ? precomputedUSDT : await priceService.convertARSToUSDT(amountArsNumber);

  const thresholdMet = !(minArs > 0 && amountArsNumber < minArs);
  const percentApplied = thresholdMet ? percent : DEFAULT_FEE_PERCENTAGE;

  let feeUsdt = totalUsdt * (percentApplied / 100);
  feeUsdt = Math.max(0, Math.round(feeUsdt));

  return {
    feeUsdt,
    percentApplied,
    percentageLabel: formatPercentage(percentApplied),
    minArs,
    totalUsdt,
    thresholdMet
  };
};

const handlers = {
  async handleText(ctx) {
    const userId = ctx.from.id;
    const state = stateManager.getState(userId);
    const text = ctx.message.text;

    if (!state) return;

    switch (state) {
      case 'cargar_waiting_amount':
        await this.handleCargarAmount(ctx, text);
        break;
      case 'pagar_waiting_dni':
      case 'pagar_multas_waiting_dni':
        await this.handlePagarDNI(ctx, text);
        break;
      case 'pagar_waiting_tramite':
        await this.handlePagarTramite(ctx, text);
        break;
      case 'pagar_waiting_sexo':
        await this.handlePagarSexo(ctx, text);
        break;
      case 'pagar_waiting_patente':
        await this.handlePagarPatente(ctx, text);
        break;
      case 'pagar_waiting_monto':
        await this.handlePagarMonto(ctx, text);
        break;
      case 'pagar_macro_waiting_nombre_servicio':
        await this.handlePagarMacroNombreServicio(ctx, text);
        break;
      case 'pagar_macro_waiting_dni':
        await this.handlePagarMacroDNI(ctx, text);
        break;
      // Removed: pagar_macro_waiting_nombre - ya no se pide nombre del titular
      case 'pagar_macro_waiting_monto':
        await this.handlePagarMacroMonto(ctx, text);
        break;
      case 'pagar_otra_multa_waiting_login':
        await this.handlePagarOtraMultaLogin(ctx, text);
        break;
      case 'pagar_caba_waiting_patente':
        await this.handlePagarCABAPatente(ctx, text);
        break;
      case 'pagar_otra_waiting_servicio':
      case 'pagar_otra_multa_waiting_servicio':
        await this.handlePagarOtraServicio(ctx, text);
        break;
      case 'pagar_rentas_automotor_waiting_patente':
        await this.handlePagarRentasAutomotorPatente(ctx, text);
        break;
      case 'pagar_rentas_inmobiliario_waiting_cuenta':
        await this.handlePagarRentasInmobiliarioCuenta(ctx, text);
        break;
      case 'pagar_rentas_ingresos_waiting_inscripcion':
        await this.handlePagarRentasIngresosInscripcion(ctx, text);
        break;
      case 'pagar_rentas_sellos_waiting_identificacion':
        await this.handlePagarRentasSellosIdentificacion(ctx, text);
        break;
      case 'pagar_rentas_caminera_waiting_dato':
        await this.handlePagarRentasCamineraDato(ctx, text);
        break;
      case 'pagar_otra_waiting_codigo':
        await this.handlePagarOtraCodigo(ctx, text);
        break;
      case 'pagar_otra_multa_waiting_codigo':
        await this.handlePagarOtraMultaCodigo(ctx, text);
        break;
      case 'admin_set_percentage_waiting_percent':
        await adminHandlers.handlePorcentajePercentStep(ctx, text);
        break;
      case 'admin_set_percentage_waiting_min':
        await adminHandlers.handlePorcentajeMinStep(ctx, text);
        break;
      case 'admin_waiting_actas':
        // This is handled in admin handlers
        break;
      case 'cancelar_waiting_motivo':
        // This is handled in admin handlers
        break;
      case 'admin_sending_noticia':
        await this.handleAdminNoticia(ctx, text);
        break;
      case 'admin_security_question':
        await this.handleAdminSecurityQuestion(ctx, text);
        break;
      case 'preguntas_waiting_question':
        await this.handlePreguntaIA(ctx, text);
        break;
    }
  },

  async handleCargarAmount(ctx, amountText) {
    try {
      const amount = parseFloat(amountText);
      
      if (isNaN(amount) || amount <= 0) {
        const errorMsg = `⚠️ Ingrese un monto válido mayor a 0.`;
        await ctx.reply(errorMsg);
        return;
      }

      const identifier = generateIdentifier();
      
      // IMPORTANT: Save data and state BEFORE doing anything else
      // Convert to proper types to ensure they're saved correctly
      const amountNum = parseFloat(amount);
      const identifierStr = String(identifier);
      
      console.log('About to save data in handleCargarAmount:', { userId: ctx.from.id, amount: amountNum, identifier: identifierStr });
      
      // Save data first
      stateManager.setData(ctx.from.id, { amount: amountNum, identifier: identifierStr });
      
      // Verify data was saved BEFORE setting state
      const dataBeforeState = stateManager.getData(ctx.from.id);
      console.log('Data saved BEFORE setState:', dataBeforeState);
      
      // Then set state (with data = null so it doesn't overwrite)
      stateManager.setState(ctx.from.id, 'cargar_waiting_confirm', null);
      
      // Verify data was saved immediately AFTER setting state
      const savedData = stateManager.getData(ctx.from.id);
      console.log('Data saved in handleCargarAmount:', { 
        userId: ctx.from.id, 
        savedData, 
        amount: amountNum, 
        identifier: identifierStr,
        state: stateManager.getState(ctx.from.id) 
      });
      
      // If data is empty, something is wrong - save it again explicitly
      if (!savedData || !savedData.amount || !savedData.identifier) {
        console.error('ERROR: Data was not saved properly! Attempting to save again...');
        // Access stateManager's internal storage directly through require
        const StateManager = require('./stateManager');
        // Force save by accessing the internal Map
        const stateManagerInternal = require('./stateManager');
        // Save multiple times to ensure it sticks
        stateManagerInternal.setData(ctx.from.id, { amount: parseFloat(amount), identifier: String(identifier) });
        stateManagerInternal.setData(ctx.from.id, { amount: parseFloat(amount), identifier: String(identifier) });
        const recheckData = stateManagerInternal.getData(ctx.from.id);
        console.log('Data after explicit save:', recheckData);
        
        if (!recheckData || !recheckData.amount) {
          console.error('CRITICAL: Still empty after re-save! This is a stateManager bug.');
        }
      }

      // Show processing animation
      const loadingMsg = await ctx.reply('[+] Procesando tu solicitud...', { parse_mode: 'Markdown' });
      chatManager.registerBotMessage(ctx.from.id, loadingMsg.message_id);

      await animationManager.showProgress(
        ctx,
        loadingMsg.message_id,
        '[+] Procesando tu solicitud',
        1000,
        4
      );

      // Get wallets
      const walletsResult = await pool.query(
        'SELECT * FROM wallets WHERE active = true ORDER BY id'
      );

      // Build wallets list
      let walletsList = '';
      walletsResult.rows.forEach(wallet => {
        walletsList += `*${wallet.label} (${wallet.network.toUpperCase()}):*\n`;
        walletsList += `\`${wallet.address}\`\n\n`;
      });

      const walletsMessage = `✅ 💰 *Carga de Saldo*\n\n` +
        `Monto: *${amount} USDT*\n` +
        `${identifier}\n\n` +
        `⚠️ *IMPORTANTE:*\n` +
        `Enviá exactamente ${amount} USDT a la wallet indicada.\n\n` +
        `Wallets disponibles:\n\n` +
        `${walletsList}\n` +
        `⚠️ Confirmá solo después de haber enviado el dinero.`;

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Confirmar que ya envié el dinero', callback_data: `cargar_confirm_${encodeIdentifier(identifier)}` }],
            [{ text: 'Cancelar', callback_data: `cargar_cancel_${encodeIdentifier(identifier)}` }]
          ]
        }
      };
      
      // Verify data is still there before cleaning
      const dataBeforeClean = stateManager.getData(ctx.from.id);
      console.log('Data before cleanChat in handleCargarAmount:', { userId: ctx.from.id, dataBeforeClean });
      
      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      
      // Verify data is still there after cleaning
      const dataAfterClean = stateManager.getData(ctx.from.id);
      console.log('Data after cleanChat in handleCargarAmount:', { userId: ctx.from.id, dataAfterClean });
      
      await animationManager.showResult(ctx, loadingMsg.message_id, true, walletsMessage);
      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        keyboard.reply_markup
      );
      
      // Final verification
      const finalData = stateManager.getData(ctx.from.id);
      console.log('Final data in handleCargarAmount:', { userId: ctx.from.id, finalData });
    } catch (error) {
      console.error('Error in handleCargarAmount:', error);
      const errorMsg = await messageService.getMessage('cargar_error');
      await ctx.reply(errorMsg);
      stateManager.clearState(ctx.from.id);
    }
  },

        async handleCargarConfirm(ctx) {
            try {
              await ctx.answerCbQuery('✅ Procesando...');
              
              const userId = ctx.from.id;
              const callbackData = ctx.callbackQuery.data;
              
              console.log('handleCargarConfirm called:', { userId, callbackData });
              
              // Extract identifier from callback_data FIRST
              let identifier = null;
              if (callbackData.startsWith('cargar_confirm_')) {
                const encodedIdentifier = callbackData.replace('cargar_confirm_', '');
                console.log('Encoded identifier:', encodedIdentifier);
                identifier = decodeIdentifier(encodedIdentifier);
                console.log('Decoded identifier:', identifier);
              }
              
              // Get existing data from stateManager
              const existingData = stateManager.getData(userId);
              console.log('Existing data from stateManager:', existingData);
              
              // Try to get identifier from stateManager if not in callback
              if (!identifier && existingData && existingData.identifier) {
                identifier = existingData.identifier;
                console.log('Identifier from stateManager:', identifier);
              }
              
              // Get amount from existing data (should be there from handleCargarAmount)
              let amount = existingData?.amount;
              console.log('Amount from stateManager:', amount);
              
              // If amount is still not found, it means state was lost - try to recover from message
              if (!amount || !identifier) {
                // Try to extract from the message text that contains the callback
                const messageText = ctx.callbackQuery.message?.text || '';
                console.log('Message text for extraction:', messageText);
                
                // Try to extract amount from message: "Monto: 100 USDT" or "Monto: *100 USDT*"
                if (!amount) {
                  const amountMatch = messageText.match(/Monto:\s*\*?(\d+(?:\.\d+)?)\s*USDT/i);
                  if (amountMatch) {
                    amount = parseFloat(amountMatch[1]);
                    console.log('Amount extracted from message:', amount);
                  }
                }
                
                // Try alternative pattern: just numbers before USDT (first occurrence)
                if (!amount) {
                  const altAmountMatch = messageText.match(/(\d+(?:\.\d+)?)\s*USDT/i);
                  if (altAmountMatch) {
                    amount = parseFloat(altAmountMatch[1]);
                    console.log('Amount extracted from alternative pattern:', amount);
                  }
                }
                
                // Try to extract identifier from message: "ORDEN #123456"
                if (!identifier) {
                  const identifierMatch = messageText.match(/(ORDEN\s*#\d+)/i);
                  if (identifierMatch) {
                    identifier = identifierMatch[1];
                    console.log('Identifier extracted from message:', identifier);
                  }
                }
              }
      
      if (!identifier || !amount) {
        console.error('Missing data in handleCargarConfirm:', { 
          userId, 
          identifier, 
          amount, 
          existingData,
          callbackData,
          messageText: ctx.callbackQuery.message?.text 
        });
        await ctx.reply('❌ Error: No se encontró información de la carga. Por favor inicia el proceso nuevamente con /cargar');
        stateManager.clearState(userId);
        return;
      }

      // IMPORTANT: Save data with both amount and identifier
      // Make absolutely sure we have both values before saving
      if (!amount || !identifier) {
        console.error('CRITICAL: amount or identifier is missing before saving!', { amount, identifier });
        await ctx.reply('❌ Error: No se encontró información de la carga. Por favor inicia el proceso nuevamente con /cargar');
        stateManager.clearState(userId);
        return;
      }
      
      // Save data explicitly with proper types
      const amountNum = parseFloat(amount);
      const identifierStr = String(identifier);
      
      stateManager.setData(userId, { amount: amountNum, identifier: identifierStr });
      // Set state with null to not overwrite data
      stateManager.setState(userId, 'cargar_waiting_proof', null);
      
      // Verify data was saved
      const savedData = stateManager.getData(userId);
      const savedState = stateManager.getState(userId);
      console.log('State saved in handleCargarConfirm:', { userId, state: savedState, data: savedData });
      
      // Final verification before proceeding
      if (!savedData || !savedData.amount || !savedData.identifier) {
        console.error('CRITICAL: Data verification failed after save!', { savedData });
        await ctx.reply('❌ Error: No se pudo guardar la información. Por favor inicia el proceso nuevamente con /cargar');
        stateManager.clearState(userId);
        return;
      }
      
      const proofMsg = await messageService.getMessage('cargar_proof_prompt');
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
        }
      };
      
      // Don't clean chat here - keep messages visible
      // await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(proofMsg, keyboard);
      chatManager.registerBotMessage(userId, sentMessage.message_id);
    } catch (error) {
      console.error('Error in handleCargarConfirm:', error);
      console.error('Error stack:', error.stack);
      try {
        await ctx.answerCbQuery('❌ Error al procesar confirmación', true);
      } catch (e) {
        // Ignore if callback already answered
      }
      await ctx.reply('❌ Error al procesar confirmación.');
    }
  },

  async handleCargarCancel(ctx) {
    try {
      await ctx.answerCbQuery('❌ Operación cancelada');
      const userId = ctx.from.id;
      stateManager.clearState(userId);
      const cancelMsg = `❌ *Operación cancelada*\n\n` +
        `No se realizaron movimientos.\n\n` +
        `⬅️ *Regresar al menú principal*`;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
        }
      };
      
      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const sentMessage = await ctx.replyWithMarkdown(cancelMsg, keyboard);
      chatManager.registerBotMessage(userId, sentMessage.message_id);
    } catch (error) {
      console.error('Error in handleCargarCancel:', error);
      try {
        await ctx.answerCbQuery('❌ Error', true);
      } catch (e) {
        // Ignore if already answered
      }
    }
  },

  async handlePhoto(ctx) {
    try {
      const userId = ctx.from.id;
      const state = stateManager.getState(userId);
      const data = stateManager.getData(userId);

      console.log('Photo received:', { userId, state, data });

      // Si está en estado de enviar noticia, manejar la foto
      if (state === 'admin_sending_noticia') {
        await this.handleAdminNoticiaPhoto(ctx);
        return;
      }

      if (state !== 'cargar_waiting_proof') {
        console.log(`Photo received but state is not 'cargar_waiting_proof'. Current state: ${state}, data:`, data);
        
        // If state is null but we have data, try to recover
        if (!state && data && data.amount && data.identifier) {
          console.log('Recovering state from data...');
          stateManager.setState(userId, 'cargar_waiting_proof');
        } else {
          await ctx.reply('❌ Error: No hay una solicitud de carga activa. Por favor inicia el proceso nuevamente con /cargar');
          return;
        }
      }

      const user = await getOrCreateUser(userId, ctx.from.username);
      const finalData = stateManager.getData(userId);

      if (!finalData || !finalData.amount || !finalData.identifier) {
        console.error('Missing data in handlePhoto after recovery:', { userId, state, finalData });
        await ctx.reply('❌ Error: No se encontró información de la carga. Por favor inicia el proceso nuevamente con /cargar');
        stateManager.clearState(userId);
        return;
      }

      // Get the largest photo (best quality) - use file_id to forward, no download needed
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileId = photo.file_id;
      const messageId = ctx.message.message_id;
      const chatId = ctx.chat.id;

      // Create transaction (without local file storage)
      const transactionResult = await pool.query(
        `INSERT INTO transactions (user_id, type, amount_usdt, identifier, status, proof_image)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user.id, 'carga', finalData.amount, finalData.identifier, 'pendiente', fileId]
      );

      const transaction = transactionResult.rows[0];

      await webhookService.emit('transactions.created', {
        transactionId: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amountUsdt: Number(transaction.amount_usdt || 0),
        amountArs: transaction.amount_ars ? Number(transaction.amount_ars) : null,
        identifier: transaction.identifier,
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: ctx.from.username || null
        },
        channel: 'carga',
        createdAt: transaction.created_at
      });

      // Message for admin groups (orders) - with photo and buttons
      const identifierLine = finalData.identifier ? `Identificador: ${finalData.identifier}` : null;
      const orderMessage = [
        '═══════════════════════',
        ' NUEVA ORDEN DE CARGA',
        '═══════════════════════',
        `Monto USDT: ${Number(finalData.amount).toFixed(2)}`,
        `Cliente: @${ctx.from.username || 'sin_username'}`,
        identifierLine,
        `Transacción #: ${transaction.id}`,
        '──────────────',
        'Seleccione una acción utilizando los botones.'
      ].filter(Boolean).join('\n');
        
      const orderKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Acreditar saldo', callback_data: `cargar_confirm_order_${transaction.id}` }],
            [{ text: 'Rechazar', callback_data: `cargar_reject_order_${transaction.id}` }]
          ]
        }
      };

      // Send photo to COMPROBANTES GROUP ONLY - solo https://t.me/+rjez71wbaYk4Yzdh
      const botInstance = require('../bot').bot;
      const comprobantesGroupLink = 'https://t.me/+rjez71wbaYk4Yzdh';
      
      let sentToAdminGroup = false;
      let adminGroupMessageId = null;
      let adminGroupChatId = null;
      
      // Send photo WITH buttons to comprobantes group ONLY
      try {
        const groupChatId = await groupManager.getGroupChatId(botInstance, comprobantesGroupLink);
        
        if (groupChatId) {
          try {
            // Usar sendPhoto con file_id directamente (incluye foto y botones en un solo mensaje)
            // Esto facilita eliminar todo junto cuando se rechaza
            const sentPhoto = await botInstance.telegram.sendPhoto(
              groupChatId,
              fileId,
              {
                caption: orderMessage,
                reply_markup: orderKeyboard.reply_markup
              }
            );
            adminGroupMessageId = sentPhoto.message_id;
            adminGroupChatId = groupChatId;
            sentToAdminGroup = true;
            console.log(`Photo with buttons sent successfully to comprobantes group ${comprobantesGroupLink}`);
          } catch (error) {
            console.error(`Error sending photo to comprobantes group ${comprobantesGroupLink}:`, error.message);
            console.error(`Error details:`, error);
          }
        } else {
          console.warn(`Chat ID not found for comprobantes group: ${comprobantesGroupLink}`);
        }
      } catch (error) {
        console.error(`Error processing comprobantes group ${comprobantesGroupLink}:`, error.message);
      }
      
      // Guardar message_id y chat_id en la transacción para poder eliminarlo después si se rechaza
      // Formato: file_id|chat_id|message_id|photo_message_id (si forwardMessage se usó)
      let photoMessageId = null;
      if (sentToAdminGroup) {
        // Si usamos forwardMessage, necesitamos guardar también el message_id de la foto reenviada
        // Por ahora, guardamos solo el mensaje con botones (que contiene la foto si usamos sendPhoto)
        await pool.query(
          'UPDATE transactions SET proof_image = $1 WHERE id = $2',
          [`${fileId}|${adminGroupChatId}|${adminGroupMessageId}`, transaction.id]
        );
      }
      
      if (!sentToAdminGroup) {
        console.warn('Photo was not sent to any admin group. Groups may not be configured.');
      }

        // Show processing animation
        const processingMsg = await ctx.reply('[+] Procesando comprobante...', { parse_mode: 'Markdown' });
        chatManager.registerBotMessage(userId, processingMsg.message_id);

        await animationManager.showProgress(
          ctx,
          processingMsg.message_id,
          '[+] Procesando comprobante',
          1500,
          4
        );

        stateManager.clearState(userId);
        
        const receivedMsg = await messageService.getMessage('cargar_proof_received');
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
          }
        };

        await animationManager.showResult(ctx, processingMsg.message_id, true, receivedMsg);
        await ctx.telegram.editMessageReplyMarkup(
          ctx.chat.id,
          processingMsg.message_id,
          null,
          keyboard.reply_markup
        );
      // No need to download - we forward using file_id
    } catch (error) {
      console.error('Error in handlePhoto:', error);
      console.error('Error stack:', error.stack);
      await ctx.reply('❌ Error al procesar comprobante. Intenta nuevamente.');
    }
  },

  async handlePagarDNI(ctx, dni) {
    const data = stateManager.getData(ctx.from.id);
    const type = data?.type || 'multas';
    
    // Extraer solo la primera línea (el DNI) en caso de que el usuario envíe múltiples líneas
    const dniOnly = dni.split('\n')[0].trim();
    
    // Validar longitud del DNI (exactamente 8 caracteres)
    if (dniOnly.length !== 8) {
      await ctx.reply('⚠️ El DNI debe contener exactamente 8 dígitos. Ingréselo nuevamente.');
      return;
    }
    
    // Validar que sean solo números
    if (!/^\d+$/.test(dniOnly)) {
      await ctx.reply('⚠️ El DNI debe contener únicamente números. Ingréselo nuevamente.');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...data, dni: dniOnly });
    
    if (type === 'multas') {
      stateManager.setState(ctx.from.id, 'pagar_waiting_tramite');
      
      const message = `[+] 💭 Ingrese el tipo de trámite:\n\n⬅️ *Regresar al menú principal*`;
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
        }
      };
      
      // NO limpiar mensajes durante el flujo de entrada de datos - solo responder
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    }
  },

  async handlePagarTramite(ctx, tramite) {
    // Extraer solo la primera línea en caso de múltiples líneas
    const tramiteOnly = tramite.split('\n')[0].trim();
    
    // Validar longitud del trámite (exactamente 11 caracteres)
    if (tramiteOnly.length !== 11) {
      await ctx.reply('⚠️ El número de trámite debe contener 11 caracteres. Verifique la información.');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...stateManager.getData(ctx.from.id), tramite: tramiteOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_sexo');
    
    const message = `[+] ⚧️ Ingrese el sexo (M o F):\n\n⬅️ *Regresar al menú principal*`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    // NO limpiar mensajes durante el flujo de entrada de datos - solo responder
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarSexo(ctx, sexo) {
    // Extraer solo la primera línea y validar que sea M o F
    const sexoOnly = sexo.split('\n')[0].trim().toUpperCase();
    if (sexoOnly !== 'M' && sexoOnly !== 'F') {
      await ctx.reply('⚠️ Ingrese únicamente M o F.');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...stateManager.getData(ctx.from.id), sexo: sexoOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_patente');
    
    const message = `[+] 💭 Ingrese la patente:\n\n⬅️ *Regresar al menú principal*`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    // NO limpiar mensajes durante el flujo de entrada de datos - solo responder
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarPatente(ctx, patente) {
    // Extraer solo la primera línea en caso de múltiples líneas
    const patenteOnly = patente.split('\n')[0].trim().toUpperCase();
    
    // Validar longitud de la patente (exactamente 6 caracteres)
    if (patenteOnly.length !== 6) {
      await ctx.reply('⚠️ La patente debe contener 6 caracteres. Verifique e ingrese nuevamente.');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...stateManager.getData(ctx.from.id), patente: patenteOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    // NO limpiar mensajes durante el flujo de entrada de datos - solo responder
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarMacroNombreServicio(ctx, nombreServicio) {
    // Extraer solo la primera línea en caso de múltiples líneas
    const nombreServicioOnly = nombreServicio.split('\n')[0].trim();
    
    if (!nombreServicioOnly || nombreServicioOnly.length < 2) {
      await ctx.reply('⚠️ Ingrese un nombre de servicio válido (mínimo 2 caracteres).');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...stateManager.getData(ctx.from.id), nombre_servicio: nombreServicioOnly });
    stateManager.setState(ctx.from.id, 'pagar_macro_waiting_dni');
    
    const message = [
      `🧾 Servicio registrado: *${nombreServicioOnly}*`,
      '',
      '🔢 Ingresá el código de pago / número de servicio asociado:',
      '',
      '⬅️ *Regresar al menú principal*'
    ].join('\n');
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarMacroDNI(ctx, dni) {
    // Extraer solo la primera línea en caso de múltiples líneas
    const dniOnly = dni.split('\n')[0].trim();
    
    if (!dniOnly || dniOnly.length < 4) {
      await ctx.reply('⚠️ Ingrese un número de servicio válido (mínimo 4 caracteres).');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...stateManager.getData(ctx.from.id), dni: dniOnly });
    stateManager.setState(ctx.from.id, 'pagar_macro_waiting_monto');
    
    const message = [
      `+ 🔢 Código de pago registrado: *${dniOnly}*`,
      '',
      '💰 Ingresá el monto total en ARS:',
      '',
      '📝 *Formato:*',
      'Ejemplo: `500000,00`',
      'Se interpreta como: *$ 500.000,00*',
      '',
      '⬅️ *Regresar al menú principal*'
    ].join('\n');
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarMacroNombre(ctx, nombre) {
    // Extraer solo la primera línea en caso de múltiples líneas
    const nombreOnly = nombre.split('\n')[0].trim();
    
    if (!nombreOnly || nombreOnly.length < 2) {
      await ctx.reply('⚠️ Ingrese un nombre válido (mínimo 2 caracteres).');
      return;
    }
    
    stateManager.setData(ctx.from.id, { ...stateManager.getData(ctx.from.id), nombre: nombreOnly });
    stateManager.setState(ctx.from.id, 'pagar_macro_waiting_monto');
    
    const message = `[+] 👤 Nombre registrado: ${nombreOnly}\n\n` +
      `💰 *Ingrese el monto a pagar (en ARS)*\n\n` +
      `📝 *Formato:*\n` +
      `Ejemplo: \`500000,00\`\n` +
      `Se interpreta como: *$ 500.000,00*\n\n` +
      `⬅️ *Regresar al menú principal*`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    // NO limpiar mensajes durante el flujo de entrada de datos - solo responder
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarMacroMonto(ctx, montoText) {
    try {
      // Normalizar formato: aceptar coma como separador decimal y remover puntos de miles
      // Ejemplo: "500000,00" o "500.000,00" -> 500000.00
      let montoNormalizado = montoText.trim()
        .replace(/\./g, '') // Remover puntos (separadores de miles)
        .replace(',', '.'); // Reemplazar coma por punto (separador decimal)
      
      const monto = parseFloat(montoNormalizado);
      
      if (isNaN(monto) || monto <= 0) {
        const errorMsg = `⚠️ Monto inválido. Ingrese el valor utilizando el formato \`500000,00\`.\n\nEjemplo: \`500000,00\` = $ 500.000,00`;
        await ctx.replyWithMarkdown(errorMsg);
        return;
      }

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const data = stateManager.getData(ctx.from.id);
      
      // Convert ARS to USDT and calculate porcentaje personalizado
      const montoTotalUSDT = await priceService.convertARSToUSDT(monto);
      const feeData = await calculateFeeForUser({
        user,
        amountArs: monto,
        precomputedUSDT: montoTotalUSDT
      });
      const amountUSDT = feeData.feeUsdt;
      const percentageLabel = feeData.percentageLabel;
      
      // Ensure saldo_usdt is a number
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt < amountUSDT) {
        const errorMsg = `❌ *Saldo insuficiente*\n\n` +
          `Necesitás: ${amountUSDT.toFixed(2)} USDT\n` +
          `Tenés: ${saldoUsdt.toFixed(2)} USDT`;
        await ctx.reply(errorMsg);
        stateManager.clearState(ctx.from.id);
        return;
      }

      stateManager.setData(ctx.from.id, {
        ...data,
        monto,
        feePercent: feeData.percentApplied,
        feePercentLabel: percentageLabel,
        feeMinAmountArs: feeData.minArs,
        montoTotalUSDT,
        feeUsdt: amountUSDT
      });

      // Show validation animation
      const loadingMsg = await ctx.reply('[+] Validando pasarela...', { parse_mode: 'Markdown' });
      chatManager.registerBotMessage(ctx.from.id, loadingMsg.message_id);

      await animationManager.showProgress(
        ctx,
        loadingMsg.message_id,
        '[+] Validando pasarela',
        1500,
        3
      );

      await animationManager.showResult(
        ctx,
        loadingMsg.message_id,
        true,
        '✅ Validación completada con éxito.'
      );

      // Show summary
      await new Promise(resolve => setTimeout(resolve, 500));

      const summaryMessage = `💳 *Confirmá el pago:*\n\n` +
        `📋 Servicio: ${data.nombre_servicio || 'N/A'}\n` +
        `📄 Número/DNI: ${data.dni || 'N/A'}\n` +
        `💰 Monto: $${monto} ARS\n` +
        `💵 Monto Total (USDT): ${montoTotalUSDT.toFixed(2)}\n` +
        `💵 Total a cobrar (${percentageLabel}): ${amountUSDT} USDT\n\n` +
        `¿Deseás continuar?`;

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Confirmar', callback_data: `macro_confirm_${monto}_${amountUSDT}` },
              { text: 'Cancelar', callback_data: `macro_cancel_${monto}` }
            ],
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
        }
      };

      await chatManager.cleanChat(ctx, ctx.from.id, 1);
      const summarySent = await ctx.replyWithMarkdown(summaryMessage, keyboard);
      chatManager.registerBotMessage(ctx.from.id, summarySent.message_id);
    } catch (error) {
      console.error('Error in handlePagarMacroMonto:', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      await ctx.reply(errorMsg);
      stateManager.clearState(ctx.from.id);
    }
  },

  async handlePagarMonto(ctx, montoText) {
    try {
      console.log(`[DEBUG handlePagarMonto] Called with text: "${montoText}"`);
      
      // Check if user is trying to use a button instead of entering amount
      if (montoText === '🏠 MENU PRINCIPAL' || montoText === 'MENU PRINCIPAL' || 
          montoText === 'Sí' || montoText === 'No' || 
          montoText === 'Confirmar' || montoText === 'Cancelar') {
        console.log(`[DEBUG handlePagarMonto] User pressed button instead of entering amount, ignoring`);
        return;
      }
      
      // Normalizar formato: aceptar coma como separador decimal y remover puntos de miles
      // Ejemplo: "500000,00" o "500.000,00" -> 500000.00
      let montoNormalizado = montoText.trim()
        .replace(/\./g, '') // Remover puntos (separadores de miles)
        .replace(',', '.'); // Reemplazar coma por punto (separador decimal)
      
      const monto = parseFloat(montoNormalizado);
      
      if (isNaN(monto) || monto <= 0) {
        const errorMsg = `⚠️ Monto inválido. Ingrese el valor utilizando el formato \`500000,00\`.\n\nEjemplo: \`500000,00\` = $ 500.000,00`;
        await ctx.replyWithMarkdown(errorMsg);
        return;
      }

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const data = stateManager.getData(ctx.from.id);
      const type = (data && data.type) || 'multas';
      
      // Debug logging
      console.log(`[DEBUG handlePagarMonto] Monto ARS: ${monto}, Type: ${type}, Data:`, JSON.stringify(data));
      console.log(`[DEBUG handlePagarMonto] Current state: ${stateManager.getState(ctx.from.id)}`);
      
      // Calculate final USDT amount with porcentaje personalizado
      const montoTotalUSDT = await priceService.convertARSToUSDT(monto);
      console.log(`[DEBUG handlePagarMonto] Monto Total USDT: ${montoTotalUSDT}`);
      const feeData = await calculateFeeForUser({
        user,
        amountArs: monto,
        precomputedUSDT: montoTotalUSDT
      });
      let finalAmountUSDT = feeData.feeUsdt;
      const percentageLabel = feeData.percentageLabel;
      console.log(`[DEBUG handlePagarMonto] Porcentaje aplicado: ${feeData.percentApplied}`);
      console.log(`[DEBUG handlePagarMonto] Final Amount USDT (redondeado): ${finalAmountUSDT}`);
      
      // Ensure saldo_usdt is a number
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;
      
      if (saldoUsdt < finalAmountUSDT) {
        const errorMsg = await messageService.getMessage('pagar_saldo_insuficiente', {
          needed: finalAmountUSDT.toFixed(2),
          have: saldoUsdt.toFixed(2)
        });
        await ctx.reply(errorMsg);
        stateManager.clearState(ctx.from.id);
        return;
      }

      stateManager.setData(ctx.from.id, {
        ...data,
        monto,
        finalAmountUSDT,
        feePercent: feeData.percentApplied,
        feePercentLabel: percentageLabel,
        feeMinAmountArs: feeData.minArs,
        montoTotalUSDT
      });

      // For multas, show summary and ask for confirmation BEFORE creating transaction
      if (type === 'multas') {
        const montoFormateado = formatARS(monto);
        const multaTipo = data.multa_tipo || 'PBA';
        const montoTotalUSDTGeneral = data?.montoTotalUSDT || await priceService.convertARSToUSDT(monto);

        // Show summary with confirmation buttons - formato diferente según tipo
        let summaryMessage;
        if (multaTipo === 'PBA') {
          summaryMessage = `*Dueño de la multa:*\n\n` +
            `🆔 *DNI:* ${data.dni || 'N/A'}\n` +
            `⚧️ *Sexo:* ${data.sexo || 'N/A'}\n` +
            `📄 *N° de trámite:* ${data.tramite || 'N/A'}\n` +
            `🚗 *Patente:* ${data.patente || 'N/A'}\n\n` +
            `💰 *Monto Multa ARS:* ${montoFormateado}\n` +
            `💵 *Monto Total (USDT):* ${montoTotalUSDT.toFixed(2)}\n` +
            `💵 *Total a cobrar (${percentageLabel}):* ${finalAmountUSDT} USDT\n\n` +
            `¿Deseas confirmar la orden?`;
        } else {
          // Para multas no PBA, mostrar formato simplificado
          let datoPago = 'N/A';
          let datoLabel = 'Dato';
          
          if (multaTipo === 'CABA') {
            datoPago = data.patente || 'N/A';
            datoLabel = '🚗 Patente';
          } else if (multaTipo === 'ENTRE_RIOS' || multaTipo === 'CORRIENTES' || multaTipo === 'SANTA_FE' || multaTipo === 'OTRA') {
            if (data.codigo) {
              datoPago = data.codigo;
              datoLabel = '📄 Código';
            } else if (data.patente) {
              datoPago = data.patente;
              datoLabel = '🚗 Patente';
            } else if (data.login) {
              datoPago = data.login;
              datoLabel = '🔑 Login';
            }
          }
          
          summaryMessage = `*Dato de pago:*\n\n` +
            `${datoLabel}: ${datoPago}\n\n` +
            `💰 *Monto Multa ARS:* ${montoFormateado}\n` +
            `💵 *Monto Total (USDT):* ${montoTotalUSDT.toFixed(2)}\n` +
            `💵 *Total a cobrar (${percentageLabel}):* ${finalAmountUSDT} USDT\n\n` +
            `¿Deseas confirmar la orden?`;
        }

        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Sí', callback_data: `multa_confirm_${monto}_${finalAmountUSDT.toFixed(2)}` },
                { text: 'No', callback_data: 'multa_cancel' }
              ]
            ]
          }
        };

        console.log(`[DEBUG handlePagarMonto] Showing confirmation for multas (type: ${multaTipo})`);
        await ctx.replyWithMarkdown(summaryMessage, keyboard);
        return;
      }

      // For non-multas types (otra, rentas), show confirmation BEFORE creating transaction
      
      // Build summary message based on type
      let summaryMessage;
      const montoFormateado = formatARS(monto);
      
      if (type === 'otra') {
        // For "PAGAR OTRO SERVICIO" - mostrar monto total y el porcentaje aplicado
        summaryMessage = `💳 *Confirmá el pago:*\n\n` +
          `📋 Servicio: ${data.nombre_servicio || 'N/A'}\n` +
          `📄 Código/Número: ${data.codigo || 'N/A'}\n` +
          `💰 Monto: ${montoFormateado} ARS\n` +
          `💵 Monto Total (USDT): ${montoTotalUSDT.toFixed(2)}\n` +
          `💵 Total a cobrar (${percentageLabel}): ${finalAmountUSDT} USDT\n\n` +
          `¿Deseás confirmar la orden?`;
      } else if (type === 'rentas') {
        // For rentas
        const rentaTipo = data.renta_tipo || 'AUTOMOTOR';
        let datoLabel = 'Patente';
        let datoValor = data.patente || 'N/A';
        
        if (rentaTipo === 'INMOBILIARIO') {
          datoLabel = 'Partida';
          datoValor = data.partida || data.patente || 'N/A';
        } else if (rentaTipo === 'INGRESOS_BRUTOS') {
          datoLabel = 'CUIT';
          datoValor = data.cuit || data.patente || 'N/A';
        } else if (rentaTipo === 'SELLOS') {
          datoLabel = 'Dato';
          datoValor = data.codigo || data.patente || 'N/A';
        } else if (rentaTipo === 'CAMINERA') {
          datoLabel = 'Patente';
          datoValor = data.patente || 'N/A';
        }
        
        summaryMessage = `💳 *Confirmá el pago (Rentas Córdoba):*\n\n` +
          `📋 Tipo: ${rentaTipo.replace('_', ' ')}\n` +
          `📄 ${datoLabel}: ${datoValor}\n` +
          `💰 Monto: ${montoFormateado} ARS\n` +
          `💵 Monto Total (USDT): ${montoTotalUSDT.toFixed(2)}\n` +
          `💵 Total a cobrar (${percentageLabel}): ${finalAmountUSDT} USDT\n\n` +
          `¿Deseás confirmar la orden?`;
      } else {
        // Fallback for any other type
        summaryMessage = `💳 *Confirmá el pago:*\n\n` +
          `💰 Monto: ${montoFormateado} ARS\n` +
          `💵 Monto Total (USDT): ${montoTotalUSDT.toFixed(2)}\n` +
          `💵 Total a cobrar (${percentageLabel}): ${finalAmountUSDT.toFixed(2)} USDT\n\n` +
          `¿Deseás confirmar la orden?`;
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Sí', callback_data: `pago_confirm_${type}_${monto}_${finalAmountUSDT.toFixed(2)}` },
              { text: 'No', callback_data: `pago_cancel_${type}` }
            ]
          ]
        }
      };
      
      // IMPORTANT: Clear the waiting state BEFORE showing confirmation
      // This prevents the user from entering the amount again
      stateManager.setState(ctx.from.id, `pagar_waiting_confirm_${type}`);
      
      console.log(`[DEBUG handlePagarMonto] Showing confirmation message for type: ${type}`);
      await ctx.replyWithMarkdown(summaryMessage, keyboard);
      return;
    } catch (error) {
      console.error('Error in handlePagarMonto (outer):', error);
      const errorMsg = await messageService.getMessage('pagar_error');
      await ctx.reply(errorMsg);
      stateManager.clearState(ctx.from.id);
    }
  },

  async handleCancelarMotivo(ctx, motivo) {
    // This is handled in admin handlers
  },

  async handleMacroConfirm(ctx, callbackData) {
    try {
      // Parse data: macro_confirm_monto_amountUSDT
      const parts = callbackData.split('_');
      const monto = parseFloat(parts[2]);
      const amountUSDT = parseFloat(parts[3]);
      const data = stateManager.getData(ctx.from.id);
      const feePercent = data?.feePercent !== undefined ? data.feePercent : DEFAULT_FEE_PERCENTAGE;
      const percentageLabel = data?.feePercentLabel || formatPercentage(feePercent);
      const feePercent = data?.feePercent !== undefined ? data.feePercent : DEFAULT_FEE_PERCENTAGE;
      const percentageLabel = data?.feePercentLabel || formatPercentage(feePercent);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const saldoUsdt = parseFloat(user.saldo_usdt) || 0;

      if (saldoUsdt < amountUSDT) {
        await ctx.answerCbQuery('❌ Saldo insuficiente', true);
        return;
      }

      // Use database transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock user row and check balance
        const userResult = await client.query(
          'SELECT saldo_usdt FROM users WHERE id = $1 FOR UPDATE',
          [user.id]
        );
        
        const currentBalance = parseFloat(userResult.rows[0].saldo_usdt) || 0;
        
        if (currentBalance < amountUSDT) {
          await client.query('ROLLBACK');
          await ctx.answerCbQuery('❌ Saldo insuficiente', true);
          return;
        }

        // Create transaction record
        const transactionResult = await client.query(
          `INSERT INTO transactions (user_id, type, amount_usdt, amount_ars, status, review_started_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
          [user.id, 'pago', amountUSDT, monto, 'procesando']
        );

        const transaction = transactionResult.rows[0];

        await webhookService.emit('transactions.created', {
          transactionId: transaction.id,
          type: transaction.type,
          status: transaction.status,
          amountUsdt: Number(transaction.amount_usdt || 0),
          amountArs: Number(transaction.amount_ars || 0),
          user: {
            id: user.id,
            telegramId: user.telegram_id,
            username: ctx.from.username || null
          },
          channel: 'macro',
          metadata: {
            servicio: data?.nombre_servicio || null,
            referencia: data?.dni || null
          },
          createdAt: transaction.created_at
        });

        // Deduct balance
        await client.query(
          'UPDATE users SET saldo_usdt = saldo_usdt - $1 WHERE id = $2',
          [amountUSDT, user.id]
        );

        await client.query('COMMIT');

        // Get updated balance
        const updatedBalanceResult = await pool.query(
          'SELECT saldo_usdt FROM users WHERE id = $1',
          [user.id]
        );
        const updatedBalance = parseFloat(updatedBalanceResult.rows[0].saldo_usdt) || 0;

        // Show notification animation
        const notifyMsg = await ctx.reply('[+] Enviando a verificación...', { parse_mode: 'Markdown' });
        await animationManager.showProgress(
          ctx,
          notifyMsg.message_id,
          '[+] Enviando a verificación',
          1000,
          2
        );

        await animationManager.showResult(
          ctx,
          notifyMsg.message_id,
          true,
          '✅ Enviada al grupo de administración.'
        );

        // Format message for admin group (sin nombre del titular)
        const montoTotalUSDTMacro = data?.montoTotalUSDT || await priceService.convertARSToUSDT(monto);
        const usernameText = ctx.from.username ? `@${ctx.from.username}` : 'sin_username';
        const servicioText = data.nombre_servicio || 'N/A';
        const dniText = data.dni || 'N/A';
        const montoArsTexto = formatARS(monto);

        const adminMessage = [
          '╔══════════════════════════╗',
          '  SOLICITUD DE PAGO - MACRO/PLUS',
          '╚══════════════════════════╝',
          `Cliente: ${usernameText}`,
          `Servicio: ${servicioText}`,
          `Número / DNI: ${dniText}`,
          `Monto ARS: ${montoArsTexto}`,
          `Monto total USDT: ${montoTotalUSDTMacro.toFixed(2)}`,
          `Cobrado (${percentageLabel}): ${amountUSDT.toFixed(2)} USDT`,
          `Transacción #: ${transaction.id}`,
          'Estado: PROCESANDO',
          '──────────────',
          'Utilice los botones para aprobar o cancelar.'
        ].join('\n');

        const adminKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Pagado', callback_data: `pago_confirm_${transaction.id}` }],
              [{ text: 'Cancelar', callback_data: `pago_cancel_${transaction.id}` }]
            ]
          }
        };

        // Send to admin groups
        const botInstance = require('../bot').bot;
        try {
          await groupManager.sendToAdminGroups(botInstance, adminMessage, {
            reply_markup: adminKeyboard.reply_markup
          });
        } catch (error) {
          console.error('Error sending Macro payment to admin groups:', error);
          // Continue even if group send fails
        }

        stateManager.clearState(ctx.from.id);

        // Limpiar todos los mensajes del chat después de procesar el pago
        await chatManager.cleanChat(ctx, ctx.from.id, 0);
        
        // Mostrar mensaje de confirmación con monto
        const montoFormateado = formatARS(monto);
        const confirmMsg = `✅ *Orden enviada*\n\n` +
          `Su pago fue recibido correctamente.\n` +
          `Le notificaremos cuando finalice la gestión.\n\n` +
          `MONTO PAGADO: ${montoFormateado}\n` +
          `COBRADO: ${amountUSDT.toFixed(0)} USDT (${percentageLabel})`;

        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
          }
        };

        const finalMsg = await ctx.replyWithMarkdown(confirmMsg, keyboard);
        chatManager.registerBotMessage(ctx.from.id, finalMsg.message_id);
        
        // Guardar message_id del mensaje de confirmación en la transacción para poder editarlo después
        // Formato: user_message|chat_id|message_id
        const userMessageInfo = `user_message|${ctx.chat.id}|${finalMsg.message_id}`;
        await pool.query(
          'UPDATE transactions SET proof_image = $1 WHERE id = $2',
          [userMessageInfo, transaction.id]
        );

        const receiptDetails = {
          transactionId: transaction.id,
          headerName: servicioText || 'MACRO/PLUS',
          serviceName: servicioText !== 'N/A' ? servicioText : 'Macro / PlusPagos',
          codeLabel: 'Número / DNI',
          codeValue: dniText || 'N/A',
          amountFormatted: montoFormateado
        };

        await ctx.answerCbQuery('✅ Pago confirmado');

        const receiptMsg = await sendPaymentReceiptPDF(ctx, receiptDetails);
        if (receiptMsg) {
          chatManager.registerBotMessage(ctx.from.id, receiptMsg.message_id);
        }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in handleMacroConfirm:', error);
      await ctx.answerCbQuery('❌ Error al procesar pago', true);
      stateManager.clearState(ctx.from.id);
    }
  },

  async handleMacroCancel(ctx) {
    stateManager.clearState(ctx.from.id);
    
    // Limpiar todos los mensajes del chat después de cancelar
    await chatManager.cleanChat(ctx, ctx.from.id, 0);
    
    const cancelMsg = `❌ *Operación cancelada*\n\n` +
      `No se realizaron movimientos.\n\n` +
      `💡 Usa /movimientos para ver todos tus movimientos.\n\n` +
      `⬅️ *Regresar al menú principal*`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(cancelMsg, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    await ctx.answerCbQuery('❌ Operación cancelada');
  },

  async handlePagoConfirmOtraRentas(ctx, callbackData) {
    try {
      // Delete the confirmation message first
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.warn('Could not delete confirmation message:', deleteError.message);
      }

      // Parse data: pago_confirm_otra_monto_amountUSDT or pago_confirm_rentas_monto_amountUSDT
      const parts = callbackData.split('_');
      const type = parts[2]; // 'otra' or 'rentas'
      const monto = parseFloat(parts[3]);
      const amountUSDT = parseFloat(parts[4]);
      const data = stateManager.getData(ctx.from.id);
      const feePercent = data?.feePercent !== undefined ? data.feePercent : DEFAULT_FEE_PERCENTAGE;
      const percentageLabel = data?.feePercentLabel || formatPercentage(feePercent);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      
      // Use database transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock user row and check balance
        const userResult = await client.query(
          'SELECT saldo_usdt FROM users WHERE id = $1 FOR UPDATE',
          [user.id]
        );
        
        const currentBalance = parseFloat(userResult.rows[0].saldo_usdt) || 0;
        
        if (currentBalance < amountUSDT) {
          await client.query('ROLLBACK');
          await ctx.answerCbQuery('❌ Saldo insuficiente', true);
          return;
        }

        // Create transaction record
        const transactionResult = await client.query(
          `INSERT INTO transactions (user_id, type, amount_usdt, amount_ars, status, review_started_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
          [user.id, 'pago', amountUSDT, monto, 'procesando']
        );

        const transaction = transactionResult.rows[0];

        // Deduct balance
        await client.query(
          'UPDATE users SET saldo_usdt = saldo_usdt - $1 WHERE id = $2',
          [amountUSDT, user.id]
        );

        await client.query('COMMIT');

        await webhookService.emit('transactions.created', {
          transactionId: transaction.id,
          type: transaction.type,
          status: transaction.status,
          amountUsdt: Number(transaction.amount_usdt || 0),
          amountArs: Number(transaction.amount_ars || 0),
          user: {
            id: user.id,
            telegramId: user.telegram_id,
            username: ctx.from.username || null
          },
          channel: type === 'otra' ? 'otro_servicio' : 'rentas',
          metadata: {
            servicio: data?.nombre_servicio || null,
            codigo: data?.codigo || data?.dni || data?.patente || null,
            subtipo: data?.subtipo || data?.rentas_tipo || null
          },
          createdAt: transaction.created_at
        });

        // Format message for admin group
        const montoFormateadoAdmin = formatARS(monto);
        const montoTotalUSDTGeneral = data?.montoTotalUSDT || await priceService.convertARSToUSDT(monto);
        let adminMessage;
        let receiptDetails = null;
        const usernameText = ctx.from.username ? `@${ctx.from.username}` : 'sin_username';
        
        if (type === 'otra') {
          const serviceName = data.nombre_servicio || 'Otro Servicio';
          receiptDetails = {
            transactionId: transaction.id,
            headerName: serviceName,
            serviceName,
            codeLabel: 'Código / Número',
            codeValue: data.codigo || 'N/A'
          };

          adminMessage = [
            '╔══════════════════════════╗',
            '  SOLICITUD DE PAGO - OTRO SERVICIO',
            '╚══════════════════════════╝',
            `Cliente: ${usernameText}`,
            `Servicio: ${data.nombre_servicio || 'N/A'}`,
            `Código / Número: ${data.codigo || 'N/A'}`,
            `Monto ARS: ${montoFormateadoAdmin}`,
            `Monto total USDT: ${montoTotalUSDTGeneral.toFixed(2)}`,
            `Cobrado (${percentageLabel}): ${amountUSDT.toFixed(2)} USDT`,
            `Transacción #: ${transaction.id}`,
            'Estado: PROCESANDO',
            '──────────────',
            'Utilice los botones para aprobar o cancelar.'
          ].join('\n');
        } else if (type === 'rentas') {
          const rentaTipo = data.renta_tipo || 'AUTOMOTOR';
          let datoLabel = 'Patente';
          let datoValor = data.patente || 'N/A';
          
          if (rentaTipo === 'INMOBILIARIO') {
            datoLabel = 'Partida';
            datoValor = data.partida || data.patente || 'N/A';
          } else if (rentaTipo === 'INGRESOS_BRUTOS') {
            datoLabel = 'CUIT';
            datoValor = data.cuit || data.patente || 'N/A';
          } else if (rentaTipo === 'SELLOS') {
            datoLabel = 'Dato';
            datoValor = data.codigo || data.patente || 'N/A';
          } else if (rentaTipo === 'CAMINERA') {
            datoLabel = 'Patente';
            datoValor = data.patente || 'N/A';
          }

          const rentaTipoText = rentaTipo.replace('_', ' ');
          const plainLabel = datoLabel.replace(/[^\w\sÁÉÍÓÚáéíóúÑñ0-9\/\-\.\#]/g, '').trim() || 'Dato';
          receiptDetails = {
            transactionId: transaction.id,
            headerName: rentaTipoText,
            serviceName: data.nombre_servicio || `Rentas Córdoba - ${rentaTipoText}`,
            codeLabel: plainLabel,
            codeValue: datoValor || 'N/A'
          };

          adminMessage = [
            '╔══════════════════════════╗',
            '  SOLICITUD DE PAGO - RENTAS CÓRDOBA',
            '╚══════════════════════════╝',
            `Cliente: ${usernameText}`,
            `Tipo: ${rentaTipoText}`,
            `${datoLabel}: ${datoValor}`,
            `Monto ARS: ${montoFormateadoAdmin}`,
            `Monto total USDT: ${montoTotalUSDTGeneral.toFixed(2)}`,
            `Cobrado (${percentageLabel}): ${amountUSDT.toFixed(2)} USDT`,
            `Transacción #: ${transaction.id}`,
            'Estado: PROCESANDO',
            '──────────────',
            'Utilice los botones para aprobar o cancelar.'
          ].join('\n');
        }

        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Pagado', callback_data: `pago_confirm_${transaction.id}` }],
              [{ text: 'Cancelar', callback_data: `pago_cancel_${transaction.id}` }]
            ]
          }
        };

        // Send to admin groups
        const botInstance = require('../bot').bot;
        try {
          await groupManager.sendToAdminGroups(botInstance, adminMessage, {
            reply_markup: keyboard.reply_markup
          });
        } catch (error) {
          console.error('Error sending payment to admin groups:', error);
        }

        stateManager.clearState(ctx.from.id);
        
        // Limpiar todos los mensajes del chat después de procesar el pago
        await chatManager.cleanChat(ctx, ctx.from.id, 0);
        
        // Mostrar mensaje de confirmación con monto
        const montoFormateado = formatARS(monto);
        const confirmMsg = `✅ *Orden enviada*\n\n` +
          `Su pago fue recibido correctamente.\n` +
          `Le notificaremos cuando finalice la gestión.\n\n` +
          `MONTO PAGADO: ${montoFormateado}\n` +
          `COBRADO: ${amountUSDT.toFixed(0)} USDT (${percentageLabel})`;
        
        const finalKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Regresar', callback_data: 'action_back' }]
            ]
          }
        };

        const finalMsg = await ctx.replyWithMarkdown(confirmMsg, finalKeyboard);
        chatManager.registerBotMessage(ctx.from.id, finalMsg.message_id);
        
        // Guardar message_id del mensaje de confirmación en la transacción para poder editarlo después
        // Formato: user_message|chat_id|message_id
        const userMessageInfo = `user_message|${ctx.chat.id}|${finalMsg.message_id}`;
        await pool.query(
          'UPDATE transactions SET proof_image = $1 WHERE id = $2',
          [userMessageInfo, transaction.id]
        );

        await ctx.answerCbQuery('✅ Orden confirmada');

        if (receiptDetails) {
          receiptDetails.amountFormatted = montoFormateado;
          const receiptMsg = await sendPaymentReceiptPDF(ctx, receiptDetails);
          if (receiptMsg) {
            chatManager.registerBotMessage(ctx.from.id, receiptMsg.message_id);
          }
        }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in handlePagoConfirmOtraRentas:', error);
      await ctx.answerCbQuery('❌ Error al procesar pago', true);
      stateManager.clearState(ctx.from.id);
    }
  },

  async handlePagoCancelOtraRentas(ctx, callbackData) {
    const parts = callbackData.split('_');
    const type = parts[2]; // 'otra' or 'rentas'
    
    stateManager.clearState(ctx.from.id);
    
    // Limpiar todos los mensajes del chat después de cancelar
    await chatManager.cleanChat(ctx, ctx.from.id, 0);
    
    const cancelMsg = `❌ *Operación cancelada*\n\n` +
      `No se realizaron movimientos.\n\n` +
      `💡 Usa /movimientos para ver todos tus movimientos.\n\n` +
      `⬅️ *Regresar al menú principal*`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(cancelMsg, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    await ctx.answerCbQuery('❌ Operación cancelada');
  },

  async handleMultaConfirm(ctx, callbackData) {
    try {
      // Delete the confirmation message first
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.warn('Could not delete confirmation message:', deleteError.message);
      }

      // Parse data: multa_confirm_monto_amountUSDT
      const parts = callbackData.split('_');
      const monto = parseFloat(parts[2]);
      const amountUSDT = parseFloat(parts[3]);
      const data = stateManager.getData(ctx.from.id);

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      
      // Use database transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock user row and check balance
        const userResult = await client.query(
          'SELECT saldo_usdt FROM users WHERE id = $1 FOR UPDATE',
          [user.id]
        );
        
        const currentBalance = parseFloat(userResult.rows[0].saldo_usdt) || 0;
        
        if (currentBalance < amountUSDT) {
          await client.query('ROLLBACK');
          await ctx.answerCbQuery('❌ Saldo insuficiente', true);
          return;
        }

        // Create transaction record
        const transactionResult = await client.query(
          `INSERT INTO transactions (user_id, type, amount_usdt, amount_ars, status, identifier)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [user.id, 'pago', amountUSDT, monto, 'pendiente', generateIdentifier()]
        );

        const transaction = transactionResult.rows[0];

        await webhookService.emit('transactions.created', {
          transactionId: transaction.id,
          type: transaction.type,
          status: transaction.status,
          amountUsdt: Number(transaction.amount_usdt || 0),
          amountArs: Number(transaction.amount_ars || 0),
          user: {
            id: user.id,
            telegramId: user.telegram_id,
            username: ctx.from.username || null
          },
          channel: 'multas',
          metadata: {
            servicio: data?.nombre_servicio || null,
            codigo: data?.codigo || data?.patente || data?.dni || null,
            jurisdiccion: data?.jurisdiccion || null
          },
          createdAt: transaction.created_at
        });

        // Deduct balance
        await client.query(
          'UPDATE users SET saldo_usdt = saldo_usdt - $1 WHERE id = $2',
          [amountUSDT, user.id]
        );

        await client.query('COMMIT');

        // Format message for admin group
        const montoFormateado = formatARS(monto);
        const multaTipo = data.multa_tipo || 'PBA';
        
        let adminMessage;
        let receiptDetails = null;
        
        // Si es PBA, usar formato antiguo
        const usernameText = ctx.from.username ? `@${ctx.from.username}` : 'sin_username';

        if (multaTipo === 'PBA') {
          const sexoText = data.sexo || 'N/A';
          const tramiteText = data.tramite || 'N/A';
          const patenteText = data.patente || 'N/A';

          receiptDetails = {
            transactionId: transaction.id,
            headerName: 'MULTAS PBA',
            serviceName: 'Multas PBA',
            codeLabel: 'N° de trámite',
            codeValue: tramiteText || patenteText || data.dni || 'N/A'
          };

          adminMessage = [
            '╔══════════════════════════╗',
            '  NUEVA ORDEN DE PAGO - MULTAS PBA',
            '╚══════════════════════════╝',
            `Orden #: ${transaction.id}`,
            `Usuario: ${usernameText}`,
            'Datos del titular:',
            `• DNI: ${data.dni || 'N/A'}`,
            `• Sexo: ${sexoText}`,
            `• Nº Trámite: ${tramiteText}`,
            `• Patente: ${patenteText}`,
            `Monto ARS: ${montoFormateado}`,
            `Cobrado (${percentageLabel}): ${amountUSDT.toFixed(2)} USDT`,
            'Estado: EN PROCESO',
            '──────────────',
            'Utilice los botones para admitir o cancelar.'
          ].join('\n');
        } else {
          // Para multas no PBA, usar nuevo formato
          // Determinar el "Dato de pago" según el tipo de multa
          let datoPago = 'N/A';
          let datoLabel = 'Dato';
          
          if (multaTipo === 'CABA') {
            datoPago = data.patente || 'N/A';
            datoLabel = '🚗 Patente';
          } else if (multaTipo === 'ENTRE_RIOS' || multaTipo === 'CORRIENTES' || multaTipo === 'SANTA_FE' || multaTipo === 'OTRA') {
            // Para estas multas, el dato puede ser código, patente, etc.
            if (data.codigo) {
              datoPago = data.codigo;
              datoLabel = '📄 Código';
            } else if (data.patente) {
              datoPago = data.patente;
              datoLabel = '🚗 Patente';
            } else if (data.login) {
              datoPago = data.login;
              datoLabel = '🔑 Login';
            } else {
              datoPago = 'N/A';
              datoLabel = '📄 Dato';
            }
          }
          
          const plainLabel = datoLabel.replace(/[^\w\sÁÉÍÓÚáéíóúÑñ0-9\/\-\.\#]/g, '').trim() || 'Dato';
          const serviceName = `Multas ${multaTipo.replace('_', ' ')}`;
          receiptDetails = {
            transactionId: transaction.id,
            headerName: serviceName,
            serviceName,
            codeLabel: plainLabel,
            codeValue: datoPago || 'N/A'
          };
          adminMessage = [
            '╔══════════════════════════╗',
            '  NUEVA ORDEN DE PAGO - MULTAS',
            '╚══════════════════════════╝',
            `Orden #: ${transaction.id}`,
            `Usuario: ${usernameText}`,
            'Dato de pago:',
            `${datoLabel}: ${datoPago}`,
            `Monto ARS: ${montoFormateado}`,
            `Monto total USDT: ${montoTotalUSDTGeneral.toFixed(2)}`,
            `Cobrado (${percentageLabel}): ${amountUSDT.toFixed(2)} USDT`,
            'Estado: EN PROCESO',
            '──────────────',
            'Utilice los botones para admitir o cancelar.'
          ].join('\n');
        }

        const adminKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Admitir', callback_data: `pago_admitir_${transaction.id}` }],
              [{ text: 'Rechazar', callback_data: `pago_cancel_${transaction.id}` }]
            ]
          }
        };

        // Send to admin groups and save message_id
        const botInstance = require('../bot').bot;
        let groupMessageId = null;
        let groupChatId = null;
        
        try {
          const results = await groupManager.sendToAdminGroups(botInstance, adminMessage, {
            reply_markup: adminKeyboard.reply_markup
          });
          
          if (results && results.length > 0) {
            const firstSuccess = results.find(r => r.success);
            if (firstSuccess && firstSuccess.messageId) {
              groupMessageId = firstSuccess.messageId;
              const adminGroups = config.admin_groups || [];
              if (adminGroups.length > 0) {
                groupChatId = await groupManager.getGroupChatId(botInstance, firstSuccess.inviteLink || adminGroups[0]);
              }
            }
          }
        } catch (error) {
          console.error('Error sending payment to admin groups:', error);
        }

        // Show waiting message with new format (DO NOT clean chat, only the confirmation message was deleted)
        const waitingMessage = `✅ *Orden enviada*\n\n` +
          `Su pago fue recibido correctamente.\n` +
          `Le notificaremos cuando finalice la gestión.\n\n` +
          `MONTO PAGADO: ${montoFormateado}\n` +
          `COBRADO: ${amountUSDT.toFixed(0)} USDT (${percentageLabel})`;

        const waitingMsg = await ctx.replyWithMarkdown(waitingMessage);
        chatManager.registerBotMessage(ctx.from.id, waitingMsg.message_id);
        
        // Save user message_id and chat_id to transaction for later editing
        // Format: user_message|chat_id|message_id|admin_group|chat_id|message_id
        const userMessageInfo = `user_message|${ctx.chat.id}|${waitingMsg.message_id}`;
        let finalProofImage = userMessageInfo;
        
        if (groupMessageId && groupChatId) {
          finalProofImage = `${userMessageInfo}|admin_group|${groupChatId}|${groupMessageId}`;
        }
        
        await pool.query(
          'UPDATE transactions SET proof_image = $1 WHERE id = $2',
          [finalProofImage, transaction.id]
        );

        stateManager.clearState(ctx.from.id);
        await ctx.answerCbQuery('✅ Orden confirmada');

        if (receiptDetails) {
          receiptDetails.amountFormatted = montoFormateado;
          const receiptMsg = await sendPaymentReceiptPDF(ctx, receiptDetails);
          if (receiptMsg) {
            chatManager.registerBotMessage(ctx.from.id, receiptMsg.message_id);
          }
        }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in handleMultaConfirm:', error);
      await ctx.answerCbQuery('❌ Error al procesar orden', true);
      stateManager.clearState(ctx.from.id);
    }
  },

  async handleMultaCancel(ctx) {
    // Delete the confirmation message first
    try {
      await ctx.deleteMessage();
    } catch (deleteError) {
      console.warn('Could not delete confirmation message:', deleteError.message);
    }

    stateManager.clearState(ctx.from.id);
    await ctx.answerCbQuery('❌ Operación cancelada');
    
    // Show cancellation message (DO NOT clean chat, only the confirmation message was deleted)
    const cancelMsg = `⚠️ *Orden cancelada.*\n\n` +
      `Puede ingresar un nuevo monto cuando lo considere necesario.`;
    
    const sentMessage = await ctx.replyWithMarkdown(cancelMsg);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarOtraMultaLogin(ctx, login) {
    const data = stateManager.getData(ctx.from.id);
    const loginOnly = login.split('\n')[0].trim();
    
    stateManager.setData(ctx.from.id, { ...data, login: loginOnly });
    stateManager.setState(ctx.from.id, 'pagar_otra_multa_waiting_servicio');
    
    const message = `[+] 💭 Ingrese el nombre del servicio o entidad:\n\n⬅️ *Regresar al menú principal*`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarCABAPatente(ctx, patente) {
    const patenteOnly = patente.split('\n')[0].trim().toUpperCase();
    
    if (patenteOnly.length !== 6) {
      await ctx.reply('❌ La patente debe tener exactamente 6 caracteres.');
      return;
    }
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, patente: patenteOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarOtraServicio(ctx, servicio) {
    const servicioOnly = servicio.split('\n')[0].trim();
    
    if (!servicioOnly || servicioOnly.length < 2) {
      await ctx.reply('⚠️ Ingrese un nombre de servicio válido (mínimo 2 caracteres).');
      return;
    }
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, nombre_servicio: servicioOnly });
    
    if (data.type === 'otra') {
      stateManager.setState(ctx.from.id, 'pagar_otra_waiting_codigo');
      const message = await messageService.getMessage('pagar_otra_codigo');
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
        }
      };
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    } else if (data.type === 'multas') {
      stateManager.setState(ctx.from.id, 'pagar_otra_multa_waiting_codigo');
      const message = await messageService.getMessage('pagar_multas_servicio');
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'action_back' }]
          ]
        }
      };
      const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
      chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
    }
  },

  async handlePagarRentasAutomotorPatente(ctx, patente) {
    const patenteOnly = patente.split('\n')[0].trim().toUpperCase();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, patente: patenteOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarRentasInmobiliarioCuenta(ctx, cuenta) {
    const cuentaOnly = cuenta.split('\n')[0].trim();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, cuenta: cuentaOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarRentasIngresosInscripcion(ctx, inscripcion) {
    const inscripcionOnly = inscripcion.split('\n')[0].trim();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, inscripcion: inscripcionOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarRentasSellosIdentificacion(ctx, identificacion) {
    const identificacionOnly = identificacion.split('\n')[0].trim();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, identificacion: identificacionOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarRentasCamineraDato(ctx, dato) {
    const datoOnly = dato.split('\n')[0].trim();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, dato: datoOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarOtraCodigo(ctx, codigo) {
    const codigoOnly = codigo.split('\n')[0].trim();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, codigo: codigoOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handlePagarOtraMultaCodigo(ctx, codigo) {
    const codigoOnly = codigo.split('\n')[0].trim();
    
    const data = stateManager.getData(ctx.from.id);
    stateManager.setData(ctx.from.id, { ...data, codigo: codigoOnly });
    stateManager.setState(ctx.from.id, 'pagar_waiting_monto');
    
    const message = await messageService.getMessage('pagar_rentas_monto');
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Regresar', callback_data: 'action_back' }]
        ]
      }
    };
    
    const sentMessage = await ctx.replyWithMarkdown(message, keyboard);
    chatManager.registerBotMessage(ctx.from.id, sentMessage.message_id);
  },

  async handleAdminNoticia(ctx, text) {
    try {
      const adminContext = await getAdminContext(ctx.from.id, ctx.from.username);

      if (!adminContext || adminContext.active === false) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ No tienes permisos para enviar noticias.');
        return;
      }

      if (adminContext.role !== 'superadmin') {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ Solo los superadministradores pueden enviar noticias masivas.');
        return;
      }

      // Obtener todos los usuarios
      const usersResult = await pool.query(
        'SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND notify_instant = true'
      );

      if (usersResult.rows.length === 0) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ No hay usuarios registrados en el bot.');
        return;
      }

      const totalUsers = usersResult.rows.length;
      let sentCount = 0;
      let failedCount = 0;

      // Enviar mensaje a todos los usuarios
      await ctx.reply(`📢 Enviando noticia a ${totalUsers} usuarios...`);

      for (const user of usersResult.rows) {
        try {
          await ctx.telegram.sendMessage(
            user.telegram_id,
            text,
            { parse_mode: 'Markdown' }
          );
          sentCount++;
          
          // Pequeña pausa para evitar rate limits
          if (sentCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          failedCount++;
          console.error(`Error sending to user ${user.telegram_id}:`, error.message);
        }
      }

      // Limpiar estado
      stateManager.clearState(ctx.from.id);

      // Notificar resultado al admin
      await ctx.reply(
        `✅ *Noticia enviada*\n\n` +
        `📊 Total usuarios: ${totalUsers}\n` +
        `✅ Enviados: ${sentCount}\n` +
        `❌ Fallidos: ${failedCount}`,
        { parse_mode: 'Markdown' }
      );

      // Log audit
      const auditLogger = require('../../services/auditLogger');
      await auditLogger.log(
        adminContext.username || ctx.from.username || `user_${ctx.from.id}`,
        'send_noticia',
        { totalUsers, sentCount, failedCount }
      );
    } catch (error) {
      console.error('Error in handleAdminNoticia:', error);
      stateManager.clearState(ctx.from.id);
      await ctx.reply('❌ Error al enviar noticia.');
    }
  },

  async handleAdminNoticiaPhoto(ctx) {
    try {
      const adminContext = await getAdminContext(ctx.from.id, ctx.from.username);

      if (!adminContext || adminContext.active === false) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ No tienes permisos para enviar noticias.');
        return;
      }

      if (adminContext.role !== 'superadmin') {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ Solo los superadministradores pueden enviar noticias masivas.');
        return;
      }

      // Obtener todos los usuarios
      const usersResult = await pool.query(
        'SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND notify_instant = true'
      );

      if (usersResult.rows.length === 0) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ No hay usuarios registrados en el bot.');
        return;
      }

      const totalUsers = usersResult.rows.length;
      let sentCount = 0;
      let failedCount = 0;

      // Obtener la foto más grande
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileId = photo.file_id;
      const caption = ctx.message.caption || '';

      // Enviar mensaje a todos los usuarios
      await ctx.reply(`📢 Enviando noticia con imagen a ${totalUsers} usuarios...`);

      for (const user of usersResult.rows) {
        try {
          await ctx.telegram.sendPhoto(
            user.telegram_id,
            fileId,
            {
              caption: caption,
              parse_mode: caption ? 'Markdown' : undefined
            }
          );
          sentCount++;
          
          // Pequeña pausa para evitar rate limits
          if (sentCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          failedCount++;
          console.error(`Error sending photo to user ${user.telegram_id}:`, error.message);
        }
      }

      // Limpiar estado
      stateManager.clearState(ctx.from.id);

      // Notificar resultado al admin
      await ctx.reply(
        `✅ *Noticia con imagen enviada*\n\n` +
        `📊 Total usuarios: ${totalUsers}\n` +
        `✅ Enviados: ${sentCount}\n` +
        `❌ Fallidos: ${failedCount}`,
        { parse_mode: 'Markdown' }
      );

      // Log audit
      const auditLogger = require('../../services/auditLogger');
      await auditLogger.log(
        adminContext.username || ctx.from.username || `user_${ctx.from.id}`,
        'send_noticia_photo',
        { totalUsers, sentCount, failedCount, type: 'photo' }
      );
    } catch (error) {
      console.error('Error in handleAdminNoticiaPhoto:', error);
      stateManager.clearState(ctx.from.id);
      await ctx.reply('❌ Error al enviar noticia con imagen.');
    }
  },

  async handleAdminSecurityQuestion(ctx, answer) {
    try {
      const pendingData = stateManager.getData(ctx.from.id) || {};
      if (!pendingData.adminSecurityPending) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ Acceso denegado.');
        return;
      }

      const normalizedAnswer = (answer || '').trim().toUpperCase();
      if (normalizedAnswer !== 'LOS GAYS') {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ Respuesta incorrecta. Acceso denegado.');
        return;
      }

      await adminHandlers.completeAdminSecurityVerification(ctx);
    } catch (error) {
      console.error('Error in handleAdminSecurityQuestion:', error);
      stateManager.clearState(ctx.from.id);
      try {
        await ctx.reply('❌ Error al completar la autenticación. Intenta nuevamente.');
      } catch (replyError) {
        console.error('Error sending security question error message:', replyError);
      }
    }
  },

  async handlePreguntaIA(ctx, question) {
    try {
      const trimmed = (question || '').trim();
      if (!trimmed) {
        await ctx.reply('⚠️ Escribe una pregunta para que pueda ayudarte.');
        return;
      }

      if (trimmed.toUpperCase() === 'MENU') {
        stateManager.clearState(ctx.from.id);
        await commands.start(ctx);
        return;
      }

      const answer = qaService.getAnswer(trimmed);

      const response = [
        '🤖 *Respuesta inteligente*',
        '',
        answer,
        '',
        '_Puedes enviar otra pregunta o escribir MENU para volver._'
      ].join('\n');

      await ctx.replyWithMarkdown(response);
      // Mantener el estado para permitir más preguntas
    } catch (error) {
      console.error('Error in handlePreguntaIA:', error);
      await ctx.reply('❌ No pude procesar la pregunta. Intenta nuevamente en unos segundos.');
    }
  }
};

module.exports = handlers;
