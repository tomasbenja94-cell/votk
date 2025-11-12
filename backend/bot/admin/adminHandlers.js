const pool = require('../../db/connection');
const { isAdmin, getOrCreateUser, formatCurrency, formatARS, formatPercentage, getAdminContext } = require('../../utils/helpers');
const priceService = require('../../services/priceService');
const stateManager = require('../handlers/stateManager');
const auditLogger = require('../../services/auditLogger');
const messageService = require('../../services/messageService');
const notificationService = require('../services/notificationService');
const chatManager = require('../utils/chatManager');
const animationManager = require('../utils/animations');
const commandHandlers = require('../commands');
const config = require('../../config/default.json');
const dailySummaryService = require('../../services/dailySummaryService');
const webhookService = require('../../services/webhookService');
const { generatePaymentReceiptPDF } = require('../utils/pdfReceipt');
const { generateReceiptImage } = require('../utils/receiptImage');

const ADMIN_PERMISSIONS = {
  superadmin: {
    access: true,
    processPayments: true,
    manageWallets: true,
    manageUsers: true,
    manageConfig: true,
    manageBalance: true,
    broadcast: true
  }
};

const DEFAULT_FEE_PERCENTAGE = 20;

function isCallback(ctx) {
  return ctx.updateType === 'callback_query';
}

async function notifyPermissionDenied(ctx, message) {
  const text = message || '❌ Permisos insuficientes para realizar esta acción.';
  if (isCallback(ctx)) {
    try {
      await ctx.answerCbQuery(text, { show_alert: true });
    } catch (err) {
      console.warn('Error sending callback permission denial:', err.message);
    }
  } else {
    await ctx.reply(text);
  }
}

function parsePercentageInput(input) {
  if (input === undefined || input === null) return null;
  const normalized = String(input).replace('%', '').replace(',', '.').trim();
  if (normalized.length === 0) return null;
  const value = parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return null;
  }
  return value;
}

function parseAmountInput(input) {
  if (input === undefined || input === null) return null;
  const normalized = String(input).trim().replace(/\s+/g, ' ').replace(/\./g, '').replace(',', '.');
  if (normalized.length === 0) return null;
  const value = parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

async function findUserByIdentifier(identifier) {
  if (!identifier) {
    return null;
  }

  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  const selectFields = 'id, telegram_id, username, fee_percentage, fee_min_amount_ars, saldo_usdt';

  if (trimmed.startsWith('@')) {
    const username = trimmed.replace('@', '').toLowerCase();
    const result = await pool.query(
      `SELECT ${selectFields}
         FROM users
        WHERE LOWER(REPLACE(COALESCE(username, ''), '@', '')) = $1
        LIMIT 1`,
      [username]
    );
    if (result.rows.length > 0) {
      return result.rows[0];
    }
  }

  if (/^\d+$/.test(trimmed)) {
    // Try by telegram_id first
    const resultByTelegram = await pool.query(
      `SELECT ${selectFields}
         FROM users
        WHERE telegram_id = $1
        LIMIT 1`,
      [trimmed]
    );
    if (resultByTelegram.rows.length > 0) {
      return resultByTelegram.rows[0];
    }

    // Then by internal user id
    const resultById = await pool.query(
      `SELECT ${selectFields}
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [parseInt(trimmed, 10)]
    );
    if (resultById.rows.length > 0) {
      return resultById.rows[0];
    }
  }

  return null;
}

async function applyUserFeeSettings(ctx, adminContext, userRow, percentage, minAmount) {
  const parsedPercentage = parseFloat(percentage);
  const percentageValue = Math.max(0, Math.min(100, Number.isFinite(parsedPercentage) ? parsedPercentage : 0));
  const parsedMinAmount = parseFloat(minAmount);
  const minValue = Math.max(0, Number.isFinite(parsedMinAmount) ? parsedMinAmount : 0);

  const roundedPercentage = Number(percentageValue.toFixed(2));
  const roundedMinAmount = Number(minValue.toFixed(2));

  const updateResult = await pool.query(
    `UPDATE users
        SET fee_percentage = $1,
            fee_min_amount_ars = $2
      WHERE id = $3
      RETURNING id, telegram_id, username, fee_percentage, fee_min_amount_ars`,
    [roundedPercentage, roundedMinAmount, userRow.id]
  );

  if (!updateResult.rows.length) {
    throw new Error('No fue posible actualizar el usuario.');
  }

  const updatedUser = updateResult.rows[0];
  const percentLabel = formatPercentage(updatedUser.fee_percentage ?? DEFAULT_FEE_PERCENTAGE);
  const minLabel = formatARS(updatedUser.fee_min_amount_ars ?? 0);
  const displayName = updatedUser.username
    ? updatedUser.username
    : (updatedUser.telegram_id ? `ID ${updatedUser.telegram_id}` : `Usuario #${updatedUser.id}`);

  const adminReply = [
    '✅ Ajuste registrado',
    '',
    `👤 Usuario: ${displayName}`,
    `📊 Porcentaje aplicado: ${percentLabel}`,
    `💵 Monto mínimo: ${minLabel}`
  ].join('\n');

  await ctx.reply(adminReply);

  try {
    const actor = adminContext?.username || (ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id));
    await auditLogger.log(actor, 'user_fee_updated', JSON.stringify({
      userId: updatedUser.id,
      telegramId: updatedUser.telegram_id,
      feePercentage: roundedPercentage,
      feeMinAmountArs: roundedMinAmount
    }));
  } catch (logError) {
    console.warn('No se pudo registrar el ajuste de porcentaje en el log:', logError.message);
  }

  if (updatedUser.telegram_id) {
    const userNotification = [
      '⚙️ Ajuste de comisión',
      '',
      `Se actualizó el porcentaje de servicio a ${percentLabel}.`,
      'Cada operación descontará ese porcentaje sobre el monto final en USDT.',
      roundedMinAmount > 0
        ? `El porcentaje aplica para operaciones desde ${minLabel}.`
        : 'El porcentaje aplica para todas tus operaciones.',
      '',
      'Ante cualquier consulta, contactá al equipo de soporte.'
    ].join('\n');

    try {
      await ctx.telegram.sendMessage(updatedUser.telegram_id, userNotification);
    } catch (notifyError) {
      console.warn('No se pudo notificar al usuario sobre el ajuste de porcentaje:', notifyError.message);
    }
  }
}

async function ensureAdminPermission(ctx, permissionKey = 'access') {
  try {
    const admin = await getAdminContext(ctx.from?.id, ctx.from?.username);
    if (!admin) {
      await notifyPermissionDenied(ctx, '❌ Solo administradores autorizados.');
      return null;
    }

    if (admin.active === false) {
      await notifyPermissionDenied(ctx, '❌ Tu cuenta de administrador está inactiva. Contacta a un superadministrador.');
      return null;
    }

    const role = admin.role || 'superadmin';
    const permissions = ADMIN_PERMISSIONS[role] || ADMIN_PERMISSIONS.superadmin;

    if (permissionKey && !permissions[permissionKey]) {
      await notifyPermissionDenied(ctx);
      return null;
    }

    return { admin, permissions };
  } catch (error) {
    console.error('Error ensuring admin permission:', error);
    await notifyPermissionDenied(ctx);
    return null;
  }
}

async function updateTransactionStatus(executor, { id, status, motivo = null, adminId = null }) {
  const query = `
    UPDATE transactions
    SET status = $1,
        motivo = COALESCE($2, motivo),
        admin_id = COALESCE($3, admin_id),
        updated_at = NOW(),
        alerted_at = CASE
          WHEN $1 IN ('pendiente','procesando') THEN alerted_at
          ELSE NULL
        END,
        review_started_at = CASE
          WHEN $1 IN ('procesando', 'admitido', 'pagado') THEN COALESCE(review_started_at, NOW())
          WHEN $1 = 'pendiente' THEN NULL
          ELSE review_started_at
        END,
        admitted_at = CASE
          WHEN $1 IN ('admitido', 'pagado') THEN COALESCE(admitted_at, NOW())
          WHEN $1 IN ('pendiente', 'procesando') THEN NULL
          ELSE admitted_at
        END,
        paid_at = CASE
          WHEN $1 = 'pagado' THEN COALESCE(paid_at, NOW())
          WHEN $1 IN ('pendiente', 'procesando', 'admitido') THEN NULL
          ELSE paid_at
        END,
        cancelled_at = CASE
          WHEN $1 = 'cancelado' THEN COALESCE(cancelled_at, NOW())
          WHEN $1 IN ('pendiente', 'procesando', 'admitido', 'pagado') THEN NULL
          ELSE cancelled_at
        END
    WHERE id = $4
    RETURNING *
  `;

  return executor.query(query, [status, motivo, adminId, id]);
}

const handlers = {
  async authenticate(ctx) {
    try {
      const messageText = ctx.message.text || '';
      const parts = messageText.split(' ').filter(p => p.length > 0);
      
      // Check if already admin
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in authenticate:', error);
        // Continue anyway
      }
      
      if (isUserAdmin) {
        await handlers.showAdminMenu(ctx);
        return;
      }

      if (parts.length < 2) {
        await ctx.reply('❌ Error.');
        return;
      }

      const password = parts[1];
      
      if (password !== config.admin_password_bot) {
        await ctx.reply('❌ Contraseña incorrecta.');
        return;
      }

      // Password correct - require security question
      stateManager.setState(ctx.from.id, 'admin_security_question');
      stateManager.setData(ctx.from.id, { adminSecurityPending: true });
      await ctx.reply('🔒 Verificación adicional requerida.\n\n¿Qué es lo que más le gusta a Anubis?');
    } catch (error) {
      console.error('Error in authenticate:', error);
      console.error('Error stack:', error.stack);
      try {
        await ctx.reply('❌ Error en autenticación. Por favor intenta nuevamente.');
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  },

  async finalizeAdminAccess(ctx) {
    const username = ctx.from.username ? `@${ctx.from.username}` : null;
    const normalizedUsername = username ? username.replace('@', '').toLowerCase() : null;
    
    try {
      // Check if admin exists by username (case insensitive)
      let existingAdmin = null;
      if (normalizedUsername) {
        const result = await pool.query(
          `SELECT * FROM admins WHERE LOWER(REPLACE(COALESCE(username, ''), '@', '')) = $1`,
          [normalizedUsername]
        );
        if (result.rows.length > 0) {
          existingAdmin = result.rows[0];
        }
      }
      
      if (existingAdmin) {
        // Update telegram_id if missing or different
        await pool.query(
          'UPDATE admins SET telegram_id = $1, active = true WHERE id = $2',
          [ctx.from.id.toString(), existingAdmin.id]
        );
        await ctx.reply(`🔐 Autenticación verificada. Registro administrativo actualizado.\n\nID de Telegram: ${ctx.from.id}\nUsuario: ${existingAdmin.username}`);
      } else {
        // Check by telegram_id
        const existingByTelegramId = await pool.query(
          'SELECT * FROM admins WHERE telegram_id = $1',
          [ctx.from.id.toString()]
        );
        
        if (existingByTelegramId.rows.length > 0) {
          // Update username if different
          await pool.query(
            'UPDATE admins SET username = $1, active = true WHERE telegram_id = $2',
            [username || `user_${ctx.from.id}`, ctx.from.id.toString()]
          );
          await ctx.reply(`🔐 Autenticación verificada. Su usuario ya posee permisos administrativos.\n\nID de Telegram: ${ctx.from.id}\nUsuario: ${username || 'Sin username'}`);
        } else {
          // Create new admin (if username matches one in config or password is correct)
          const configAdmins = config.admins || [];
          const usernameMatches = normalizedUsername && configAdmins.some(admin => 
            admin.toLowerCase().replace('@', '') === normalizedUsername
          );
          
          if (usernameMatches || !normalizedUsername) {
            // Add as new admin
            await pool.query(
              'INSERT INTO admins (username, telegram_id, role, active) VALUES ($1, $2, $3, true)',
              [
                username || `user_${ctx.from.id}`,
                ctx.from.id.toString(),
                usernameMatches ? 'superadmin' : 'operador'
              ]
            );
            await ctx.reply(`🔐 Autenticación verificada. Se otorgó acceso administrativo.\n\nID de Telegram: ${ctx.from.id}\nUsuario: ${username || 'Sin username'}`);
          } else {
            await ctx.reply('✅ Contraseña correcta, pero tu username no está en la lista de admins. Contacta al administrador principal.');
            return;
          }
        }
      }
      
      // Show admin menu with context
      const adminContext = await getAdminContext(ctx.from.id, ctx.from.username);
      if (adminContext) {
        await handlers.showAdminMenu(ctx, adminContext);
      } else {
        await ctx.reply('❌ No fue posible determinar tu rol de administrador. Contacta al superadministrador.');
      }
    } catch (error) {
      console.error('Error adding/updating admin:', error);
      console.error('Error stack:', error.stack);
      // Even if there's an error, try to show menu if user is already admin
      try {
        const isAlreadyAdmin = await isAdmin(ctx.from.id, ctx.from.username);
        if (isAlreadyAdmin) {
          await handlers.showAdminMenu(ctx);
        } else {
          await ctx.reply('❌ Error al actualizar el registro. Por favor intenta nuevamente o contacta al administrador.');
        }
      } catch (checkError) {
        console.error('Error checking admin after error:', checkError);
        await ctx.reply('❌ Error. Por favor intenta nuevamente.');
      }
    }
  },

  async completeAdminSecurityVerification(ctx) {
    try {
      stateManager.clearState(ctx.from.id);
      await handlers.finalizeAdminAccess(ctx);
    } catch (error) {
      console.error('Error completing admin security verification:', error);
      try {
        await ctx.reply('❌ Error al completar la autenticación. Intenta nuevamente.');
      } catch (replyError) {
        console.error('Error sending completion message:', replyError);
      }
    }
  },

  async showAdminMenu(ctx, adminContext = null) {
    try {
      const context = adminContext || await ensureAdminPermission(ctx, 'access');
      if (!context) {
        return;
      }

      const { admin, permissions } = context;
      const inlineKeyboard = [];

      if (permissions.manageUsers) {
        inlineKeyboard.push([{ text: 'Usuarios', callback_data: 'admin_users' }]);
      }

      if (permissions.manageWallets) {
        inlineKeyboard.push([{ text: 'Wallets', callback_data: 'admin_wallets' }]);
      }

      inlineKeyboard.push([{ text: 'Estadísticas', callback_data: 'admin_stats' }]);
      inlineKeyboard.push([{ text: 'Logs', callback_data: 'admin_logs' }]);

      const keyboard = {
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      };

      const message = `🔐 *Panel de Administración*\n\n` +
        `Rol asignado: *${(admin.role || 'superadmin').toUpperCase()}*\n\n` +
        `Selecciona una opción:`;

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in showAdminMenu:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response,
        description: error.description
      });
      console.error('Error stack:', error.stack);
      // Try to send a simple message without Markdown
      try {
        const simpleKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Usuarios', callback_data: 'admin_users' }],
              [{ text: 'Wallets', callback_data: 'admin_wallets' }],
              [{ text: 'Estadísticas', callback_data: 'admin_stats' }],
              [{ text: 'Logs', callback_data: 'admin_logs' }]
            ]
          }
        };
        await ctx.reply('🔐 Panel de Administracion\n\nSelecciona una opcion:', simpleKeyboard);
      } catch (fallbackError) {
        console.error('Error sending fallback message:', fallbackError);
        // Try one more time with minimal message
        try {
          await ctx.reply('Error al mostrar el menu. Por favor intenta usar /admin nuevamente.');
        } catch (finalError) {
          console.error('Final error:', finalError);
        }
      }
    }
  },

  async cargar(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageBalance');
      if (!adminContext) {
        return;
      }

      const messageText = ctx.message.text;
      const parts = messageText.split(' ');

      if (parts.length < 3) {
        await ctx.reply('❌ Uso: /cargar @usuario monto');
        return;
      }

      const username = parts[1].replace('@', '');
      const amount = parseFloat(parts[2]);

      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Monto inválido.');
        return;
      }

      // Find user by username
      const userResult = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      if (userResult.rows.length === 0) {
        await ctx.reply('❌ Usuario no encontrado.');
        return;
      }

      const user = userResult.rows[0];

      // Update balance
      await pool.query(
        'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
        [amount, user.id]
      );

      // Update transaction status
      await pool.query(
        `UPDATE transactions 
         SET status = 'pagado', admin_id = $1, updated_at = NOW()
         WHERE user_id = $2 AND type = 'carga' AND status = 'pendiente'
         ORDER BY created_at DESC LIMIT 1`,
        [ctx.from.id, user.id]
      );

      // Log audit
      await auditLogger.log(
        adminContext.admin.username || `@${ctx.from.username || 'admin'}`,
        'cargar_saldo',
        { username, amount }
      );

      const newBalance = (parseFloat(user.saldo_usdt) + amount).toFixed(2);

      // Notify all admins
      const bot = require('../bot').bot;
      await notificationService.notifyAdmins(bot, 'carga_confirmada', {
        admin: ctx.from.username || 'admin',
        username: username,
        amount: amount
      });

      await ctx.reply(
        `✅ *Saldo acreditado*\n\n` +
        `Usuario: @${username}\n` +
        `Monto: ${amount} USDT\n` +
        `Nuevo saldo: ${newBalance} USDT`
      );

      // Notify user
      await notificationService.notifyUser(bot, user.telegram_id, 'carga_confirmada', {
        amount: amount
      });
    } catch (error) {
      console.error('Error in admin cargar:', error);
      await ctx.reply('❌ Error al acreditar saldo.');
    }
  },

  async cancelar(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'processPayments');
      if (!adminContext) {
        return;
      }
      
      // For now, cancel last pending transaction
      // In production, you might want to select which transaction to cancel
      const transactionResult = await pool.query(
        `SELECT t.*, u.telegram_id, u.username 
         FROM transactions t 
         JOIN users u ON t.user_id = u.id 
         WHERE t.status IN ('pendiente', 'procesando')
         ORDER BY t.created_at DESC 
         LIMIT 1`
      );

      if (transactionResult.rows.length === 0) {
        await ctx.reply('❌ No hay transacciones pendientes para cancelar.');
        return;
      }

      stateManager.setState(ctx.from.id, 'cancelar_waiting_motivo', {
        transactionId: transactionResult.rows[0].id
      });
      
      await ctx.reply('📝 *Motivo de cancelación:*\n\nIngrese el motivo:', {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Error in cancelar:', error);
      await ctx.reply('❌ Error al iniciar cancelación.');
    }
  },

  async setGroupChatId(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageConfig');
      if (!adminContext) {
        return;
      }
      
      // Get chat_id from the message (if sent in a group)
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;

      if (chatType !== 'group' && chatType !== 'supergroup') {
        await ctx.reply('❌ Este comando debe usarse en un grupo.');
        return;
      }

      // Get the invite link from the message or config
      const messageText = ctx.message.text;
      const parts = messageText.split(' ');

      if (parts.length < 2) {
        await ctx.reply('❌ Uso: /setgroupchatid <link_de_invitacion>\n\nEjemplo: /setgroupchatid https://t.me/+rjez71wbaYk4Yzdh');
        return;
      }

      const inviteLink = parts[1];
      await groupManager.saveGroupChatId(inviteLink, chatId);

      await ctx.reply(
        `✅ Chat ID configurado correctamente\n\n` +
        `Grupo: ${ctx.chat.title || 'Sin título'}\n` +
        `Chat ID: ${chatId}\n` +
        `Link: ${inviteLink}`
      );
    } catch (error) {
      console.error('Error setting group chat_id:', error);
      await ctx.reply('❌ Error al configurar chat ID.');
    }
  },

  async handleCancelarMotivo(ctx, motivo) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'processPayments');
      if (!adminContext) {
        return;
      }
      
      const data = stateManager.getData(ctx.from.id);
      const transactionId = data.transactionId;

      if (!transactionId) {
        await ctx.reply('❌ No se encontró transacción para cancelar.');
        stateManager.clearState(ctx.from.id);
        return;
      }

      const transactionResult = await pool.query(
        'SELECT * FROM transactions WHERE id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.reply('❌ Transacción no encontrada.');
        stateManager.clearState(ctx.from.id);
        return;
      }

      const transaction = transactionResult.rows[0];
      const originalStatus = transaction.status;

      // Refund balance if it was a payment
      if (transaction.type === 'pago') {
        await pool.query(
          'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
          [transaction.amount_usdt, transaction.user_id]
        );
      }

      // Update transaction
      await updateTransactionStatus(pool, {
        id: transactionId,
        status: 'cancelado',
        motivo
      });

      await auditLogger.log(
        `@${ctx.from.username}`,
        'cancelar_transaccion',
        { transactionId, motivo }
      );

      // Notify user
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [transaction.user_id]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        try {
          await ctx.telegram.sendMessage(
            user.telegram_id,
            `❌ *Pago cancelado*\n\n` +
            `Motivo: ${motivo}\n\n` +
            `💸 El monto ha sido reembolsado a tu saldo virtual.`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error('Error notifying user:', error);
        }
      }

      stateManager.clearState(ctx.from.id);
      await ctx.reply(`✅ Transacción cancelada. Motivo: ${motivo}`);
    } catch (error) {
      console.error('Error in handleCancelarMotivo:', error);
      await ctx.reply('❌ Error al cancelar transacción.');
      stateManager.clearState(ctx.from.id);
    }
  },

  async wallet(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'access');
      if (!adminContext) {
        return;
      }

      const walletsResult = await pool.query(
        'SELECT * FROM wallets ORDER BY id'
      );

      let message = '💳 *Wallets disponibles:*\n\n';
      
      walletsResult.rows.forEach(wallet => {
        message += `*${wallet.label}* (${wallet.network.toUpperCase()})\n`;
        message += `${wallet.active ? '✅' : '❌'} \`${wallet.address}\`\n\n`;
      });

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error in wallet:', error);
      await ctx.reply('❌ Error al obtener wallets.');
    }
  },

  async eliminarSaldo(ctx) {
    try {
      // Solo permitir en grupos de admin
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        await ctx.reply('❌ Este comando solo puede usarse en grupos de administración.');
        return;
      }

      const adminContext = await ensureAdminPermission(ctx, 'manageBalance');
      if (!adminContext) {
        return;
      }

      // Verificar que está en un grupo de admin configurado (admin_groups o transfer_groups)
      const adminGroups = config.admin_groups || [];
      const transferGroups = config.transfer_groups || [];
      const allAllowedGroups = [...adminGroups, ...transferGroups];
      
      const groupManager = require('../utils/groupManager');
      const bot = require('../bot').bot;
      let found = false;
      
      // Verificar por chat_id en todos los grupos permitidos
      for (const inviteLink of allAllowedGroups) {
        try {
          const groupChatId = await groupManager.getGroupChatId(bot, inviteLink);
          if (groupChatId && groupChatId.toString() === ctx.chat.id.toString()) {
            found = true;
            break;
          }
        } catch (e) {
          // Ignorar errores
        }
      }
      
      if (!found) {
        await ctx.reply('❌ Este comando solo puede usarse en grupos de administración configurados.');
        return;
      }

      // Parsear comando: /eliminarsaldo ID monto
      const messageText = ctx.message.text || '';
      const parts = messageText.split(' ').filter(p => p.length > 0);
      
      if (parts.length < 3) {
        await ctx.reply('❌ Uso: `/eliminarsaldo <telegram_id> <monto>`\n\n' +
          'Ejemplo: `/eliminarsaldo 123456789 50.5`', { parse_mode: 'Markdown' });
        return;
      }

      const telegramId = parts[1];
      const monto = parseFloat(parts[2]);

      if (isNaN(telegramId) || isNaN(monto) || monto <= 0) {
        await ctx.reply('❌ ID o monto inválido. El monto debe ser un número mayor a 0.');
        return;
      }

      // Obtener usuario
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId]
      );

      if (userResult.rows.length === 0) {
        await ctx.reply(`❌ Usuario con ID ${telegramId} no encontrado.`);
        return;
      }

      const user = userResult.rows[0];
      const saldoActual = parseFloat(user.saldo_usdt) || 0;

      // Usar transacción para asegurar atomicidad
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock user row
        const userLocked = await client.query(
          'SELECT saldo_usdt FROM users WHERE id = $1 FOR UPDATE',
          [user.id]
        );

        const saldoActualizado = parseFloat(userLocked.rows[0].saldo_usdt) || 0;
        const nuevoSaldo = Math.max(0, saldoActualizado - monto); // No permitir saldo negativo

        // Actualizar saldo
        await client.query(
          'UPDATE users SET saldo_usdt = $1 WHERE id = $2',
          [nuevoSaldo, user.id]
        );

        // Obtener admin ID antes de crear la transacción
        const adminResult = await pool.query(
          'SELECT id FROM admins WHERE telegram_id = $1 OR username = $2 LIMIT 1',
          [ctx.from.id, ctx.from.username ? `@${ctx.from.username}` : null]
        );
        const adminId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;

        // Crear transacción de registro
        const reembolsoResult = await client.query(
          `INSERT INTO transactions (user_id, type, amount_usdt, status, motivo, admin_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            user.id,
            'reembolso',
            monto,
            'pagado',
            `Saldo eliminado por admin @${ctx.from.username || 'admin'}`,
            adminId
          ]
        );

        await client.query('COMMIT');

        const reembolsoTransaction = reembolsoResult.rows ? reembolsoResult.rows[0] : null;

        if (reembolsoTransaction) {
          await webhookService.emit('transactions.created', {
            transactionId: reembolsoTransaction.id,
            type: reembolsoTransaction.type,
            status: reembolsoTransaction.status,
            amountUsdt: Number(reembolsoTransaction.amount_usdt || 0),
            user: {
              id: user.id,
              telegramId: user.telegram_id,
              username: user.username
            },
            channel: 'reembolso',
            metadata: {
              motivo: `Saldo eliminado por admin @${ctx.from.username || 'admin'}`
            },
            createdAt: reembolsoTransaction.created_at
          });
        }

        // Log de auditoría
        await auditLogger.log(
          `@${ctx.from.username || 'admin'}`,
          'eliminar_saldo',
          { 
            username: user.username, 
            telegramId: user.telegram_id,
            amount: monto,
            saldoAnterior: saldoActualizado,
            saldoNuevo: nuevoSaldo
          }
        );

        // Notificar en el grupo
        const mensaje = `✅ *Saldo eliminado*\n\n` +
          `Usuario: @${user.username || 'sin_username'} (ID: ${user.telegram_id})\n` +
          `Monto eliminado: ${monto.toFixed(2)} USDT\n` +
          `Saldo anterior: ${saldoActualizado.toFixed(2)} USDT\n` +
          `Saldo nuevo: ${nuevoSaldo.toFixed(2)} USDT\n` +
          `Por: @${ctx.from.username || 'admin'}`;

        await ctx.replyWithMarkdown(mensaje);

        // Notificar al usuario
        try {
          const bot = require('../bot').bot;
          await bot.telegram.sendMessage(
            user.telegram_id,
            `⚠️ *Ajuste sobre su saldo*\n\n` +
            `Se debitó ${monto.toFixed(2)} USDT de su cuenta.\n` +
            `Saldo disponible: ${nuevoSaldo.toFixed(2)} USDT\n\n` +
            `Motivo: Ajuste administrativo.`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.error('Error notifying user:', notifyError);
        }

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in eliminarSaldo:', error);
      await ctx.reply('❌ Error al eliminar saldo: ' + error.message);
    }
  },

  async logs(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'access');
      if (!adminContext) {
        return;
      }

      const logs = await auditLogger.getLogs(10);
      
      let message = '📝 *Últimos logs:*\n\n';
      
      logs.forEach(log => {
        const date = new Date(log.created_at).toLocaleString('es-AR');
        message += `*${log.action}*\n`;
        message += `Actor: ${log.actor}\n`;
        message += `Fecha: ${date}\n`;
        if (log.details) {
          message += `Detalles: ${log.details}\n`;
        }
        message += `\n`;
      });

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error in logs:', error);
      await ctx.reply('❌ Error al obtener logs.');
    }
  },

  async handleAdminUsers(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageUsers');
      if (!adminContext) {
        return;
      }
      
      await ctx.answerCbQuery('👥 Obteniendo usuarios...');
      
      const usersResult = await pool.query(
        'SELECT id, telegram_id, username, saldo_usdt, created_at FROM users ORDER BY created_at DESC LIMIT 20'
      );
      
      let message = '👥 *Usuarios registrados:*\n\n';
      
      if (usersResult.rows.length === 0) {
        message += 'No hay usuarios registrados.';
      } else {
        usersResult.rows.forEach(user => {
          message += `*${user.username || 'Sin username'}*\n`;
          message += `ID: ${user.telegram_id}\n`;
          message += `Saldo: ${parseFloat(user.saldo_usdt || 0).toFixed(2)} USDT\n`;
          message += `Registrado: ${new Date(user.created_at).toLocaleDateString('es-AR')}\n\n`;
        });
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'admin_back' }]
          ]
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in handleAdminUsers:', error);
      await ctx.answerCbQuery('❌ Error al obtener usuarios', true);
    }
  },

  async handleAdminWallets(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageWallets');
      if (!adminContext) {
        return;
      }

      await ctx.answerCbQuery('💳 Obteniendo wallets...');
      
      const walletsResult = await pool.query('SELECT * FROM wallets ORDER BY id');
      
      let message = '💳 *Wallets disponibles:*\n\n';
      
      if (walletsResult.rows.length === 0) {
        message += 'No hay wallets configuradas.';
      } else {
        walletsResult.rows.forEach(wallet => {
          message += `*${wallet.label}*\n`;
          message += `Red: ${wallet.network.toUpperCase()}\n`;
          message += `Dirección: \`${wallet.address}\`\n\n`;
        });
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'admin_back' }]
          ]
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in handleAdminWallets:', error);
      await ctx.answerCbQuery('❌ Error al obtener wallets', true);
    }
  },

  async handleAdminStats(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'access');
      if (!adminContext) {
        return;
      }

      await ctx.answerCbQuery('📊 Obteniendo estadísticas...');
      
      // Get stats
      const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
      const transactionsCount = await pool.query('SELECT COUNT(*) as count FROM transactions');
      const pendingTransactions = await pool.query("SELECT COUNT(*) as count FROM transactions WHERE status = 'pendiente'");
      const totalBalance = await pool.query('SELECT SUM(saldo_usdt) as total FROM users');
      
      const message = `📊 *Estadísticas del Sistema*\n\n` +
        `👥 Usuarios totales: ${usersCount.rows[0].count}\n` +
        `📝 Transacciones totales: ${transactionsCount.rows[0].count}\n` +
        `⏳ Pendientes: ${pendingTransactions.rows[0].count}\n` +
        `💰 Saldo total en el sistema: ${parseFloat(totalBalance.rows[0].total || 0).toFixed(2)} USDT`;

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'admin_back' }]
          ]
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in handleAdminStats:', error);
      await ctx.answerCbQuery('❌ Error al obtener estadísticas', true);
    }
  },

  async handleAdminLogs(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'access');
      if (!adminContext) {
        return;
      }

      await ctx.answerCbQuery('📝 Obteniendo logs...');
      
      const logs = await auditLogger.getLogs(10);
      
      let message = '📝 *Últimos logs:*\n\n';
      
      if (logs.length === 0) {
        message += 'No hay logs disponibles.';
      } else {
        logs.forEach(log => {
          const date = new Date(log.created_at).toLocaleString('es-AR');
          message += `*${log.action}*\n`;
          message += `Actor: ${log.actor}\n`;
          message += `Fecha: ${date}\n`;
          if (log.details) {
            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
            message += `Detalles: ${JSON.stringify(details)}\n`;
          }
          message += '\n';
        });
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Regresar', callback_data: 'admin_back' }]
          ]
        }
      };

      await ctx.replyWithMarkdown(message, keyboard);
    } catch (error) {
      console.error('Error in handleAdminLogs:', error);
      await ctx.answerCbQuery('❌ Error al obtener logs', true);
    }
  },

  async config(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageConfig');
      if (!adminContext) {
        return;
      }

      const configResult = await pool.query(
        "SELECT key, value FROM config WHERE key IN ('bot_username', 'price_source', 'admin_groups')"
      );

      let message = '⚙️ *Configuración actual:*\n\n';
      
      configResult.rows.forEach(row => {
        message += `*${row.key}:* ${row.value}\n`;
      });

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error in config:', error);
      await ctx.reply('❌ Error al obtener configuración.');
    }
  },

  async handlePagoAdmitir(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'processPayments');
      if (!adminContext) {
        return;
      }

      const data = ctx.callbackQuery.data;
      const transactionId = parseInt(data.split('_')[2]);
      
      if (isNaN(transactionId)) {
        await ctx.answerCbQuery('❌ ID de transacción inválido', true);
        return;
      }

      // Get transaction with user info
      const transactionResult = await pool.query(
        'SELECT t.*, u.telegram_id, u.username FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.answerCbQuery('❌ Transacción no encontrada', true);
        return;
      }

      const transaction = transactionResult.rows[0];

      // Check if already processed
      if (transaction.status === 'admitido' || transaction.status === 'pagado') {
        await ctx.answerCbQuery('⚠️ Esta transacción ya fue procesada', true);
        return;
      }

      if (transaction.status === 'cancelado') {
        await ctx.answerCbQuery('❌ Esta transacción fue cancelada', true);
        return;
      }

      // Get admin ID from admins table
      const adminId = adminContext.admin.id || null;

      // Update status to 'admitido'
      await updateTransactionStatus(pool, {
        id: transactionId,
        status: 'admitido',
        adminId
      });

      // Save transaction ID in state to ask for actas
      stateManager.setState(ctx.from.id, 'admin_waiting_actas', { transactionId });

      // Delete message from admin group
      try {
        await ctx.deleteMessage();
        console.log(`✅ Mensaje de orden ${transactionId} eliminado del grupo después de ser admitida`);
      } catch (deleteError) {
        console.error('Error deleting message:', deleteError);
        // Try to edit the message to mark as admitted
        try {
          const originalText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
          await ctx.editMessageText(
            originalText + '\n\n✅ *ADMITIDO*',
            { parse_mode: 'Markdown' }
          );
        } catch (editError) {
          console.error('Error editing message:', editError);
        }
      }

      await ctx.answerCbQuery('✅ Orden admitida');

      // Ask admin for actas/text to send to client
      await ctx.reply(
        `📝 *Ingrese las actas o el texto que se enviará al cliente*\n\n` +
        `Ejemplo:\n` +
        `Pago acreditado correctamente ✅\n` +
        `Nº de Acta: 02-135-01115082-1\n` +
        `Dominio: JAF462\n` +
        `Monto: $256.650,00`,
        { parse_mode: 'Markdown' }
      );

      // Log audit
      await auditLogger.log(
        `@${ctx.from.username || 'admin'}`,
        'pago_admitido',
        {
          transactionId,
          username: transaction.username,
          amount: transaction.amount_usdt
        }
      );

      // Don't send message to client yet - wait for admin to provide actas text
      // The actas will be sent in handleAdminActas
      return;
      
      // OLD CODE BELOW - This is now handled in handleAdminActas after actas are provided
      /*
      // Edit the waiting message to show countdown instead of sending a new message
      const botInstance = require('../bot').bot;
      
      try {
        // Parse user message info from proof_image
        // Format: user_message|chat_id|message_id|admin_group|chat_id|message_id
        let userChatId = null;
        let userMessageId = null;
        
        if (transaction.proof_image) {
          const parts = transaction.proof_image.split('|');
          if (parts.length >= 4 && parts[0] === 'user_message') {
            userChatId = parts[1];
            userMessageId = parseInt(parts[2]);
          }
        }
        
        // If we have the user message info, edit it; otherwise send a new message
        if (userChatId && userMessageId) {
          // Edit the waiting message to show countdown
          const successMessage = `✅ *Pago acreditado correctamente*`;
          
          try {
            await botInstance.telegram.editMessageText(
              userChatId,
              userMessageId,
              null,
              successMessage,
              { parse_mode: 'Markdown' }
            );
            
            // Show countdown for 10 seconds in the same message
            await animationManager.showCountdown(
              { telegram: botInstance.telegram, chat: { id: userChatId } },
              userMessageId,
              `✅ *Pago acreditado correctamente*`,
              10
            );
            
            // After countdown, delete the countdown message
            try {
              await botInstance.telegram.deleteMessage(userChatId, userMessageId);
            } catch (deleteError) {
              console.warn('Could not delete countdown message:', deleteError.message);
            }
            
            // Try to clean chat (delete what we can)
            try {
              await chatManager.cleanChat(
                { telegram: botInstance.telegram, chat: { id: userChatId } },
                transaction.telegram_id,
                0
              );
            } catch (cleanError) {
              console.warn('Error cleaning chat:', cleanError.message);
            }
            
            // Clear history
            chatManager.clearHistory(transaction.telegram_id);
            
            // Get user first name from Telegram
            let userFirstName = 'Usuario';
            try {
              const userInfo = await botInstance.telegram.getChat(transaction.telegram_id);
              userFirstName = userInfo.first_name || userInfo.username || 'Usuario';
            } catch (userInfoError) {
              console.warn('Could not get user info:', userInfoError.message);
            }
            
            // Send start message (this will be the ONLY message in the chat)
            const welcomeMessage = `🤖 *Bienvenido a Binopolis Pay*\n\n` +
              `Estimado/a ${userFirstName},\n\n` +
              `Gestionamos pagos corporativos con activos digitales. Seleccione la opción que desea continuar:`;

            const keyboard = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'PAGAR MULTAS PBA', callback_data: 'action_pagar_multas' }],
                  [{ text: 'PAGAR MACRO / PLUS PAGOS', callback_data: 'action_pagar_macro' }],
                  [{ text: 'VER SALDO', callback_data: 'action_saldo' }],
                  [{ text: 'CARGAR SALDO', callback_data: 'action_cargar' }]
                ]
              }
            };

            const welcomeMsg = await botInstance.telegram.sendMessage(
              transaction.telegram_id,
              welcomeMessage,
              { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup }
            );
            
            // Register the welcome message as the only bot message
            chatManager.registerBotMessage(transaction.telegram_id, welcomeMsg.message_id);
          } catch (editError) {
            console.error('Error editing user message:', editError);
            // Fallback: send new message if edit fails
            const successMessage = `✅ *Pago acreditado correctamente*`;
            const countdownMsg = await botInstance.telegram.sendMessage(
              transaction.telegram_id,
              successMessage,
              { parse_mode: 'Markdown' }
            );
            await animationManager.showCountdown(
              { telegram: botInstance.telegram, chat: { id: transaction.telegram_id } },
              countdownMsg.message_id,
              `✅ *Pago acreditado correctamente*`,
              10
            );
            
            // Delete countdown message and clean chat
            try {
              await botInstance.telegram.deleteMessage(transaction.telegram_id, countdownMsg.message_id);
            } catch (deleteError) {
              console.warn('Could not delete countdown message:', deleteError.message);
            }
            
            // Try to clean chat (delete what we can)
            try {
              await chatManager.cleanChat(
                { telegram: botInstance.telegram, chat: { id: transaction.telegram_id } },
                transaction.telegram_id,
                0
              );
            } catch (cleanError) {
              console.warn('Error cleaning chat:', cleanError.message);
            }
            
            chatManager.clearHistory(transaction.telegram_id);
            
            let userFirstName = 'Usuario';
            try {
              const userInfo = await botInstance.telegram.getChat(transaction.telegram_id);
              userFirstName = userInfo.first_name || userInfo.username || 'Usuario';
            } catch (userInfoError) {
              console.warn('Could not get user info:', userInfoError.message);
            }
            
            const welcomeMessage = `🤖 *Bienvenido a Binopolis Pay*\n\n` +
              `Estimado/a ${userFirstName},\n\n` +
              `Gestionamos pagos corporativos con activos digitales. Seleccione la opción que desea continuar:`;

            const keyboard = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'PAGAR MULTAS PBA', callback_data: 'action_pagar_multas' }],
                  [{ text: 'PAGAR MACRO / PLUS PAGOS', callback_data: 'action_pagar_macro' }],
                  [{ text: 'VER SALDO', callback_data: 'action_saldo' }],
                  [{ text: 'CARGAR SALDO', callback_data: 'action_cargar' }]
                ]
              }
            };

            // Use chatManager helper to automatically register the message
            const welcomeMsg = await chatManager.sendMessageAndRegister(
              botInstance.telegram,
              transaction.telegram_id,
              transaction.telegram_id,
              welcomeMessage,
              { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup }
            );
          }
        } else {
          // Fallback: send new message if we don't have the message info
          const successMessage = `✅ *Pago acreditado correctamente*`;
          
          const countdownMsg = await botInstance.telegram.sendMessage(
            transaction.telegram_id,
            successMessage,
            { parse_mode: 'Markdown' }
          );
          
          await animationManager.showCountdown(
            { telegram: botInstance.telegram, chat: { id: transaction.telegram_id } },
            countdownMsg.message_id,
            `✅ *Pago acreditado correctamente*`,
            60
          );
          
          // Delete countdown message and clean chat
          try {
            await botInstance.telegram.deleteMessage(transaction.telegram_id, countdownMsg.message_id);
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (deleteError) {
            console.warn('Could not delete countdown message:', deleteError.message);
          }
          
          // Delete ALL bot messages using aggressive method
          await chatManager.deleteAllBotMessages(
            botInstance.telegram,
            transaction.telegram_id,
            transaction.telegram_id
          );
          
          // Also try the regular cleanChat method as backup
          await chatManager.cleanChat(
            { telegram: botInstance.telegram, chat: { id: transaction.telegram_id } },
            transaction.telegram_id,
            0
          );
          chatManager.clearHistory(transaction.telegram_id);
          
          // Small delay before sending welcome message
          await new Promise(resolve => setTimeout(resolve, 200));
          
          let userFirstName = 'Usuario';
          try {
            const userInfo = await botInstance.telegram.getChat(transaction.telegram_id);
            userFirstName = userInfo.first_name || userInfo.username || 'Usuario';
          } catch (userInfoError) {
            console.warn('Could not get user info:', userInfoError.message);
          }
          
          const welcomeMessage = `🤖 *Bienvenido a Binopolis Pay*\n\n` +
            `Estimado/a ${userFirstName},\n\n` +
            `Gestionamos pagos corporativos con activos digitales. Seleccione la opción que desea continuar:`;

          const keyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'PAGAR MULTAS PBA', callback_data: 'action_pagar_multas' }],
                [{ text: 'PAGAR MACRO / PLUS PAGOS', callback_data: 'action_pagar_macro' }],
                [{ text: 'VER SALDO', callback_data: 'action_saldo' }],
                [{ text: 'CARGAR SALDO', callback_data: 'action_cargar' }]
              ]
            }
          };

          const welcomeMsg = await botInstance.telegram.sendMessage(
            transaction.telegram_id,
            welcomeMessage,
            { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup }
          );
          
          chatManager.registerBotMessage(transaction.telegram_id, welcomeMsg.message_id);
        }
      } catch (userMsgError) {
        console.error('Error editing/sending countdown message to user:', userMsgError);
      }
      */
    } catch (error) {
      console.error('Error in handlePagoAdmitir:', error);
      await ctx.answerCbQuery('❌ Error al admitir orden', true);
      stateManager.clearState(ctx.from.id);
    }
  },

  async handlePagoConfirm(ctx) {
    let answered = false;
    try {
      // Answer callback query immediately to prevent timeout
      await ctx.answerCbQuery('⏳ Procesando...');
      answered = true;
      
      const data = ctx.callbackQuery.data;
      const transactionId = parseInt(data.split('_')[2]);
      
      if (isNaN(transactionId)) {
        await ctx.reply('❌ ID de transacción inválido');
        return;
      }

      // Get transaction with user info
      const transactionResult = await pool.query(
        'SELECT t.*, u.telegram_id, u.username FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.answerCbQuery('❌ Transacción no encontrada', true);
        return;
      }

      const transaction = transactionResult.rows[0];
      
      // Save original status before update
      const originalStatus = transaction.status;

      // Check if already processed - prevent multiple confirmations
      if (transaction.status === 'pagado') {
        await ctx.reply('⚠️ Esta transacción ya fue pagada');
        // Try to delete the message if it still exists
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          // Message already deleted or doesn't exist, that's okay
        }
        return;
      }

      if (transaction.status === 'cancelado') {
        await ctx.reply('❌ Esta transacción fue cancelada');
        // Try to delete the message if it still exists
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          // Message already deleted or doesn't exist, that's okay
        }
        return;
      }

      // Get admin ID from admins table
      const adminResult = await pool.query(
        'SELECT id FROM admins WHERE telegram_id = $1 OR username = $2 LIMIT 1',
        [ctx.from.id, ctx.from.username ? `@${ctx.from.username}` : null]
      );
      const adminId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;

      // Update transaction status using transaction to prevent race conditions
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Lock the transaction row and check status again
        const lockedTx = await client.query(
          'SELECT status FROM transactions WHERE id = $1 FOR UPDATE',
          [transactionId]
        );
        
        if (lockedTx.rows.length === 0) {
          await client.query('ROLLBACK');
          await ctx.reply('❌ Transacción no encontrada');
          return;
        }
        
        if (lockedTx.rows[0].status === 'pagado' || lockedTx.rows[0].status === 'cancelado') {
          await client.query('ROLLBACK');
          await ctx.reply('⚠️ Esta transacción ya fue procesada');
          try {
            await ctx.deleteMessage();
          } catch (deleteError) {
            // Message already deleted, that's okay
          }
          return;
        }
        
        // Update transaction status
        await updateTransactionStatus(client, {
          id: transactionId,
          status: 'pagado',
          adminId
        });
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      await auditLogger.log(
        `@${ctx.from.username || 'admin'}`,
        'pago_confirmado',
        { transactionId }
      );

      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [transaction.user_id]
      );
      const user = userResult.rows[0];

      const txDetailsAfter = await pool.query(
        'SELECT * FROM transactions WHERE id = $1',
        [transactionId]
      );

      if (txDetailsAfter.rows.length === 0) {
        await ctx.reply('❌ Error: Transacción no encontrada después de actualizar');
        return;
      }

      const txAfter = txDetailsAfter.rows[0];

      const bot = require('../bot').bot;
      const formatARS = require('../../utils/helpers').formatARS;
      const animationManager = require('../utils/animations');

      const txForMessage = await pool.query(
        'SELECT proof_image, amount_ars, amount_usdt, identifier, type FROM transactions WHERE id = $1',
        [transactionId]
      );

      if (txForMessage.rows.length === 0) {
        await ctx.reply('❌ Error: Transacción no encontrada');
        return;
      }

      let nombreServicio = 'Servicio';
      try {
        const adminMessageText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
        
        // Intentar extraer el nombre del servicio del mensaje del admin
        // Buscar "Servicio: " en diferentes formatos
        const servicioMatch1 = adminMessageText.match(/Servicio: (.+?)(?:\n|$)/);
        const servicioMatch2 = adminMessageText.match(/📋 Servicio: (.+?)(?:\n|$)/);
        const servicioMatch = servicioMatch2 || servicioMatch1;
        
        if (servicioMatch) {
          nombreServicio = servicioMatch[1].trim();
          // Limpiar el nombre del servicio (remover emojis y caracteres especiales si es necesario)
          nombreServicio = nombreServicio.replace(/^📋\s*/, '').trim();
        } else {
          // Fallback a tipos conocidos
          if (adminMessageText.includes('Macro/PlusPagos') || adminMessageText.includes('MACRO / PLUSPAGOS')) {
            nombreServicio = 'Macro/PlusPagos';
          } else if (adminMessageText.includes('Rentas Córdoba') || adminMessageText.includes('RENTAS CÓRDOBA')) {
            nombreServicio = 'Rentas Córdoba';
          } else if (adminMessageText.includes('PAGAR OTRO SERVICIO')) {
            nombreServicio = 'Otro Servicio';
          } else if (adminMessageText.includes('Multa') || adminMessageText.includes('MULTA')) {
            nombreServicio = 'Multa';
          }
        }
      } catch (e) {
        console.error('Error extracting service name:', e);
      }

      const montoFormateado = txForMessage.rows[0]?.amount_ars ? formatARS(txForMessage.rows[0].amount_ars) : '';
      const amountUSDT = parseFloat(txForMessage.rows[0]?.amount_usdt || 0);
      const fechaHora = new Date().toLocaleString('es-AR', { 
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const finalMessage = `*Pago realizado* ✅\n\n` +
        `Su pago de *${nombreServicio}* fue acreditado correctamente. ✅\n\n` +
        `*Datos de la operación:*\n\n` +
        `*Fecha y hora:* ${fechaHora}\n` +
        `*Monto abonado:* ${montoFormateado}\n` +
        `*Cargo aplicado:* ${amountUSDT.toFixed(0)} USDT\n\n` +
        `Gracias por confiar en Binopolis Pay.`;

      const menuKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 VOLVER AL MENU', callback_data: 'pago_completado_menu' }]
          ]
        }
      };
      
      // SEND MESSAGE IMMEDIATELY - This ensures it's visible
      console.log(`[DEBUG handlePagoConfirm] Sending message to ${transaction.telegram_id}`);
      console.log(`[DEBUG handlePagoConfirm] Full message: ${finalMessage}`);
      
      let sentMessage;
      try {
        sentMessage = await bot.telegram.sendMessage(
          transaction.telegram_id,
          finalMessage,
          { 
            parse_mode: 'Markdown', 
            reply_markup: menuKeyboard.reply_markup,
            disable_notification: false
          }
        );
        console.log(`✅✅✅ Confirmation message sent successfully to user ${transaction.telegram_id}, message_id: ${sentMessage.message_id}`);
        
        // Save this message ID
        await pool.query(
          'UPDATE transactions SET proof_image = $1 WHERE id = $2',
          [`pago_completado_message|${transaction.telegram_id}|${sentMessage.message_id}`, transactionId]
        );
      } catch (sendError) {
        console.error('❌❌❌ CRITICAL ERROR sending confirmation message:', sendError);
        console.error('Error response:', sendError.response);
        console.error('Error code:', sendError.code);
        console.error('Error description:', sendError.description);
        
        // Try again with simpler format - NO EXCEPTIONS
        try {
          const simpleAmountUSDT = parseFloat(txForMessage.rows[0]?.amount_usdt || 0);
          const simpleMessage = `✅ *Pago realizado*\n\n` +
            `Su pago fue acreditado correctamente.\n\n` +
            `Monto abonado: ${montoFormateado}\n` +
            `Cargo aplicado: ${simpleAmountUSDT.toFixed(0)} USDT\n\n` +
            `Gracias por utilizar Binopolis Pay.`;
          
          const simpleMenuKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏠 VOLVER AL MENU', callback_data: 'pago_completado_menu' }]
              ]
            }
          };
          
          sentMessage = await bot.telegram.sendMessage(
            transaction.telegram_id,
            simpleMessage,
            { 
              parse_mode: 'Markdown',
              reply_markup: simpleMenuKeyboard.reply_markup,
              disable_notification: false
            }
          );
          console.log(`✅ Simple confirmation message sent to user ${transaction.telegram_id}`);
        } catch (retryError) {
          console.error('❌❌❌ CRITICAL: Could not send ANY message to user:', retryError);
          // Don't throw - continue with other operations
        }
      }
      
      // Send PDF receipt after confirmation - ONLY ONCE after payment is confirmed
      // Check if PDF was already sent by checking transaction status
      const txStatusCheck = await pool.query(
        'SELECT status, proof_image FROM transactions WHERE id = $1',
        [transactionId]
      );
      
      if (txStatusCheck.rows.length > 0 && txStatusCheck.rows[0].status === 'pagado') {
        // Only send PDF if payment is confirmed and not already sent
        const proofImage = txStatusCheck.rows[0].proof_image || '';
        const pdfAlreadySent = proofImage.includes('pdf_sent');
        
        if (!pdfAlreadySent) {
          try {
            const adminMessageRaw = ctx.callbackQuery?.message?.text || ctx.callbackQuery?.message?.caption || '';
            
            // Extract receipt details from admin message
            let codeLabel = 'Referencia';
            let codeValue = 'N/A';
            
            // Try to extract code/number from admin message
            const codigoMatch = adminMessageRaw.match(/📄 Código\/Número: (.+)/);
            if (codigoMatch) {
              codeValue = codigoMatch[1].trim();
            }

            const pdfBuffer = await generatePaymentReceiptPDF({
              transactionId,
              headerName: nombreServicio || 'Pago',
              serviceName: nombreServicio || 'Servicio',
              codeLabel: codeLabel,
              codeValue: codeValue,
              amountFormatted: montoFormateado
            });

            await bot.telegram.sendDocument(
              transaction.telegram_id,
              { source: pdfBuffer, filename: `comprobante_pago_${transactionId}.pdf` },
              {
                caption: `✅ Comprobante de pago #${transactionId}`,
                parse_mode: 'Markdown',
                disable_notification: false
              }
            );
            
            // Mark PDF as sent
            await pool.query(
              'UPDATE transactions SET proof_image = COALESCE(proof_image, \'\') || \'|pdf_sent\' WHERE id = $1',
              [transactionId]
            );
            
            console.log(`✅ PDF receipt sent to user ${transaction.telegram_id} for transaction #${transactionId}`);
          } catch (pdfError) {
            console.error('Error generating or sending receipt PDF:', pdfError);
          }
        }
      }
      
      // Generate and send receipt image to public channel
      try {
        const publicChannel = config.public_channel;
        if (publicChannel) {
          // Generate receipt image
          const receiptImageBuffer = await generateReceiptImage({
            empresa: nombreServicio
          });

          // Create caption message - solo descripción, sin datos en la imagen
          const channelMessage = `Pago realizado por el bot exitosamente. ✅\n\n` +
            `Empresa: ${nombreServicio}\n` +
            `Monto: ${montoFormateado}\n` +
            `Transacción #${transactionId}\n\n` +
            `PAGO AUTOMÁTICO, ${config.bot_username || '@binopolisPAY_bot'}`;

          // Send image to public channel
          await bot.telegram.sendPhoto(
            publicChannel,
            { source: receiptImageBuffer },
            {
              caption: channelMessage,
              parse_mode: 'Markdown'
            }
          );
          console.log(`✅ Comprobante enviado al canal público ${publicChannel}`);
        }
      } catch (channelError) {
        console.error('Error sending receipt to public channel:', channelError);
        // No lanzar error - esto no debe bloquear la confirmación del pago
      }
      
      // Now handle admin group message updates (non-blocking)
      // Check if it was admitted before marking as paid (use originalStatus)
      const wasAdmittedBefore = originalStatus === 'admitido';
      
      // For multas payments that were admitted, delete the message and show as PAGADO
      if (wasAdmittedBefore && txAfter.amount_ars) {
        // This is a multas payment that was admitted, now marked as paid
        try {
          const proofImage = txAfter.proof_image || '';
          if (proofImage.startsWith('group_message|')) {
            const parts = proofImage.split('|');
            if (parts.length >= 3) {
              const groupChatId = parts[1];
              const groupMessageId = parts[2];
              
              try {
                await bot.telegram.deleteMessage(groupChatId, parseInt(groupMessageId));
                console.log(`✅ Mensaje de orden ${transactionId} eliminado del grupo después de ser marcado como PAGADO`);
              } catch (deleteError) {
                console.error('Error deleting message:', deleteError);
              }
            }
          }
        } catch (error) {
          console.error('Error processing message deletion:', error);
        }

        // Send new message to group showing PAGADO status
        const montoFormateadoGroup = formatARS(txAfter.amount_ars);
        
        const pagadoMessage = `✅ *ORDEN PAGADA*\n\n` +
          `📋 *Orden ID:* ${transactionId}\n\n` +
          `👤 *Usuario:* @${user.username || 'sin_username'}\n\n` +
          `💰 *Monto Multa ARS:* ${montoFormateadoGroup}\n` +
          `💵 *COBRADO USDT:* ${txAfter.amount_usdt.toFixed(2)}\n\n` +
          `📊 *Estado:* PAGADO`;

        const groupManager = require('../utils/groupManager');
        try {
          await groupManager.sendToAdminGroups(
            bot,
            pagadoMessage,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error('Error sending PAGADO message:', error);
        }
      } else {
        // For non-multas or direct payments (Macro, Otra, Rentas), edit the message to show PAGADO status
        try {
          const originalText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
          
          // Edit message to show PAGADO status (remove inline keyboard)
          const pagadoText = originalText.replace(/Estado:.*/i, 'Estado: PAGADO');
          
          let edited = false;
          try {
            await ctx.editMessageText(
              pagadoText,
              { reply_markup: { inline_keyboard: [] } }
            );
            edited = true;
          } catch (editTextError) {
            // If it's a photo message, try editing caption
            try {
              await ctx.editMessageCaption(
                pagadoText,
                { reply_markup: { inline_keyboard: [] } }
              );
              edited = true;
            } catch (editCaptionError) {
              console.log('Could not edit message text or caption:', editCaptionError.message);
            }
          }

          if (!edited) {
            // As a fallback, try removing the inline keyboard directly
            try {
              await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
            } catch (replyMarkupError) {
              console.log('Could not remove reply markup:', replyMarkupError.message);
            }
          }

          console.log(`✅ Mensaje de orden ${transactionId} marcado como PAGADO en el grupo`);
        } catch (error) {
          console.error('Error editing message to show PAGADO:', error);
        }
      }
      
      // Delete user's "Orden enviada" message if it exists (no progress bar)
      if (txForMessage.rows.length > 0 && txForMessage.rows[0].proof_image) {
        const proofImage = txForMessage.rows[0].proof_image;
        if (proofImage.startsWith('user_message|')) {
          const parts = proofImage.split('|');
          if (parts.length >= 3) {
            const userChatId = parts[1];
            const userMessageId = parseInt(parts[2]);
            
            if (userChatId && userMessageId) {
              try {
                // Delete the "Orden enviada" message directly (no progress bar)
                await bot.telegram.deleteMessage(userChatId, userMessageId);
                console.log(`✅ Deleted user message ${userMessageId} for transaction ${transactionId}`);
              } catch (deleteError) {
                console.log('Could not delete user message (non-critical):', deleteError.message);
              }
            }
          }
        }
      }

      await ctx.reply('✅ Pago confirmado exitosamente');
    } catch (error) {
      console.error('❌❌❌ CRITICAL ERROR in handlePagoConfirm:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', JSON.stringify(error, null, 2));
      try {
        if (!answered) {
          await ctx.answerCbQuery('❌ Error al confirmar pago', true);
        } else {
          await ctx.reply('❌ Error al confirmar pago: ' + error.message);
        }
      } catch (answerError) {
        console.error('Could not answer callback query:', answerError);
      }
    }
  },

  async handlePagoCancel(ctx) {
    let answered = false;
    try {
      // Answer callback query immediately to prevent timeout
      await ctx.answerCbQuery('⏳ Procesando...');
      answered = true;
      
      const data = ctx.callbackQuery.data;
      const transactionId = parseInt(data.split('_')[2]);
      
      if (isNaN(transactionId)) {
        await ctx.reply('❌ ID de transacción inválido');
        return;
      }

      const transactionResult = await pool.query(
        'SELECT * FROM transactions WHERE id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.reply('❌ Transacción no encontrada');
        return;
      }

      const transaction = transactionResult.rows[0];

      // Check if already processed - prevent multiple cancellations
      if (transaction.status === 'cancelado') {
        await ctx.reply('⚠️ Esta transacción ya fue cancelada');
        // Try to delete the message if it still exists
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          // Message already deleted or doesn't exist, that's okay
        }
        return;
      }

      if (transaction.status === 'pagado') {
        await ctx.reply('❌ No se puede cancelar un pago ya confirmado');
        // Try to delete the message if it still exists
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          // Message already deleted or doesn't exist, that's okay
        }
        return;
      }
      
      // Use transaction to prevent race conditions
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Lock the transaction row and check status again
        const lockedTx = await client.query(
          'SELECT status, type, amount_usdt, user_id FROM transactions WHERE id = $1 FOR UPDATE',
          [transactionId]
        );
        
        if (lockedTx.rows.length === 0) {
          await client.query('ROLLBACK');
          await ctx.reply('❌ Transacción no encontrada');
          return;
        }
        
        const lockedTransaction = lockedTx.rows[0];
        
        if (lockedTransaction.status === 'pagado' || lockedTransaction.status === 'cancelado') {
          await client.query('ROLLBACK');
          await ctx.reply('⚠️ Esta transacción ya fue procesada');
          try {
            await ctx.deleteMessage();
          } catch (deleteError) {
            // Message already deleted, that's okay
          }
          return;
        }
        
        // Refund balance if it was a payment type (balance was deducted when created)
        // For multas, balance is deducted immediately when order is created, so we need to refund
        if (lockedTransaction.type === 'pago') {
          await client.query(
            'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
            [lockedTransaction.amount_usdt, lockedTransaction.user_id]
          );
          console.log(`Refunded ${lockedTransaction.amount_usdt} USDT to user for cancelled transaction ${transactionId}`);
        }

        // Update transaction
        await updateTransactionStatus(client, {
          id: transactionId,
          status: 'cancelado',
          motivo: 'Cancelado por administrador'
        });
        
        await client.query('COMMIT');

        await webhookService.emit('transactions.status_changed', {
          transactionId,
          previousStatus: transaction.status,
          newStatus: 'cancelado',
          admin: ctx.from.username ? `@${ctx.from.username}` : ctx.from.id,
          eventSource: 'admin_bot',
          motivo: 'Cancelado por administrador'
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      await auditLogger.log(
        `@${ctx.from.username || 'admin'}`,
        'pago_cancelado',
        { transactionId, motivo: 'Cancelado por administrador' }
      );

      // Get user info
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [transaction.user_id]
      );
      const user = userResult.rows.length > 0 ? userResult.rows[0] : null;

      // Notify all admins
      const bot = require('../bot').bot;
      if (user) {
        await notificationService.notifyAdmins(bot, 'pago_cancelado', {
          admin: ctx.from.username || 'admin',
          transactionId: transactionId,
          username: user.username || 'usuario',
          amount: transaction.amount_usdt,
          motivo: 'Cancelado por administrador'
        });
      }

      // Delete message from admin group
      try {
        await ctx.deleteMessage();
        console.log(`✅ Mensaje de orden ${transactionId} eliminado del grupo después de ser cancelada`);
      } catch (deleteError) {
        // If message was already deleted, that's okay
        if (deleteError.response?.error_code !== 400 && deleteError.response?.error_code !== 404) {
          console.error('Error deleting message:', deleteError);
          // Fallback: try to edit the message to mark as cancelled
          try {
            const originalText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
            await ctx.editMessageText(
              originalText + '\n\n❌ *Cancelado*',
              { parse_mode: 'Markdown' }
            );
          } catch (editError) {
            console.error('Error editing message:', editError);
          }
        }
      }

      await ctx.reply('✅ Pago cancelado exitosamente');

      // Notify user
      if (user) {
        await notificationService.notifyUser(bot, user.telegram_id, 'pago_cancelado', {
          motivo: 'Cancelado por administrador'
        });
        // Also send message about /movimientos
        try {
          await bot.telegram.sendMessage(
            user.telegram_id,
            `💡 Usa /movimientos para ver todos tus movimientos.`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error('Error sending movimientos message:', error);
        }
      }
    } catch (error) {
      console.error('❌❌❌ CRITICAL ERROR in handlePagoCancel:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', JSON.stringify(error, null, 2));
      try {
        if (!answered) {
          await ctx.answerCbQuery('❌ Error al cancelar pago', true);
        } else {
          await ctx.reply('❌ Error al cancelar pago: ' + error.message);
        }
      } catch (answerError) {
        console.error('Could not answer callback query:', answerError);
      }
    }
  },

  async handleAdminActas(ctx, actasText) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'processPayments');
      if (!adminContext) {
        stateManager.clearState(ctx.from.id);
        return;
      }

      console.log('📝 handleAdminActas called with text:', actasText?.substring(0, 100));
      
      if (!actasText || actasText.trim().length === 0) {
        await ctx.reply('❌ El texto no puede estar vacío. Ingrese el detalle que se enviará al cliente.');
        return;
      }
      
      const data = stateManager.getData(ctx.from.id);
      const transactionId = data?.transactionId;

      if (!transactionId) {
        await ctx.reply('❌ No se encontró transacción.');
        stateManager.clearState(ctx.from.id);
        return;
      }
      
      console.log('📝 Processing actas for transaction:', transactionId);

      // Get transaction with user info
      const transactionResult = await pool.query(
        'SELECT t.*, u.telegram_id, u.username FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.reply('❌ Transacción no encontrada.');
        stateManager.clearState(ctx.from.id);
        return;
      }

      const transaction = transactionResult.rows[0];

      // Send actas text to client
      const botInstance = require('../bot').bot;
      const chatManager = require('../utils/chatManager');
      const animationManager = require('../utils/animations');
      
      try {
        // Obtener admin ID
        const adminLookup = await pool.query(
          'SELECT id FROM admins WHERE telegram_id = $1 OR username = $2 LIMIT 1',
          [ctx.from.id, ctx.from.username ? `@${ctx.from.username}` : null]
        );
        const adminId = adminLookup.rows.length > 0 ? adminLookup.rows[0].id : null;

        // Update transaction status to 'pagado' (pago exitoso)
        await updateTransactionStatus(pool, {
          id: transactionId,
          status: 'pagado',
          adminId: adminContext.admin.id || null
        });
        
        // Get transaction details for progress bar
        const txForProgress = await pool.query(
          'SELECT proof_image, amount_ars, amount_usdt FROM transactions WHERE id = $1',
          [transactionId]
        );
        
        const formatARS = require('../../utils/helpers').formatARS;
        
        // Find user's "Orden enviada" message and show progress bar
        let userChatId = null;
        let userMessageId = null;
        
        if (txForProgress.rows.length > 0 && txForProgress.rows[0].proof_image) {
          const proofImage = txForProgress.rows[0].proof_image;
          // Format: user_message|chat_id|message_id or user_message|chat_id|message_id|admin_group|...
          if (proofImage.startsWith('user_message|')) {
            const parts = proofImage.split('|');
            if (parts.length >= 3) {
              userChatId = parts[1];
              userMessageId = parseInt(parts[2]);
            }
          }
        }
        
        if (userChatId && userMessageId) {
          // Show progress bar that reaches 100%
          await animationManager.showProgress(
            { telegram: botInstance.telegram, chat: { id: userChatId } },
            userMessageId,
            '✅ Orden enviada\n\nSu pago fue recibido correctamente.\nLe notificaremos cuando finalice la gestión.',
            2000,
            20 // 20 steps for smoother animation
          );
          
          // Delete the "Orden enviada" message after progress bar
          try {
            await botInstance.telegram.deleteMessage(userChatId, userMessageId);
          } catch (deleteError) {
            console.log('Could not delete user message:', deleteError.message);
          }
        }
        
        // Send actas text to client FIRST (without parse_mode to avoid formatting issues)
        try {
          await botInstance.telegram.sendMessage(
            transaction.telegram_id,
            actasText
          );
          console.log(`✅ Actas text sent to user ${transaction.telegram_id}:`, actasText.substring(0, 50) + '...');
        } catch (sendError) {
          console.error('Error sending actas text:', sendError);
          // Try without parse_mode if Markdown fails
          try {
            await botInstance.telegram.sendMessage(
              transaction.telegram_id,
              actasText
            );
          } catch (retryError) {
            console.error('Error sending actas text (retry):', retryError);
            throw retryError;
          }
        }
        
        // Get service name from transaction or admin message
        let nombreServicio = 'Servicio';
        try {
          // Try to determine service name from transaction type or identifier
          if (transaction.identifier) {
            nombreServicio = 'Multa';
          }
        } catch (e) {
          console.log('Could not extract service name');
        }
        
        // Send final confirmation message with all details
        const montoFormateado = txForProgress.rows[0]?.amount_ars ? formatARS(txForProgress.rows[0].amount_ars) : '';
        const fechaHora = new Date().toLocaleString('es-AR', { 
          timeZone: 'America/Argentina/Buenos_Aires',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const finalMessage = `*Pago realizado* ✅\n\n` +
          `Su pago de *${nombreServicio}* fue acreditado correctamente. ✅\n\n` +
          `*Datos de la operación:*\n\n` +
          `*Fecha y hora:* ${fechaHora}\n` +
          `*Monto abonado:* ${montoFormateado}\n` +
          `*Cargo aplicado:* ${txForProgress.rows[0]?.amount_usdt.toFixed(0) || '0'} USDT\n\n` +
          `Gracias por confiar en Binopolis Pay.`;
        
        const menuKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: '🏠 MENU PRINCIPAL' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };
        
        try {
          const sentMessage = await botInstance.telegram.sendMessage(
            transaction.telegram_id,
            finalMessage,
            { parse_mode: 'Markdown', reply_markup: menuKeyboard.reply_markup }
          );
          
          // Save this message ID to delete it when MENU is pressed
          await pool.query(
            'UPDATE transactions SET proof_image = $1 WHERE id = $2',
            [`pago_completado_message|${transaction.telegram_id}|${sentMessage.message_id}`, transactionId]
          );
        } catch (sendError) {
          console.error('Error sending confirmation message:', sendError);
        }
        
        // Don't clean chat - let the user see the actas text and confirmation message
        // The chat will be cleaned when they press MENU PRINCIPAL
        
        await ctx.reply('✅ Texto enviado al cliente correctamente.');
      } catch (error) {
        console.error('Error sending actas to client:', error);
        await ctx.reply('❌ Error al enviar texto al cliente.');
      }

      stateManager.clearState(ctx.from.id);
    } catch (error) {
      console.error('Error in handleAdminActas:', error);
      await ctx.reply('❌ Error al procesar actas.');
      stateManager.clearState(ctx.from.id);
    }
  },

  async handleCargarConfirmOrder(ctx, callbackData) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageBalance');
      if (!adminContext) {
        return;
      }

      const transactionId = parseInt(callbackData.replace('cargar_confirm_order_', ''));
      
      if (isNaN(transactionId)) {
        await ctx.answerCbQuery('❌ ID de transacción inválido', true);
        return;
      }

      // Get transaction
      const transactionResult = await pool.query(
        'SELECT t.*, u.telegram_id, u.username FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.answerCbQuery('❌ Transacción no encontrada', true);
        return;
      }

      const transaction = transactionResult.rows[0];
      const originalStatus = transaction.status;
      
      if (transaction.status !== 'pendiente') {
        await ctx.answerCbQuery('⚠️ Esta transacción ya fue procesada', true);
        return;
      }

      // Get admin ID from admins table
      const adminId = adminContext.admin.id || null;

      // Start transaction for atomicity
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Update balance
        await client.query(
          'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
          [transaction.amount_usdt, transaction.user_id]
        );

        // Update transaction status
        await updateTransactionStatus(client, {
          id: transactionId,
          status: 'pagado',
          adminId
        });

        await client.query('COMMIT');

        await webhookService.emit('transactions.status_changed', {
          transactionId,
          previousStatus: originalStatus,
          newStatus: 'pagado',
          admin: ctx.from.username ? `@${ctx.from.username}` : ctx.from.id,
          eventSource: 'admin_bot'
        });
        
        console.log(`✅ Balance updated: User ${transaction.user_id} +${transaction.amount_usdt} USDT`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      await auditLogger.log(
        adminContext.admin.username || `@${ctx.from.username || 'admin'}`,
        'cargar_saldo',
        { username: transaction.username, amount: transaction.amount_usdt, transactionId }
      );

      // Get updated balance
      const userResult = await pool.query('SELECT saldo_usdt FROM users WHERE id = $1', [transaction.user_id]);
      const newBalance = parseFloat(userResult.rows[0].saldo_usdt).toFixed(2);

      // Notify user only (no notifyAdmins to avoid duplicate messages)
      const bot = require('../bot').bot;
      await notificationService.notifyUser(bot, transaction.telegram_id, 'carga_confirmada', {
        amount: transaction.amount_usdt
      });

      // Update message in admin group (orders) - marcar como acreditado pero mantener el mensaje
      try {
        const originalText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
        const actor = adminContext.admin.username || (ctx.from.username ? `@${ctx.from.username}` : 'admin');
        await ctx.editMessageCaption(
          `${originalText}\n\n✅ *Acreditado por ${actor}*`,
          { parse_mode: 'Markdown' }
        ).catch(async () => {
          // Si es mensaje de texto, editar el texto
          await ctx.editMessageText(
            `${originalText}\n\n✅ *Acreditado por ${actor}*`,
            { parse_mode: 'Markdown' }
          );
        });
      } catch (error) {
        console.error('Error updating message:', error);
      }

      // Send photo to TRANSFER GROUPS (solo cuando se acepta)
      const transferGroups = config.transfer_groups || [];
      const identifierLine = transaction.identifier ? `Referencia: ${transaction.identifier}` : null;
      const transferMessageText = [
        '═══════════════════════',
        ' TRANSFERENCIA RECIBIDA',
        '═══════════════════════',
        `Monto USDT: ${Number(transaction.amount_usdt).toFixed(2)}`,
        `Cliente: @${transaction.username || 'sin_username'}`,
        identifierLine,
        `Transacción #: ${transaction.id}`,
        '──────────────',
        'Verifique y registre la operación.'
      ].filter(Boolean).join('\n');

      // Get file_id from proof_image (formato: file_id|chat_id|message_id)
      const proofData = transaction.proof_image || '';
      const fileId = proofData.split('|')[0] || transaction.proof_image;

      for (const inviteLink of transferGroups) {
        try {
          const groupChatId = await groupManager.getGroupChatId(bot, inviteLink);
          
          if (groupChatId) {
            try {
              // Intentar sendPhoto con file_id
              await bot.telegram.sendPhoto(groupChatId, fileId, {
                caption: transferMessageText
              });
              console.log(`Photo sent to transfer group ${inviteLink} after approval`);
            } catch (error) {
              console.error(`Error sending photo to transfer group ${inviteLink}:`, error.message);
            }
          }
        } catch (error) {
          console.error(`Error processing transfer group ${inviteLink}:`, error.message);
        }
      }

      await ctx.answerCbQuery('✅ Saldo acreditado');
    } catch (error) {
      console.error('Error in handleCargarConfirmOrder:', error);
      await ctx.answerCbQuery('❌ Error al acreditar saldo', true);
    }
  },

  async handleCargarRejectOrder(ctx, callbackData) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageBalance');
      if (!adminContext) {
        return;
      }

      const transactionId = parseInt(callbackData.replace('cargar_reject_order_', ''));
      
      if (isNaN(transactionId)) {
        await ctx.answerCbQuery('❌ ID de transacción inválido', true);
        return;
      }

      // Get transaction
      const transactionResult = await pool.query(
        'SELECT t.*, u.telegram_id, u.username FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1',
        [transactionId]
      );

      if (transactionResult.rows.length === 0) {
        await ctx.answerCbQuery('❌ Transacción no encontrada', true);
        return;
      }

      const transaction = transactionResult.rows[0];
      const originalStatus = transaction.status;
      
      if (transaction.status !== 'pendiente') {
        await ctx.answerCbQuery('⚠️ Esta transacción ya fue procesada', true);
        return;
      }

      // Get admin ID from admins table
      const adminResult = await pool.query(
        'SELECT id FROM admins WHERE telegram_id = $1 OR username = $2 LIMIT 1',
        [ctx.from.id, ctx.from.username ? `@${ctx.from.username}` : null]
      );
      const adminId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;

      // Update transaction status
      await updateTransactionStatus(pool, {
        id: transactionId,
        status: 'cancelado',
        motivo: 'Rechazado por administrador',
        adminId
      });

      const motivo = 'Rechazado por administrador';

      await auditLogger.log(
        adminContext.admin.username || `@${ctx.from.username || 'admin'}`,
        'rechazar_carga',
        { username: transaction.username, amount: transaction.amount_usdt, motivo }
      );

      // Notify user
      const bot = require('../bot').bot;
      await notificationService.notifyUser(bot, transaction.telegram_id, 'pago_cancelado', {
        motivo: 'El comprobante fue rechazado por un administrador. Verifique la información e intente nuevamente.'
      });

      // ELIMINAR el mensaje (que incluye la foto) del grupo de órdenes (rechazado)
      try {
        // Eliminar el mensaje que contiene la foto y los botones
        await ctx.deleteMessage();
        console.log(`Photo and message deleted from admin group after rejection`);
      } catch (error) {
        console.error('Error deleting message:', error);
        // Si no se puede eliminar (ej: mensaje muy antiguo), intentar editar para marcar como rechazado
        try {
          const originalText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
          
          // Intentar editar el caption (si es foto)
          if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(
              (originalText || '') + '\n\n❌ *Rechazado por @' + (ctx.from.username || 'admin') + '*',
              { parse_mode: 'Markdown' }
            );
          } else {
            // Si es mensaje de texto
            await ctx.editMessageText(
              originalText + '\n\n❌ *Rechazado por @' + (ctx.from.username || 'admin') + '*',
              { parse_mode: 'Markdown' }
            );
          }
        } catch (editError) {
          console.error('Error updating message:', editError);
        }
      }

      await ctx.answerCbQuery('✅ Orden rechazada');

      await webhookService.emit('transactions.status_changed', {
        transactionId,
        previousStatus: originalStatus,
        newStatus: 'cancelado',
        admin: ctx.from.username ? `@${ctx.from.username}` : ctx.from.id,
        eventSource: 'admin_bot',
        motivo: 'Rechazado por administrador'
      });
    } catch (error) {
      console.error('Error in handleCargarRejectOrder:', error);
      await ctx.answerCbQuery('❌ Error al rechazar orden', true);
    }
  },

  async trc20(ctx) {
    try {
       // Verificar que es un grupo
       const chatType = ctx.chat.type;
       if (chatType !== 'group' && chatType !== 'supergroup') {
         await ctx.reply('❌ Este comando solo puede usarse en grupos.');
         return;
       }
 
       const adminContext = await ensureAdminPermission(ctx, 'access');
       if (!adminContext) {
         return;
       }
 
       // Enviar el link de TRC20
       const trc20Link = 'https://tronscan.org/#/address/TCFeWDZgCZQxuveQUDEEpdq9TA31itHkdM/transfers';
       await ctx.reply(`🔗 *Transacciones TRC20*\n\n${trc20Link}`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in /trc20:', error);
      await ctx.reply('❌ Error al ejecutar el comando.');
    }
  },

  async bep20(ctx) {
    try {
      // Verificar que es un grupo
      const chatType = ctx.chat.type;
      if (chatType !== 'group' && chatType !== 'supergroup') {
        await ctx.reply('❌ Este comando solo puede usarse en grupos.');
        return;
      }

      const adminContext = await ensureAdminPermission(ctx, 'access');
      if (!adminContext) {
        return;
      }

      // Enviar el link de BEP20
      const bep20Link = 'https://bscscan.com/address/0x009d4b9Aa21A320EEB130720FE4626b79671155E#tokentxns';
      await ctx.reply(`🔗 *Transacciones BEP20*\n\n${bep20Link}`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in /bep20:', error);
      await ctx.reply('❌ Error al ejecutar el comando.');
    }
  },

  async porcentaje(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageUsers');
      if (!adminContext) {
        return;
      }

      const messageText = ctx.message.text || '';
      const parts = messageText.split(' ').filter(Boolean);

      if (parts.length < 2) {
        await ctx.reply(
          '❌ Uso inválido.\n\n' +
          'Formato rápido: `/porcentaje @usuario 15 100000`\n' +
          'Formato guiado: `/porcentaje @usuario`\n\n' +
          'El segundo valor es el porcentaje y el tercero el monto mínimo opcional.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const identifier = parts[1];
      const targetUser = await findUserByIdentifier(identifier);

      if (!targetUser) {
        await ctx.reply('❌ Usuario no encontrado o sin actividad previa en el bot.');
        return;
      }

      if (parts.length >= 3) {
        const percentageValue = parsePercentageInput(parts[2]);
        if (percentageValue === null) {
          await ctx.reply('⚠️ Ingrese un porcentaje válido entre 0 y 100. Ejemplo: `/porcentaje @usuario 15`', { parse_mode: 'Markdown' });
          return;
        }

        let minAmountValue = targetUser.fee_min_amount_ars || 0;
        if (parts.length >= 4) {
          const parsedMin = parseAmountInput(parts[3]);
          if (parsedMin === null) {
            await ctx.reply('⚠️ Ingrese un monto mínimo válido en ARS. Ejemplo: `/porcentaje @usuario 15 100000`', { parse_mode: 'Markdown' });
            return;
          }
          minAmountValue = parsedMin;
        }

        await applyUserFeeSettings(ctx, adminContext, targetUser, percentageValue, minAmountValue);
        return;
      }

      const displayName = targetUser.username
        ? targetUser.username
        : (targetUser.telegram_id ? `ID ${targetUser.telegram_id}` : `Usuario #${targetUser.id}`);

      const currentPercentLabel = formatPercentage(targetUser.fee_percentage ?? DEFAULT_FEE_PERCENTAGE);
      const currentMinLabel = formatARS(targetUser.fee_min_amount_ars ?? 0);

      stateManager.setState(ctx.from.id, 'admin_set_percentage_waiting_percent');
      stateManager.setData(ctx.from.id, {
        percentageFlow: {
          userId: targetUser.id,
          telegramId: targetUser.telegram_id,
          username: targetUser.username,
          displayName,
          identifier,
          currentPercent: targetUser.fee_percentage ?? DEFAULT_FEE_PERCENTAGE,
          currentMinAmount: targetUser.fee_min_amount_ars ?? 0
        }
      });

      const promptMessage = [
        `📊 Ajuste de porcentaje para ${displayName}`,
        '',
        `Porcentaje vigente: ${currentPercentLabel}`,
        `Monto mínimo actual: ${currentMinLabel}`,
        '',
        'Ingrese el nuevo porcentaje (0 - 100).'
      ].join('\n');

      await ctx.reply(promptMessage);
    } catch (error) {
      console.error('Error en /porcentaje:', error);
      await ctx.reply('❌ Error al procesar el ajuste de porcentaje.');
    }
  },

  async handlePorcentajePercentStep(ctx, inputText) {
    try {
      const data = stateManager.getData(ctx.from.id);
      const flow = data?.percentageFlow;

      if (!flow) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('⚠️ No hay un ajuste en curso. Utiliza `/porcentaje @usuario` para iniciarlo.', { parse_mode: 'Markdown' });
        return;
      }

      const percentageValue = parsePercentageInput(inputText);
      if (percentageValue === null) {
        await ctx.reply('⚠️ Ingrese un porcentaje válido entre 0 y 100. Ejemplo: 15');
        return;
      }

      stateManager.setData(ctx.from.id, {
        percentageFlow: {
          ...flow,
          pendingPercent: percentageValue
        }
      });

      stateManager.setState(ctx.from.id, 'admin_set_percentage_waiting_min');

      await ctx.reply(
        '💵 Ingrese el monto mínimo en ARS a partir del cual se aplicará este porcentaje.\n\n' +
        'Ejemplo: 100000,00\n' +
        'Si desea que se aplique siempre, responda 0.'
      );
    } catch (error) {
      console.error('Error en handlePorcentajePercentStep:', error);
      stateManager.clearState(ctx.from.id);
      await ctx.reply('❌ Error al procesar el porcentaje. Intenta nuevamente.');
    }
  },

  async handlePorcentajeMinStep(ctx, inputText) {
    try {
      const data = stateManager.getData(ctx.from.id);
      const flow = data?.percentageFlow;

      if (!flow || flow.pendingPercent === undefined) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('⚠️ El ajuste fue cancelado. Usa `/porcentaje @usuario` para iniciarlo nuevamente.', { parse_mode: 'Markdown' });
        return;
      }

      const minAmountValue = parseAmountInput(inputText);
      if (minAmountValue === null) {
        await ctx.reply('⚠️ Ingrese un monto mínimo válido en ARS. Ejemplo: 50000,00');
        return;
      }

      const adminContext = await ensureAdminPermission(ctx, 'manageUsers');
      if (!adminContext) {
        stateManager.clearState(ctx.from.id);
        return;
      }

      const userResult = await pool.query(
        'SELECT id, telegram_id, username, fee_percentage, fee_min_amount_ars FROM users WHERE id = $1',
        [flow.userId]
      );

      if (!userResult.rows.length) {
        stateManager.clearState(ctx.from.id);
        await ctx.reply('❌ El usuario ya no se encuentra registrado.');
        return;
      }

      await applyUserFeeSettings(ctx, adminContext, userResult.rows[0], flow.pendingPercent, minAmountValue);

      stateManager.clearState(ctx.from.id);
    } catch (error) {
      console.error('Error en handlePorcentajeMinStep:', error);
      stateManager.clearState(ctx.from.id);
      await ctx.reply('❌ Error al registrar el monto mínimo. Intenta nuevamente.');
    }
  },

  async banear(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageUsers');
      if (!adminContext) {
        return;
      }

      const messageText = ctx.message.text || '';
      const parts = messageText.split(' ').filter(p => p.length > 0);

      // Formato: /banear @usuario 30
      if (parts.length < 3) {
        await ctx.reply(
          '❌ Uso incorrecto.\n\n' +
          'Formato: `/banear @usuario <minutos>`\n\n' +
          'Ejemplo: `/banear @usuario 30`\n\n' +
          'Esto baneará al usuario por 30 minutos.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const username = parts[1].replace('@', '');
      const minutes = parseInt(parts[2]);

      if (isNaN(minutes) || minutes <= 0) {
        await ctx.reply('❌ El tiempo debe ser un número positivo de minutos.');
        return;
      }

      // Buscar usuario por username
      const userResult = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );

      if (userResult.rows.length === 0) {
        await ctx.reply(`❌ Usuario @${username} no encontrado en la base de datos.`);
        return;
      }

      const user = userResult.rows[0];
      const telegramId = user.telegram_id;

      // Calcular fecha de desbaneo
      const bannedUntil = new Date();
      bannedUntil.setMinutes(bannedUntil.getMinutes() + minutes);

      const actorTelegramId = adminContext.admin.telegram_id || ctx.from.id.toString();
      const actorUsername = adminContext.admin.username || (ctx.from.username ? `@${ctx.from.username}` : `user_${ctx.from.id}`);

      // Insertar o actualizar ban
      await pool.query(
        `INSERT INTO banned_users (telegram_id, username, banned_by, banned_by_username, reason, banned_until)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (telegram_id) 
         DO UPDATE SET 
           username = $2,
           banned_by = $3,
           banned_by_username = $4,
           reason = $5,
           banned_until = $6,
           created_at = NOW()`,
        [
          telegramId.toString(),
          `@${username}`,
          actorTelegramId,
          actorUsername,
          'Pago falso detectado',
          bannedUntil
        ]
      );

      // Notificar al usuario baneado
      try {
        await ctx.telegram.sendMessage(
          telegramId,
          `🚫 *Has sido baneado*\n\n` +
          `Razón: Pago falso detectado\n` +
          `Baneado por: ${ctx.from.username ? `@${ctx.from.username}` : 'Administrador'}\n` +
          `Duración: ${minutes} minutos\n` +
          `Desbaneo: ${bannedUntil.toLocaleString('es-AR')}\n\n` +
          `No podrás usar el bot hasta que expire el baneo.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Error notifying banned user:', error);
        // Continue anyway
      }

      await ctx.reply(
        `✅ Usuario @${username} baneado por ${minutes} minutos.\n\n` +
        `Desbaneo: ${bannedUntil.toLocaleString('es-AR')}`
      );

      // Log audit
      await auditLogger.log(
        actorUsername,
        'ban_user',
        { bannedUser: username, minutes, telegramId }
      );
    } catch (error) {
      console.error('Error in /banear:', error);
      await ctx.reply('❌ Error al banear usuario.');
    }
  },

  async noticia(ctx) {
     try {
       const adminContext = await ensureAdminPermission(ctx, 'broadcast');
       if (!adminContext) {
         return;
       }
 
       // Verificar que está en un grupo de órdenes o en privado
       const chatType = ctx.chat.type;
       const isGroup = chatType === 'group' || chatType === 'supergroup';
      const isPrivate = chatType === 'private';

       stateManager.setState(ctx.from.id, 'admin_sending_noticia');
     } catch (error) {
       console.error('Error in /noticia:', error);
       await ctx.reply('❌ Error al ejecutar el comando.');
     }
  },

  async resumen(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'processPayments');
      if (!adminContext) {
        return;
      }

      const message = await dailySummaryService.generateSummary();
      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error in /resumen:', error);
      await ctx.reply('❌ Error al generar resumen.');
    }
  },

  async userInfo(ctx) {
    try {
      const adminContext = await ensureAdminPermission(ctx, 'manageUsers');
      if (!adminContext) {
        return;
      }

      const messageText = ctx.message.text || '';
      const parts = messageText.trim().split(/\s+/);

      if (parts.length < 2) {
        await ctx.reply('❌ Uso: /info <@usuario | ID>');
        return;
      }

      const target = parts[1];
      let userRow = null;

      if (target.startsWith('@')) {
        const username = target.slice(1).toLowerCase();
        const result = await pool.query(
          'SELECT id, telegram_id, username, saldo_usdt, created_at FROM users WHERE LOWER(username) = $1',
          [username]
        );
        if (result.rows.length > 0) {
          userRow = result.rows[0];
        }
      } else if (/^\d+$/.test(target)) {
        const result = await pool.query(
          'SELECT id, telegram_id, username, saldo_usdt, created_at FROM users WHERE telegram_id = $1',
          [target]
        );
        if (result.rows.length > 0) {
          userRow = result.rows[0];
        }
      }

      if (!userRow) {
        await ctx.reply('❌ Usuario no encontrado.');
        return;
      }

      const lines = [
        '🧾 *Información de usuario*',
        '',
        `🆔 *ID interno:* ${userRow.id}`,
        `👤 *Telegram ID:* ${userRow.telegram_id}`,
        `📛 *Username:* ${userRow.username || 'sin_username'}`,
        `💰 *Saldo:* ${(parseFloat(userRow.saldo_usdt) || 0).toFixed(2)} USDT`,
        `📅 *Creado:* ${userRow.created_at ? new Date(userRow.created_at).toLocaleString('es-AR') : '—'}`
      ].join('\n');

      await ctx.replyWithMarkdown(lines);
    } catch (error) {
      console.error('Error in userInfo:', error);
      await ctx.reply('❌ Error al obtener información del usuario.');
    }
  }
};

module.exports = handlers;
