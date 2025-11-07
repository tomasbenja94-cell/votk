const pool = require('../db/connection');
const fs = require('fs');
const path = require('path');

// Todos los mensajes que deben ser editables desde el panel web
const allMessages = [
  // Comandos principales
  {
    key: 'welcome',
    message: '🤖 *Bienvenido a Binopolis Pay*\n\nEstimado/a {first_name},\n\nGracias por utilizar nuestro sistema integral de pagos corporativos. Seleccione la opción que desea gestionar a continuación:',
    description: 'Mensaje de bienvenida (/start)',
    category: 'commands'
  },
  {
    key: 'saldo_loading',
    message: '[⏳] Procesando consulta de saldo...',
    description: 'Mensaje de carga al consultar saldo',
    category: 'commands'
  },
  {
    key: 'saldo_result',
    message: '💰 *Saldo disponible para operar*\n\nMonto: *{saldo} USDT*\n\nSeleccione "Menú principal" para regresar.',
    description: 'Resultado de consulta de saldo',
    category: 'commands'
  },
  {
    key: 'cargar_prompt',
    message: '🪙 *Solicitud de acreditación de saldo*\n\nIngrese el monto en USDT que desea acreditar.\n\nSeleccione "Menú principal" para cancelar el proceso.',
    description: 'Solicita monto para cargar',
    category: 'cargar'
  },
  {
    key: 'cargar_wallets_show',
    message: '✅ *Solicitud registrada*\n\nMonto requerido: *{amount} USDT*\nIdentificador interno: {identifier}\n\nPor favor transfiera exactamente {amount} USDT a cualquiera de las billeteras habilitadas:\n\n{wallets}\n\n⚠️ Confirme únicamente cuando la transferencia haya sido ejecutada.',
    description: 'Muestra wallets para cargar',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_prompt',
    message: '📎 *Comprobante de transferencia*\n\nAdjunte una imagen nítida del comprobante que respalde la operación.\n\nSeleccione "Menú principal" para cancelar.',
    description: 'Solicita comprobante',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_processing',
    message: '⏳ Verificando el comprobante recibido...',
    description: 'Procesando comprobante',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_received',
    message: '✅ *Comprobante recibido correctamente*\n\nNuestro equipo verificará la información y notificará la acreditación a la brevedad.',
    description: 'Confirmación de comprobante recibido',
    category: 'cargar'
  },
  {
    key: 'cargar_cancel',
    message: '🔄 *Operación cancelada*\n\nNo se registraron movimientos sobre su cuenta.\n\nSeleccione "Menú principal" para continuar.',
    description: 'Carga cancelada',
    category: 'cargar'
  },
  {
    key: 'cargar_no_info',
    message: '⚠️ No se identificó una solicitud de acreditación activa. Inicie nuevamente el proceso mediante /cargar.',
    description: 'Error al no encontrar información de carga',
    category: 'cargar'
  },
  {
    key: 'cargar_no_save',
    message: '⚠️ No fue posible registrar la información ingresada. Inicie nuevamente el proceso mediante /cargar.',
    description: 'Error al guardar información',
    category: 'cargar'
  },
  {
    key: 'cargar_no_active',
    message: '⚠️ No se detecta una solicitud activa de acreditación. Inicie nuevamente el proceso mediante /cargar.',
    description: 'No hay solicitud activa',
    category: 'cargar'
  },
  {
    key: 'cargar_confirm_error',
    message: '⚠️ Se produjo un inconveniente al confirmar la operación. Inténtelo nuevamente.',
    description: 'Error al procesar confirmación',
    category: 'cargar'
  },
  {
    key: 'cargar_photo_error',
    message: '⚠️ No pudimos procesar el comprobante. Por favor intente adjuntarlo nuevamente.',
    description: 'Error al procesar foto',
    category: 'cargar'
  },
  // Pagos
  {
    key: 'pagar_multas_prompt',
    message: '🧾 *Pago de multas*\n\nIngrese el DNI del titular del trámite.\n\nSeleccione "Menú principal" para cancelar.',
    description: 'Solicita DNI para pagar multas',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_prompt',
    message: '🏦 *Macro / PlusPagos*\n\nIngrese los datos del servicio a abonar (código de barras, NIS, identificador de factura, etc.).\n\n⚠️ Solo se admiten operaciones correspondientes a las pasarelas Macro o PlusPagos.\n\nSeleccione "Menú principal" para cancelar.',
    description: 'Solicita servicio para pagar Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_tipo_prompt',
    message: '💸 *Seleccione la categoría de pago*',
    description: 'Menú de selección de tipo de pago',
    category: 'pagar'
  },
  {
    key: 'pagar_dni_prompt',
    message: '🧾 Ingrese el DNI del titular del servicio.',
    description: 'Solicita DNI',
    category: 'pagar'
  },
  {
    key: 'pagar_tramite_prompt',
    message: 'Indique el tipo de trámite o acta asociado.',
    description: 'Solicita tipo de trámite',
    category: 'pagar'
  },
  {
    key: 'pagar_patente_prompt',
    message: 'Ingrese la patente sin espacios ni guiones.',
    description: 'Solicita patente',
    category: 'pagar'
  },
  {
    key: 'pagar_monto_prompt',
    message: 'Ingrese el monto total en pesos argentinos (ARS).\n\nEjemplo: 500000,00',
    description: 'Solicita monto ARS',
    category: 'pagar'
  },
  {
    key: 'pagar_monto_processing',
    message: '⏳ Analizando la solicitud y calculando el importe correspondiente...',
    description: 'Procesando solicitud de pago',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_validating',
    message: '⏳ Validando la información del servicio en la pasarela seleccionada...',
    description: 'Validando pasarela Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_summary',
    message: '📋 *Resumen de la solicitud*\n\nServicio: *{servicio}*\nImporte en ARS: *{monto_ars}*\nEquivalente estimado: *{monto_usdt} USDT*\n\nSaldo disponible: *{saldo_actual} USDT*\nSaldo proyectado posterior al débito: *{saldo_despues} USDT*\n\n¿Desea confirmar la operación?',
    description: 'Resumen de pago Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_processing',
    message: '⏳ Enviando la solicitud a nuestro equipo operativo...',
    description: 'Procesando pago',
    category: 'pagar'
  },
  {
    key: 'pagar_sending',
    message: '⏳ Remitiendo la información para verificación.',
    description: 'Enviando pago a verificación',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_success',
    message: '✅ *Solicitud registrada correctamente*\n\nServicio: *{servicio}*\nImporte en ARS: *{monto_ars}*\nEquivalente debitado: *{monto_usdt} USDT*\nSaldo disponible: *{saldo_restante} USDT*\n\nEl equipo operativo confirmará el pago y recibirá una notificación cuando finalice.',
    description: 'Pago Macro/PlusPagos registrado exitosamente',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_cancel',
    message: '🔄 *Operación cancelada*\n\nNo se efectuaron débitos sobre su saldo.\n\nSeleccione "Menú principal" para continuar.',
    description: 'Pago Macro/PlusPagos cancelado',
    category: 'pagar'
  },
  {
    key: 'pagar_no_saldo',
    message: '⚠️ *Saldo insuficiente*\n\nSaldo disponible: {saldo} USDT.\nPor favor acredite fondos mediante /cargar antes de continuar.',
    description: 'Sin saldo para pagar',
    category: 'pagar'
  },
  // Admin
  {
    key: 'admin_menu',
    message: '🔐 *Panel de administración*\n\nSeleccione la opción que desea gestionar:',
    description: 'Menú de administración',
    category: 'admin'
  },
  {
    key: 'admin_auth_usage',
    message: 'Uso correcto: /admin <contraseña>\n\nEjemplo: /admin ClaveTemporal123',
    description: 'Uso del comando /admin',
    category: 'admin'
  },
  {
    key: 'admin_auth_success_update',
    message: '🔐 Autenticación verificada. Se actualizó su registro de administrador.\n\nID de Telegram: {telegram_id}\nUsuario: {username}',
    description: 'Autenticación admin exitosa (actualizado)',
    category: 'admin'
  },
  {
    key: 'admin_auth_success_exists',
    message: '🔐 Autenticación verificada. Su usuario ya cuenta con privilegios de administración.\n\nID de Telegram: {telegram_id}\nUsuario: {username}',
    description: 'Autenticación admin exitosa (ya existe)',
    category: 'admin'
  },
  {
    key: 'admin_auth_success_new',
    message: '🔐 Autenticación verificada. Se le ha otorgado acceso administrativo.\n\nID de Telegram: {telegram_id}\nUsuario: {username}',
    description: 'Autenticación admin exitosa (nuevo)',
    category: 'admin'
  },
  {
    key: 'admin_auth_password_correct_no_user',
    message: 'La contraseña ingresada es válida, pero su usuario no figura en la lista autorizada. Contacte al administrador principal.',
    description: 'Contraseña correcta pero usuario no en lista',
    category: 'admin'
  },
  {
    key: 'admin_auth_update_error',
    message: 'No fue posible actualizar su registro. Intente nuevamente o contacte al administrador responsable.',
    description: 'Error al actualizar registro admin',
    category: 'admin'
  },
  {
    key: 'admin_menu_error',
    message: 'Se produjo un inconveniente al mostrar el menú. Ejecute nuevamente /admin.',
    description: 'Error al mostrar menú admin',
    category: 'admin'
  },
  {
    key: 'admin_cargar_usage',
    message: 'Uso correcto: /cargar @usuario monto',
    description: 'Uso del comando /cargar admin',
    category: 'admin'
  },
  {
    key: 'admin_cargar_invalid_amount',
    message: 'El monto ingresado no es válido. Verifique la información e intente nuevamente.',
    description: 'Monto inválido en comando admin cargar',
    category: 'admin'
  },
  {
    key: 'admin_cargar_success',
    message: '✅ *Saldo acreditado correctamente*\n\nUsuario: @{username}\nMonto: {amount} USDT\nSaldo actualizado: {new_saldo} USDT',
    description: 'Saldo acreditado por admin',
    category: 'admin'
  },
  {
    key: 'admin_cargar_user_notify',
    message: '✅ *Acreditación confirmada*\n\nSe acreditaron {amount} USDT en su cuenta.\nSaldo disponible: {saldo} USDT.',
    description: 'Notificación de saldo acreditado',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_no_pending',
    message: 'No se registran transacciones pendientes para cancelar.',
    description: 'No hay transacciones pendientes',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_motivo_prompt',
    message: '📝 *Motivo de cancelación*\n\nIndique el motivo correspondiente para documentar la operación.',
    description: 'Solicita motivo de cancelación',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_success',
    message: '✅ La transacción fue cancelada. Motivo registrado: {motivo}',
    description: 'Cancelación exitosa',
    category: 'admin'
  },
  {
    key: 'admin_cancelar_user_notify',
    message: '⚠️ *Pago cancelado*\n\nMotivo informado: {motivo}\n\nEl monto fue reintegrado a su saldo virtual.',
    description: 'Notificación de cancelación',
    category: 'admin'
  },
  {
    key: 'admin_setgroupchatid_usage',
    message: 'Uso correcto: /setgroupchatid <link_de_invitación>\n\nEjemplo: /setgroupchatid https://t.me/+XXXXXXXX',
    description: 'Uso del comando /setgroupchatid',
    category: 'admin'
  },
  {
    key: 'admin_setgroupchatid_success',
    message: '✅ Chat vinculado correctamente\n\nGrupo: {title}\nChat ID: {chat_id}\nEnlace de invitación: {link}',
    description: 'Chat ID configurado exitosamente',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_usage',
    message: 'Uso correcto: `/eliminarsaldo <telegram_id> <monto>`\n\nEjemplo: `/eliminarsaldo 123456789 50.5`',
    description: 'Uso del comando /eliminarsaldo',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_invalid',
    message: 'El identificador o el monto ingresado no es válido. Recuerde que el monto debe ser mayor a 0.',
    description: 'ID o monto inválido',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_user_not_found',
    message: 'No se encontró un usuario asociado al ID {telegram_id}.',
    description: 'Usuario no encontrado para eliminar saldo',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_success',
    message: '✅ *Ajuste aplicado*\n\nUsuario: @{username} (ID: {telegram_id})\nMonto debitado: {monto} USDT\nSaldo previo: {saldo_anterior} USDT\nSaldo actual: {saldo_nuevo} USDT\nResponsable: @{admin_username}',
    description: 'Saldo eliminado exitosamente',
    category: 'admin'
  },
  {
    key: 'admin_eliminarsaldo_user_notify',
    message: '⚠️ *Ajuste sobre su saldo*\n\nSe debitaron {monto} USDT de su cuenta.\nSaldo disponible: {saldo_nuevo} USDT\nMotivo: Ajuste administrativo.',
    description: 'Notificación de saldo eliminado al usuario',
    category: 'admin'
  },
  {
    key: 'admin_denied',
    message: 'Acceso restringido a personal autorizado.',
    description: 'Acceso denegado',
    category: 'admin'
  },
  {
    key: 'admin_group_only',
    message: 'Este comando debe ejecutarse desde un grupo de administración.',
    description: 'Comando solo en grupos',
    category: 'admin'
  },
  {
    key: 'admin_group_not_configured',
    message: 'El grupo desde el que se ejecuta el comando no se encuentra autorizado.',
    description: 'Grupo no configurado',
    category: 'admin'
  },
  {
    key: 'admin_group_required',
    message: 'Este comando requiere ser ejecutado dentro de un grupo.',
    description: 'Comando requiere grupo',
    category: 'admin'
  },
  // Errores genéricos
  {
    key: 'error_register_detail',
    message: 'Se produjo un inconveniente al registrar al usuario.\n\nDetalle técnico: {detail}',
    description: 'Error al registrar usuario con detalle',
    category: 'errors'
  },
  {
    key: 'error_connection',
    message: 'No fue posible completar la operación por un inconveniente de conexión. Intente nuevamente.',
    description: 'Error de conexión',
    category: 'errors'
  },
  {
    key: 'error_cargar_balance',
    message: 'La acreditación no pudo completarse. Intente nuevamente o contacte al soporte.',
    description: 'Error al acreditar saldo',
    category: 'errors'
  },
  {
    key: 'error_cancelar',
    message: 'No fue posible cancelar la transacción solicitada. Intente nuevamente.',
    description: 'Error al cancelar',
    category: 'errors'
  },
  {
    key: 'error_setgroupchatid',
    message: 'No fue posible vincular el chat indicado. Verifique la información ingresada.',
    description: 'Error al configurar chat ID',
    category: 'errors'
  },
  {
    key: 'error_eliminarsaldo',
    message: 'No fue posible ajustar el saldo. Detalle: {error}',
    description: 'Error al eliminar saldo',
    category: 'errors'
  },
  {
    key: 'error_wallet',
    message: 'No fue posible obtener el listado de billeteras habilitadas.',
    description: 'Error al obtener wallets',
    category: 'errors'
  },
  {
    key: 'error_logs',
    message: 'No fue posible obtener el registro de auditoría solicitado.',
    description: 'Error al obtener logs',
    category: 'errors'
  },
  {
    key: 'error_config',
    message: 'No fue posible recuperar la configuración requerida.',
    description: 'Error al obtener configuración',
    category: 'errors'
  },
  {
    key: 'error_cancelar_not_found',
    message: 'No se identificó una transacción válida para cancelar.',
    description: 'Transacción no encontrada para cancelar',
    category: 'errors'
  },
  {
    key: 'error_cancelar_not_found_db',
    message: 'No se encontró la transacción indicada en la base de datos.',
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

