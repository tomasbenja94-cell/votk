const pool = require('../../db/connection');
const { isAdmin, getOrCreateUser, formatCurrency, formatARS } = require('../../utils/helpers');
const priceService = require('../../services/priceService');
const stateManager = require('../handlers/stateManager');
const auditLogger = require('../../services/auditLogger');
const messageService = require('../../services/messageService');
const notificationService = require('../services/notificationService');
const chatManager = require('../utils/chatManager');
const animationManager = require('../utils/animations');
const commandHandlers = require('../commands');
const config = require('../../config/default.json');

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
      
      // If already admin and no password provided, show menu
      if (isUserAdmin && parts.length === 1) {
        await handlers.showAdminMenu(ctx);
        return;
      }
      
      // Need password to authenticate
      if (parts.length < 2) {
        if (isUserAdmin) {
          // Shouldn't happen, but just in case
          await handlers.showAdminMenu(ctx);
        } else {
          await ctx.reply('❌ Uso: /admin <contraseña>\n\nEjemplo: /admin Fucker123@');
        }
        return;
      }

      const password = parts[1];
      
      if (password !== config.admin_password_bot) {
        await ctx.reply('❌ Contraseña incorrecta.');
        return;
      }

      // Password is correct - add/update user as admin
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
            'UPDATE admins SET telegram_id = $1 WHERE id = $2',
            [ctx.from.id.toString(), existingAdmin.id]
          );
          await ctx.reply(`✅ Autenticación exitosa. Actualizado como administrador.\n\nTu telegram_id: ${ctx.from.id}\nUsername: ${existingAdmin.username}`);
        } else {
          // Check by telegram_id
          const existingByTelegramId = await pool.query(
            'SELECT * FROM admins WHERE telegram_id = $1',
            [ctx.from.id.toString()]
          );
          
          if (existingByTelegramId.rows.length > 0) {
            // Update username if different
            await pool.query(
              'UPDATE admins SET username = $1 WHERE telegram_id = $2',
              [username || `user_${ctx.from.id}`, ctx.from.id.toString()]
            );
            await ctx.reply(`✅ Autenticación exitosa. Ya eres administrador.\n\nTu telegram_id: ${ctx.from.id}\nUsername: ${username || 'Sin username'}`);
          } else {
            // Create new admin (if username matches one in config or password is correct)
            const configAdmins = config.admins || [];
            const usernameMatches = normalizedUsername && configAdmins.some(admin => 
              admin.toLowerCase().replace('@', '') === normalizedUsername
            );
            
            if (usernameMatches || !normalizedUsername) {
              // Add as new admin
              await pool.query(
                'INSERT INTO admins (username, telegram_id) VALUES ($1, $2)',
                [username || `user_${ctx.from.id}`, ctx.from.id.toString()]
              );
              await ctx.reply(`✅ Autenticación exitosa. Registrado como administrador.\n\nTu telegram_id: ${ctx.from.id}\nUsername: ${username || 'Sin username'}`);
            } else {
              await ctx.reply('✅ Contraseña correcta, pero tu username no está en la lista de admins. Contacta al administrador principal.');
              return;
            }
          }
        }
        
        // Show admin menu
        await handlers.showAdminMenu(ctx);
      } catch (error) {
        console.error('Error adding/updating admin:', error);
        console.error('Error stack:', error.stack);
        // Even if there's an error, try to show menu if user is already admin
        try {
          const isAlreadyAdmin = await isAdmin(ctx.from.id, ctx.from.username);
          if (isAlreadyAdmin) {
            // Don't send the "Ya eres administrador" message, just show menu
            await handlers.showAdminMenu(ctx);
          } else {
            await ctx.reply('❌ Error al actualizar el registro. Por favor intenta nuevamente o contacta al administrador.');
          }
        } catch (checkError) {
          console.error('Error checking admin after error:', checkError);
          await ctx.reply('❌ Error. Por favor intenta nuevamente.');
        }
      }
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

  async showAdminMenu(ctx) {
    try {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Usuarios', callback_data: 'admin_users' }],
            [{ text: 'Wallets', callback_data: 'admin_wallets' }],
            [{ text: 'Estadísticas', callback_data: 'admin_stats' }],
            [{ text: 'Logs', callback_data: 'admin_logs' }]
          ]
        }
      };

      const message = '🔐 *Panel de Administración*\n\nSelecciona una opción:';
      
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in cargar:', error);
        await ctx.reply('❌ Error de conexión. Intenta nuevamente.');
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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
        `@${ctx.from.username}`,
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in cancelar:', error);
        await ctx.reply('❌ Error de conexión. Intenta nuevamente.');
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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
      
      await ctx.reply('📝 *Motivo de cancelación:*\n\nIngresa el motivo:', {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Error in cancelar:', error);
      await ctx.reply('❌ Error al iniciar cancelación.');
    }
  },

  async setGroupChatId(ctx) {
    try {
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in setGroupChatId:', error);
        await ctx.reply('❌ Error de conexión. Intenta nuevamente.');
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in handleCancelarMotivo:', error);
        await ctx.reply('❌ Error de conexión. Intenta nuevamente.');
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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

      // Refund balance if it was a payment
      if (transaction.type === 'pago') {
        await pool.query(
          'UPDATE users SET saldo_usdt = saldo_usdt + $1 WHERE id = $2',
          [transaction.amount_usdt, transaction.user_id]
        );
      }

      // Update transaction
      await pool.query(
        'UPDATE transactions SET status = $1, motivo = $2, updated_at = NOW() WHERE id = $3',
        ['cancelado', motivo, transactionId]
      );

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
      const isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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

      // Verificar que el usuario es admin
      const isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores pueden usar este comando.');
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
        await client.query(
          `INSERT INTO transactions (user_id, type, amount_usdt, status, motivo, admin_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
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
            `⚠️ *Saldo eliminado*\n\n` +
            `Se ha eliminado ${monto.toFixed(2)} USDT de tu cuenta.\n` +
            `Tu saldo actual: ${nuevoSaldo.toFixed(2)} USDT\n\n` +
            `Motivo: Saldo eliminado por administrador.`,
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in logs:', error);
        await ctx.reply('❌ Error de conexión. Intenta nuevamente.');
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin:', error);
        await ctx.answerCbQuery('❌ Error de conexión', true);
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.answerCbQuery('❌ Solo administradores', true);
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin:', error);
        await ctx.answerCbQuery('❌ Error de conexión', true);
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.answerCbQuery('❌ Solo administradores', true);
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin:', error);
        await ctx.answerCbQuery('❌ Error de conexión', true);
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.answerCbQuery('❌ Solo administradores', true);
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin:', error);
        await ctx.answerCbQuery('❌ Error de conexión', true);
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.answerCbQuery('❌ Solo administradores', true);
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
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in config:', error);
        await ctx.reply('❌ Error de conexión. Intenta nuevamente.');
        return;
      }
      
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo administradores.');
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
      const adminResult = await pool.query(
        'SELECT id FROM admins WHERE telegram_id = $1 OR username = $2 LIMIT 1',
        [ctx.from.id, ctx.from.username ? `@${ctx.from.username}` : null]
      );
      const adminId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;

      // Update status to 'admitido'
      await pool.query(
        'UPDATE transactions SET status = $1, admin_id = $2, updated_at = NOW() WHERE id = $3',
        ['admitido', adminId, transactionId]
      );

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
              `Hola ${userFirstName}!\n\n` +
              `Sistema de pagos y recargas USDT.\n\n` +
              `Selecciona una opción:`;

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
              `Hola ${userFirstName}!\n\n` +
              `Sistema de pagos y recargas USDT.\n\n` +
              `Selecciona una opción:`;

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
            `Hola ${userFirstName}!\n\n` +
            `Sistema de pagos y recargas USDT.\n\n` +
            `Selecciona una opción:`;

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
        await client.query(
          'UPDATE transactions SET status = $1, admin_id = $2, updated_at = NOW() WHERE id = $3',
          ['pagado', adminId, transactionId]
        );
        
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

      // Get user info for notifications
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [transaction.user_id]
      );
      const user = userResult.rows[0];

      // Get transaction details to check if it's multas (after status update, get fresh data)
      const txDetailsAfter = await pool.query(
        'SELECT * FROM transactions WHERE id = $1',
        [transactionId]
      );
      
      if (txDetailsAfter.rows.length === 0) {
        console.error('❌ Transaction not found after update!');
        await ctx.reply('❌ Error: Transacción no encontrada después de actualizar');
        return;
      }
      
      const txAfter = txDetailsAfter.rows[0];

      // IMMEDIATELY send confirmation message to client - DO THIS FIRST
      const bot = require('../bot').bot;
      const formatARS = require('../../utils/helpers').formatARS;
      const animationManager = require('../utils/animations');
      
      console.log(`[DEBUG handlePagoConfirm] IMMEDIATELY sending confirmation to user ${transaction.telegram_id} for transaction ${transactionId}`);
      
      // Get fresh transaction data for the message
      const txForMessage = await pool.query(
        'SELECT proof_image, amount_ars, amount_usdt, identifier, type FROM transactions WHERE id = $1',
        [transactionId]
      );
      
      if (txForMessage.rows.length === 0) {
        console.error('❌ Transaction not found after update!');
        await ctx.reply('❌ Error: Transacción no encontrada');
        return;
      }
      
      // Get service name from admin message or determine from transaction type
      let nombreServicio = 'Servicio';
      try {
        const adminMessageText = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption || '';
        // Try to extract service name from admin message
        const servicioMatch = adminMessageText.match(/📋 Servicio: (.+)/);
        if (servicioMatch) {
          nombreServicio = servicioMatch[1].trim();
        } else {
          // Determine from message type
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
        console.log('Could not extract service name, using default');
      }
      
      // Prepare confirmation message with ALL information
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
      
      const finalMessage = `*Pago Realizado!* ✅\n\n` +
        `Tu pago de *${nombreServicio}* fue pagado correctamente. ✅\n\n` +
        `*DATOS DE PAGO:*\n\n` +
        `*FECHA Y HORA:* ${fechaHora}\n` +
        `*MONTO DEL PAGO:* ${montoFormateado}\n` +
        `*TOTAL COBRADO:* ${amountUSDT.toFixed(0)} USDT\n\n` +
        `Muchas gracias por confiar!`;
      
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
          const simpleMessage = `✅ *Pago Realizado!*\n\n` +
            `Tu pago fue pagado correctamente.\n\n` +
            `Monto: ${montoFormateado}\n` +
            `Cobrado: ${simpleAmountUSDT.toFixed(0)} USDT\n\n` +
            `Muchas gracias!`;
          
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
          
          // Edit message to show PAGADO status
          const pagadoText = originalText.replace(/Estado:.*/i, `Estado: ✅ PAGADO por @${ctx.from.username || 'admin'}`);
          
          try {
            await ctx.editMessageText(
              pagadoText + '\n\n✅ *Pagado por @' + (ctx.from.username || 'admin') + '*',
              { parse_mode: 'Markdown' }
            );
          } catch (editTextError) {
            // If it's a photo message, try editing caption
            try {
              await ctx.editMessageCaption(
                pagadoText + '\n\n✅ *Pagado por @' + (ctx.from.username || 'admin') + '*',
                { parse_mode: 'Markdown' }
              );
            } catch (editCaptionError) {
              console.log('Could not edit message text or caption:', editCaptionError.message);
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
        await client.query(
          'UPDATE transactions SET status = $1, motivo = $2, updated_at = NOW() WHERE id = $3',
          ['cancelado', 'Cancelado por administrador', transactionId]
        );
        
        await client.query('COMMIT');
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
      console.log('📝 handleAdminActas called with text:', actasText?.substring(0, 100));
      
      if (!actasText || actasText.trim().length === 0) {
        await ctx.reply('❌ El texto no puede estar vacío. Por favor, ingresa el texto de las actas.');
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
        // Update transaction status to 'pagado' (pago exitoso)
        await pool.query(
          'UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['pagado', transactionId]
        );
        
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
            '✅ Orden enviada\n\nTu pago ha sido recibido.\nTe notificaremos cuando sea procesado.',
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
        
        const finalMessage = `*Pago Realizado!* ✅\n\n` +
          `Tu pago de *${nombreServicio}* fue pagado correctamente. ✅\n\n` +
          `*DATOS DE PAGO:*\n\n` +
          `*FECHA Y HORA:* ${fechaHora}\n` +
          `*MONTO DEL PAGO:* ${montoFormateado}\n` +
          `*TOTAL COBRADO:* ${txForProgress.rows[0]?.amount_usdt.toFixed(0) || '0'} USDT\n\n` +
          `Muchas gracias por confiar!`;
        
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
      // Check admin with better error handling
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in handleCargarConfirmOrder:', error);
      }
      
      if (!isUserAdmin) {
        console.log(`Acceso denegado: User ${ctx.from.id} (@${ctx.from.username || 'sin_username'}) no es admin`);
        await ctx.answerCbQuery('❌ Solo administradores', true);
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
        await client.query(
          'UPDATE transactions SET status = $1, admin_id = $2, updated_at = NOW() WHERE id = $3',
          ['pagado', adminId, transactionId]
        );

        await client.query('COMMIT');
        
        console.log(`✅ Balance updated: User ${transaction.user_id} +${transaction.amount_usdt} USDT`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      await auditLogger.log(
        `@${ctx.from.username || 'admin'}`,
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
        await ctx.editMessageCaption(
          originalText + '\n\n✅ *Acreditado por @' + (ctx.from.username || 'admin') + '*',
          { parse_mode: 'Markdown' }
        ).catch(async () => {
          // Si es mensaje de texto, editar el texto
          await ctx.editMessageText(
            originalText + '\n\n✅ *Acreditado por @' + (ctx.from.username || 'admin') + '*',
            { parse_mode: 'Markdown' }
          );
        });
      } catch (error) {
        console.error('Error updating message:', error);
      }

      // Send photo to TRANSFER GROUPS (solo cuando se acepta)
      const transferGroups = config.transfer_groups || [];
      const transferMessageText = `📥 *Nueva transferencia recibida*\n\n` +
        `Monto: *${transaction.amount_usdt} USDT*\n` +
        `Usuario: @${transaction.username || 'sin_username'}\n` +
        `${transaction.identifier}\n` +
        `Transacción: #${transaction.id}`;

      // Get file_id from proof_image (formato: file_id|chat_id|message_id)
      const proofData = transaction.proof_image || '';
      const fileId = proofData.split('|')[0] || transaction.proof_image;

      for (const inviteLink of transferGroups) {
        try {
          const groupChatId = await groupManager.getGroupChatId(bot, inviteLink);
          
          if (groupChatId) {
            try {
              // Intentar sendPhoto con file_id
              await bot.telegram.sendPhoto(
                groupChatId,
                fileId,
                {
                  caption: transferMessageText,
                  parse_mode: 'Markdown'
                }
              );
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
      // Check admin with better error handling
      let isUserAdmin = false;
      try {
        isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      } catch (error) {
        console.error('Error checking admin in handleCargarRejectOrder:', error);
      }
      
      if (!isUserAdmin) {
        console.log(`Acceso denegado: User ${ctx.from.id} (@${ctx.from.username || 'sin_username'}) no es admin`);
        await ctx.answerCbQuery('❌ Solo administradores', true);
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
      await pool.query(
        'UPDATE transactions SET status = $1, motivo = $2, admin_id = $3, updated_at = NOW() WHERE id = $4',
        ['cancelado', 'Rechazado por administrador', adminId, transactionId]
      );

      await auditLogger.log(
        `@${ctx.from.username || 'admin'}`,
        'carga_rechazada',
        { username: transaction.username, amount: transaction.amount_usdt, transactionId }
      );

      // Notify user
      const bot = require('../bot').bot;
      await notificationService.notifyUser(bot, transaction.telegram_id, 'pago_cancelado', {
        motivo: 'Tu comprobante fue rechazado por un administrador. Por favor verifica y vuelve a intentar.'
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

      // Verificar que el usuario es admin
      const isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo los administradores pueden usar este comando.');
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

      // Verificar que el usuario es admin
      const isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo los administradores pueden usar este comando.');
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

  async banear(ctx) {
    try {
      // Verificar que el usuario es admin
      const isUserAdmin = await isAdmin(ctx.from.id, ctx.from.username);
      if (!isUserAdmin) {
        await ctx.reply('❌ Solo los administradores pueden usar este comando.');
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
          ctx.from.id.toString(),
          ctx.from.username ? `@${ctx.from.username}` : `user_${ctx.from.id}`,
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
        ctx.from.username || `user_${ctx.from.id}`,
        'ban_user',
        { bannedUser: username, minutes, telegramId }
      );
    } catch (error) {
      console.error('Error in /banear:', error);
      await ctx.reply('❌ Error al banear usuario.');
    }
  }
};

module.exports = handlers;
