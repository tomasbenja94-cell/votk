const pool = require('../db/connection');
const fs = require('fs');
const path = require('path');

// Todos los mensajes que deben ser editables desde el panel web
const allMessages = [
  // Comandos principales
  {
    key: 'welcome',
    message: '🤖 *Bienvenido a Binopolis Pay*\n\nHola {first_name}!\n\nSistema de pagos y recargas USDT.\n\nSelecciona una opción:',
    description: 'Mensaje de bienvenida (/start)',
    category: 'commands'
  },
  {
    key: 'saldo_loading',
    message: '[+] Consultando saldo...',
    description: 'Mensaje de carga al consultar saldo',
    category: 'commands'
  },
  {
    key: 'saldo_result',
    message: '💰 *Tu saldo disponible*\n\n💵 {saldo} USDT\n\n⬅️ *Regresar al menú principal*',
    description: 'Resultado de consulta de saldo',
    category: 'commands'
  },
  {
    key: 'cargar_prompt',
    message: '[+] 💳 *Carga de Saldo*\n\nIngresá el monto en USDT 💰\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita monto para cargar',
    category: 'cargar'
  },
  {
    key: 'cargar_wallets_show',
    message: '✅ 💰 *Carga de Saldo*\n\nMonto: *{amount} USDT*\n{identifier}\n\n⚠️ *IMPORTANTE:*\nEnviá exactamente {amount} USDT a la wallet indicada.\n\nWallets disponibles:\n\n{wallets}\n⚠️ Confirmá solo después de haber enviado el dinero.',
    description: 'Muestra wallets para cargar',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_prompt',
    message: '[⏳] *Comprobante de Pago*\n\nPor favor enviá una foto del comprobante de transferencia:\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita comprobante',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_processing',
    message: '[+] Procesando comprobante...',
    description: 'Procesando comprobante',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_received',
    message: '✅ *Comprobante recibido*\n\nTu solicitud de carga ha sido registrada. Un administrador revisará tu comprobante y acreditará el saldo pronto.',
    description: 'Confirmación de comprobante recibido',
    category: 'cargar'
  },
  {
    key: 'cargar_cancel',
    message: '❌ *Operación cancelada*\n\nNo se realizaron movimientos.\n\n⬅️ *Regresar al menú principal*',
    description: 'Carga cancelada',
    category: 'cargar'
  },
  {
    key: 'cargar_no_info',
    message: '❌ Error: No se encontró información de la carga. Por favor inicia el proceso nuevamente con /cargar',
    description: 'Error al no encontrar información de carga',
    category: 'cargar'
  },
  {
    key: 'cargar_no_save',
    message: '❌ Error: No se pudo guardar la información. Por favor inicia el proceso nuevamente con /cargar',
    description: 'Error al guardar información',
    category: 'cargar'
  },
  {
    key: 'cargar_no_active',
    message: '❌ Error: No hay una solicitud de carga activa. Por favor inicia el proceso nuevamente con /cargar',
    description: 'No hay solicitud activa',
    category: 'cargar'
  },
  {
    key: 'cargar_confirm_error',
    message: '❌ Error al procesar confirmación.',
    description: 'Error al procesar confirmación',
    category: 'cargar'
  },
  {
    key: 'cargar_photo_error',
    message: '❌ Error al procesar comprobante. Intenta nuevamente.',
    description: 'Error al procesar foto',
    category: 'cargar'
  },
  // Pagos
  {
    key: 'pagar_multas_prompt',
    message: '[+] 💸 *Proceso de Pago - Multas*\n\n💭 Ingresá el DNI del cliente:\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita DNI para pagar multas',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_prompt',
    message: '💭 *¿Qué deseas pagar?*\n\n[+] Ingresá los datos del pago.\nSe aceptan: Códigos de barra, NIS, facturas o IDs de servicio.\n\n⚠️ *DEBE SER PASARELA MACRO O PLUSPAGOS, DE LO CONTRARIO SE CANCELARÁ*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita servicio para pagar Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_tipo_prompt',
    message: '💸 *Selecciona el tipo de pago:*\n\nElige una opción:',
    description: 'Menú de selección de tipo de pago',
    category: 'pagar'
  },
  {
    key: 'pagar_dni_prompt',
    message: '💸 *Proceso de Pago*\n\nIngresa el DNI del cliente:',
    description: 'Solicita DNI',
    category: 'pagar'
  },
  {
    key: 'pagar_tramite_prompt',
    message: 'Ingresa el tipo de trámite:',
    description: 'Solicita tipo de trámite',
    category: 'pagar'
  },
  {
    key: 'pagar_patente_prompt',
    message: 'Ingresa la patente:',
    description: 'Solicita patente',
    category: 'pagar'
  },
  {
    key: 'pagar_monto_prompt',
    message: 'Ingresa el monto en ARS:',
    description: 'Solicita monto ARS',
    category: 'pagar'
  },
  {
    key: 'pagar_monto_processing',
    message: '[+] Procesando tu solicitud...',
    description: 'Procesando solicitud de pago',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_validating',
    message: '[+] Validando pasarela...',
    description: 'Validando pasarela Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_summary',
    message: '📋 *Resumen del Pago*\n\nServicio: *{servicio}*\nMonto: *{monto_ars} ARS* ({monto_usdt} USDT)\n\nTu saldo actual: *{saldo_actual} USDT*\nSaldo después del pago: *{saldo_despues} USDT*\n\n¿Confirmas este pago?',
    description: 'Resumen de pago Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_processing',
    message: '[+] Procesando pago...',
    description: 'Procesando pago',
    category: 'pagar'
  },
  {
    key: 'pagar_sending',
    message: '[+] Enviando a verificación...',
    description: 'Enviando pago a verificación',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_success',
    message: '✅ *Pago registrado*\n\nServicio: *{servicio}*\nMonto: *{monto_ars} ARS* ({monto_usdt} USDT)\nTu saldo restante: *{saldo_restante} USDT*\n\nEl pago está siendo procesado.',
    description: 'Pago Macro/PlusPagos registrado exitosamente',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_cancel',
    message: '❌ *Operación cancelada*\n\nNo se realizaron movimientos.\n\n⬅️ *Regresar al menú principal*',
    description: 'Pago Macro/PlusPagos cancelado',
    category: 'pagar'
  },
  {
    key: 'pagar_no_saldo',
    message: '❌ *No tienes saldo disponible*\n\nTu saldo actual: {saldo} USDT\n\nPrimero debes cargar saldo usando /cargar',
    description: 'Sin saldo para pagar',
    category: 'pagar'
  },
  // Admin
  {
    key: 'admin_menu',
    message: '🔐 *Panel de Administración*\n\nSelecciona una opción:',
    description: 'Menú de administración',
    category: 'admin'
  },
  {
    key: 'admin_auth_usage',
    message: '❌ Uso: /admin <contraseña>\n\nEjemplo: /admin Fucker123@',
    description: 'Uso del comando /admin',
    category: 'admin'
  },
  {
    key: 'admin_auth_success_update',
    message: '✅ Autenticación exitosa. Actualizado como administrador.\n\nTu telegram_id: {telegram_id}\nUsername: {username}',
    description: 'Autenticación admin exitosa (actualizado)',
    category: 'admin'
  },
  {
    key: 'admin_auth_success_exists',
    message: '✅ Autenticación exitosa. Ya eres administrador.\n\nTu telegram_id: {telegram_id}\nUsername: {username}',
    description: 'Autenticación admin exitosa (ya existe)',
    category: 'admin'
  },
  {
    key: 'admin_auth_success_new',
    message: '✅ Autenticación exitosa. Registrado como administrador.\n\nTu telegram_id: {telegram_id}\nUsername: {username}',
    description: 'Autenticación admin exitosa (nuevo)',
    category: 'admin'
  },
  {
    key: 'admin_auth_password_correct_no_user',
    message: '✅ Contraseña correcta, pero tu username no está en la lista de admins. Contacta al administrador principal.',
    description: 'Contraseña correcta pero usuario no en lista',
    category: 'admin'
  },
  {
    key: 'admin_auth_update_error',
    message: '❌ Error al actualizar el registro. Por favor intenta nuevamente o contacta al administrador.',
    description: 'Error al actualizar registro admin',
    category: 'admin'
  },
  {
    key: 'admin_menu_error',
    message: 'Error al mostrar el menu. Por favor intenta usar /admin nuevamente.',
    description: 'Error al mostrar menú admin',
    category: 'admin'
  },
  {
    key: 'admin_cargar_usage',
    message: '❌ Uso: /cargar @usuario monto',
    description: 'Uso del comando /cargar admin',
    category: 'admin'
  },
  {
    key: 'admin_cargar_invalid_amount',
    message: '❌ Monto inválido.',
    description: 'Monto inválido en comando admin cargar',
    category: 'admin'
  },
  {
    key: 'admin_cargar_success',
    message: '✅ *Saldo acreditado*\n\nUsuario: @{username}\nMonto: {amount} USDT\nNuevo saldo: {new_saldo} USDT',
    description: 'Saldo acreditado por admin',
    category: 'admin'
  },
  {
    key: 'admin_cargar_user_notify',
    message: '✅ *Saldo acreditado*\n\nSe te han acreditado {amount} USDT.\nTu saldo actual: {saldo} USDT',
    description: 'Notificación de saldo acreditado',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_no_pending',
    message: '❌ No hay transacciones pendientes para cancelar.',
    description: 'No hay transacciones pendientes',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_motivo_prompt',
    message: '📝 *Motivo de cancelación:*\n\nIngresa el motivo:',
    description: 'Solicita motivo de cancelación',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_success',
    message: '✅ Transacción cancelada. Motivo: {motivo}',
    description: 'Cancelación exitosa',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_user_notify',
    message: '❌ *Pago cancelado*\n\nMotivo: {motivo}\n\n💸 El monto ha sido reembolsado a tu saldo virtual.',
    description: 'Notificación de cancelación',
    category: 'admin'
  },
  {
    key: 'admin_setgroupchatid_usage',
    message: '❌ Uso: /setgroupchatid <link_de_invitacion>\n\nEjemplo: /setgroupchatid https://t.me/+rjez71wbaYk4Yzdh',
    description: 'Uso del comando /setgroupchatid',
    category: 'admin'
  },
  {
    key: 'admin_setgroupchatid_success',
    message: '✅ Chat ID configurado correctamente\n\nGrupo: {title}\nChat ID: {chat_id}\nLink: {link}',
    description: 'Chat ID configurado exitosamente',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_usage',
    message: '❌ Uso: `/eliminarsaldo <telegram_id> <monto>`\n\nEjemplo: `/eliminarsaldo 123456789 50.5`',
    description: 'Uso del comando /eliminarsaldo',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_invalid',
    message: '❌ ID o monto inválido. El monto debe ser un número mayor a 0.',
    description: 'ID o monto inválido',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_user_not_found',
    message: '❌ Usuario con ID {telegram_id} no encontrado.',
    description: 'Usuario no encontrado para eliminar saldo',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_success',
    message: '✅ *Saldo eliminado*\n\nUsuario: @{username} (ID: {telegram_id})\nMonto eliminado: {monto} USDT\nSaldo anterior: {saldo_anterior} USDT\nSaldo nuevo: {saldo_nuevo} USDT\nPor: @{admin_username}',
    description: 'Saldo eliminado exitosamente',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_user_notify',
    message: '⚠️ *Saldo eliminado*\n\nSe ha eliminado {monto} USDT de tu cuenta.\nTu saldo actual: {saldo_nuevo} USDT\n\nMotivo: Saldo eliminado por administrador.',
    description: 'Notificación de saldo eliminado al usuario',
    category: 'admin'
  },
  {
    key: 'admin_denied',
    message: '❌ Solo administradores.',
    description: 'Acceso denegado',
    category: 'admin'
  },
  {
    key: 'admin_group_only',
    message: '❌ Este comando solo puede usarse en grupos de administración.',
    description: 'Comando solo en grupos',
    category: 'admin'
  },
  {
    key: 'admin_group_not_configured',
    message: '❌ Este comando solo puede usarse en grupos de administración configurados.',
    description: 'Grupo no configurado',
    category: 'admin'
  },
  {
    key: 'admin_group_required',
    message: '❌ Este comando debe usarse en un grupo.',
    description: 'Comando requiere grupo',
    category: 'admin'
  },
  // Errores genéricos
  {
    key: 'error_register_detail',
    message: '❌ Error al registrar usuario. Intenta nuevamente.\n\nDetalle: {detail}',
    description: 'Error al registrar usuario con detalle',
    category: 'errors'
  },
  {
    key: 'error_connection',
    message: '❌ Error de conexión. Intenta nuevamente.',
    description: 'Error de conexión',
    category: 'errors'
  },
  {
    key: 'error_cargar_balance',
    message: '❌ Error al acreditar saldo.',
    description: 'Error al acreditar saldo',
    category: 'errors'
  },
  {
    key: 'error_cancelar',
    message: '❌ Error al cancelar transacción.',
    description: 'Error al cancelar',
    category: 'errors'
  },
  {
    key: 'error_setgroupchatid',
    message: '❌ Error al configurar chat ID.',
    description: 'Error al configurar chat ID',
    category: 'errors'
  },
  {
    key: 'error_eliminarsaldo',
    message: '❌ Error al eliminar saldo: {error}',
    description: 'Error al eliminar saldo',
    category: 'errors'
  },
  {
    key: 'error_wallet',
    message: '❌ Error al obtener wallets.',
    description: 'Error al obtener wallets',
    category: 'errors'
  },
  {
    key: 'error_logs',
    message: '❌ Error al obtener logs.',
    description: 'Error al obtener logs',
    category: 'errors'
  },
  {
    key: 'error_config',
    message: '❌ Error al obtener configuración.',
    description: 'Error al obtener configuración',
    category: 'errors'
  },
  {
    key: 'error_cancelar_not_found',
    message: '❌ No se encontró transacción para cancelar.',
    description: 'Transacción no encontrada para cancelar',
    category: 'errors'
  },
  {
    key: 'error_cancelar_not_found_db',
    message: '❌ Transacción no encontrada.',
    description: 'Transacción no encontrada en DB',
    category: 'errors'
  }
];

async function addAllMessages() {
  try {
    await pool.connect();
    console.log('✅ Conectado a la base de datos');

    for (const msg of allMessages) {
      try {
        await pool.query(
          `INSERT INTO bot_messages (key, message, description, category)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (key) DO UPDATE 
           SET message = EXCLUDED.message,
               description = EXCLUDED.description,
               category = EXCLUDED.category,
               updated_at = NOW()`,
          [msg.key, msg.message, msg.description, msg.category]
        );
        console.log(`✅ Mensaje agregado/actualizado: ${msg.key}`);
      } catch (error) {
        console.error(`❌ Error al agregar mensaje ${msg.key}:`, error.message);
      }
    }

    console.log('\n✅ Todos los mensajes han sido agregados/actualizados');
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addAllMessages();

