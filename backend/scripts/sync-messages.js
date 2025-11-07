const pool = require('../db/connection');

// Todos los mensajes actualizados del bot
const messages = [
  // Comandos principales
  {
    key: 'welcome',
    message: '💬 *Bienvenido* 👋\n\nSeleccioná una opción:',
    description: 'Mensaje de bienvenida (/start)',
    category: 'commands'
  },
  {
    key: 'saldo',
    message: '💼 *Tu saldo actual es:* {saldo} USDT',
    description: 'Mensaje de saldo (/saldo)',
    category: 'commands'
  },
  {
    key: 'historial_title',
    message: '📊 *Movimientos recientes:*',
    description: 'Título del historial',
    category: 'commands'
  },
  {
    key: 'historial_item',
    message: '🔹 {fecha} – {tipo} – {monto} USDT',
    description: 'Item del historial',
    category: 'commands'
  },
  
  // PAGAR
  {
    key: 'pagar_menu',
    message: '💰 *¿Qué deseas pagar?* 👇',
    description: 'Menú principal de pagos',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_menu',
    message: '📊 *PAGAR MULTAS*\n\nSeleccioná el tipo de multa que deseas pagar 👇',
    description: 'Menú de multas',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_pba',
    message: '[+] 💸 *MULTAS PBA*\n\n💭 Ingresá el DNI del cliente:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago multas PBA',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_entre_rios',
    message: '🚗 *MULTAS ENTRE RÍOS*\n\n🔸 Ingresá el nombre del servicio o entidad de pago:\n\nEjemplo: Municipalidad de Paraná, Dirección de Tránsito Corrientes, etc.\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago multas Entre Ríos',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_caba',
    message: '🚕 *MULTAS CABA*\n\n🚕 Ingresá la patente del vehículo:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago multas CABA',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_corrientes',
    message: '🚙 *MULTAS CORRIENTES*\n\n🔸 Ingresá el nombre del servicio o entidad de pago:\n\nEjemplo: Municipalidad de Paraná, Dirección de Tránsito Corrientes, etc.\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago multas Corrientes',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_santa_fe',
    message: '🚓 *MULTAS SANTA FE*\n\n🔸 Ingresá el nombre del servicio o entidad de pago:\n\nEjemplo: Municipalidad de Paraná, Dirección de Tránsito Corrientes, etc.\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago multas Santa Fe',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_otra',
    message: '📄 *PAGAR OTRA MULTA*\n\n🔸 Ingresá el nombre del servicio o entidad de pago:\n\nEjemplo: Municipalidad de Paraná, Dirección de Tránsito Corrientes, etc.\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago otra multa',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_servicio',
    message: '🔸 Ingresá el dato de pago (Patente, DNI, Código de barras o N° de acta):\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita dato de pago para multas',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_caba_patente',
    message: '💰 Ingresá el monto total de la multa en ARS:\n\n📝 *Formato:*\nEjemplo: `500000,00`\nSe interpreta como: *$ 500.000,00*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita monto para multa CABA',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_monto',
    message: '💰 Ingresá el monto total en ARS:\n\n📝 *Formato:*\nEjemplo: `500000,00`\nSe interpreta como: *$ 500.000,00*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita monto para multas',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_confirm',
    message: '✅ *Orden generada correctamente.*\n\n🕓 *Esperando confirmación del administrador...*',
    description: 'Confirmación de orden de multa',
    category: 'pagar'
  },
  
  // MACRO / PLUSPAGOS
  {
    key: 'pagar_macro_menu',
    message: '💳 *PAGAR MACRO / PLUSPAGOS*\n\n🏦 Ingresá el tipo de servicio (ejemplo: luz, agua, internet, etc.):\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago Macro/PlusPagos',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_codigo',
    message: '[+] 🔢 Código de pago registrado: {codigo}\n\n💰 Ingresá el monto total en ARS:\n\n📝 *Formato:*\nEjemplo: `500000,00`\nSe interpreta como: *$ 500.000,00*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita monto para Macro/PlusPagos (usa {codigo} o {servicio})',
    category: 'pagar'
  },
  {
    key: 'pagar_multas_confirm',
    message: '✅ *Orden generada correctamente.*\n\n*Dato de pago:* {dato_pago}\n\n💰 *Monto Multa ARS:* {monto_ars}\n💵 *Cobrado (USDT):* {monto_usdt}\n\n🕓 *Esperando confirmación del administrador...*',
    description: 'Confirmación de orden de multa (usa {dato_pago}, {monto_ars}, {monto_usdt})',
    category: 'pagar'
  },
  {
    key: 'pagar_macro_confirm',
    message: '✅ *Orden creada con éxito.*\n\n🕓 *En proceso de verificación.*\n\n⬅️ *Regresar al menú principal*',
    description: 'Confirmación de orden Macro/PlusPagos',
    category: 'pagar'
  },
  
  // RENTAS CÓRDOBA
  {
    key: 'pagar_rentas_menu',
    message: '🏠 *PAGAR RENTAS CÓRDOBA*\n\nSeleccioná el tipo de renta que deseas pagar 👇',
    description: 'Menú de rentas Córdoba',
    category: 'pagar'
  },
  {
    key: 'pagar_rentas_automotor',
    message: '🚗 *AUTOMOTOR*\n\n🚗 Ingresá la patente del vehículo:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago rentas automotor',
    category: 'pagar'
  },
  {
    key: 'pagar_rentas_inmobiliario',
    message: '🏠 *INMOBILIARIO*\n\n🏠 Ingresá el número de cuenta o régimen especial:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago rentas inmobiliario',
    category: 'pagar'
  },
  {
    key: 'pagar_rentas_ingresos',
    message: '📈 *INGRESOS BRUTOS*\n\n📈 Ingresá el número de inscripción:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago ingresos brutos',
    category: 'pagar'
  },
  {
    key: 'pagar_rentas_sellos',
    message: '📄 *SELLOS*\n\n📄 Ingresá el número de identificación del contrato:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago sellos',
    category: 'pagar'
  },
  {
    key: 'pagar_rentas_caminera',
    message: '🚓 *MULTAS DE CAMINERA*\n\n🚓 Ingresá CUIT, DNI, número de acta o patente:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago multas de caminera',
    category: 'pagar'
  },
  {
    key: 'pagar_rentas_monto',
    message: '💰 Ingresá el monto total en ARS:\n\n📝 *Formato:*\nEjemplo: `500000,00`\nSe interpreta como: *$ 500.000,00*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita monto para rentas',
    category: 'pagar'
  },
  
  // PAGAR OTRA COSA
  {
    key: 'pagar_otra_menu',
    message: '🧾 *PAGAR OTRA COSA*\n\n🔸 Ingresá el nombre del servicio o empresa (ej: Edesur, OSDE, ARBA, etc.):\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de pago otra cosa',
    category: 'pagar'
  },
  {
    key: 'pagar_otra_codigo',
    message: '🔢 Ingresá el código de pago, número de servicio o referencia:\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita código para otra cosa',
    category: 'pagar'
  },
  {
    key: 'pagar_otra_monto',
    message: '💰 Ingresá el monto total en ARS:\n\n📝 *Formato:*\nEjemplo: `500000,00`\nSe interpreta como: *$ 500.000,00*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita monto para otra cosa',
    category: 'pagar'
  },
  {
    key: 'pagar_otra_confirm',
    message: '✅ *Orden registrada con éxito.*\n\n🕓 *En proceso de verificación.*\n\n⬅️ *Regresar al menú principal*',
    description: 'Confirmación de orden otra cosa',
    category: 'pagar'
  },
  
  // CARGAR SALDO
  {
    key: 'cargar_menu',
    message: '💵 *CARGAR SALDO*\n\n💵 Ingresá el monto que deseas cargar:\n\n⬅️ *Regresar al menú principal*',
    description: 'Inicio de carga de saldo',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_prompt',
    message: '💵 *CARGAR SALDO*\n\n📎 Enviá el comprobante o captura del pago (OBLIGATORIO):\n\n🕓 *Enviando para revisión...*\n\n⬅️ *Regresar al menú principal*',
    description: 'Solicita comprobante de pago',
    category: 'cargar'
  },
  {
    key: 'cargar_proof_received',
    message: '✅ *Tu solicitud de carga fue enviada.*\n\n⌛ *Esperá la acreditación por parte del administrador.*\n\n⬅️ *Regresar al menú principal*',
    description: 'Confirmación de comprobante recibido',
    category: 'cargar'
  },
  
  // Errores y validaciones
  {
    key: 'error_no_balance',
    message: '❌ *No tienes saldo disponible*\n\nTu saldo actual: {saldo} USDT\n\nPrimero debes cargar saldo usando /cargar',
    description: 'Error: sin saldo disponible',
    category: 'errors'
  },
  {
    key: 'error_monto_invalido',
    message: '❌ Monto inválido. Por favor ingresa el monto en el formato: `500000,00`\n\nEjemplo: `500000,00` = $ 500.000,00',
    description: 'Error: monto inválido',
    category: 'errors'
  },
  {
    key: 'error_patente_invalida',
    message: '❌ La patente debe tener exactamente 6 caracteres.',
    description: 'Error: patente inválida',
    category: 'errors'
  },
  {
    key: 'error_generic',
    message: '❌ Ocurrió un error. Por favor intenta nuevamente.',
    description: 'Error genérico',
    category: 'errors'
  },
  {
    key: 'error_register',
    message: '❌ Error al registrar usuario. Intenta nuevamente.',
    description: 'Error al registrar usuario',
    category: 'errors'
  }
];

async function syncMessages() {
  try {
    console.log('🔄 Sincronizando mensajes del bot...');
    
    for (const msg of messages) {
      await pool.query(
        `INSERT INTO bot_messages (key, message, description, category, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (key) 
         DO UPDATE SET 
           message = EXCLUDED.message,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           updated_at = NOW()`,
        [msg.key, msg.message, msg.description, msg.category]
      );
      console.log(`✅ Sincronizado: ${msg.key}`);
    }
    
    console.log(`\n✅ Total de mensajes sincronizados: ${messages.length}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error sincronizando mensajes:', error);
    process.exit(1);
  }
}

syncMessages();

