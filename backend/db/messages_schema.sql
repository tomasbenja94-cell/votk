-- Table for bot messages
CREATE TABLE IF NOT EXISTS bot_messages (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  message TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default messages
INSERT INTO bot_messages (key, message, description, category) VALUES
  ('welcome', '🤖 *Bienvenido a Binopolis Pay*\n\nHola {first_name}!\n\nSistema de pagos y recargas USDT.\n\n*Comandos disponibles:*\n/pagar - Realizar un pago\n/saldo - Ver tu saldo disponible\n/cargar - Cargar saldo a tu cuenta\n\nSelecciona una opción:', 'Mensaje de bienvenida (/start)', 'commands'),
  ('saldo', '💰 *Tu saldo disponible: {saldo} USDT*', 'Mensaje de saldo (/saldo)', 'commands'),
  ('cargar_amount_prompt', '💳 *Carga de Saldo*\n\nIngresa el monto en USDT que deseas cargar:', 'Solicita monto para cargar', 'cargar'),
  ('cargar_amount_invalid', '❌ Por favor ingresa un monto válido mayor a 0.', 'Monto inválido', 'cargar'),
  ('cargar_wallets', '💰 *Carga de Saldo*\n\nMonto: *{amount} USDT*\nIdentificador: *{identifier}*\n\n⚠️ *IMPORTANTE:*\nEnvíe exactamente {amount} USDT usando el identificador {identifier} como monto.\n\n*Wallets disponibles:*\n\n{wallets}\n\n⚠️ *Confirma solo después de haber enviado el dinero.*', 'Muestra wallets para cargar', 'cargar'),
  ('cargar_proof_prompt', '📸 *Comprobante de Pago*\n\nPor favor envía una foto del comprobante de transferencia:', 'Solicita comprobante', 'cargar'),
  ('cargar_proof_received', '✅ *Comprobante recibido*\n\nTu solicitud de carga ha sido registrada. Un administrador revisará tu comprobante y acreditará el saldo pronto.', 'Confirmación de comprobante recibido', 'cargar'),
  ('cargar_canceled', '❌ Carga cancelada.', 'Carga cancelada', 'cargar'),
  ('cargar_error', '❌ Error al procesar monto. Intenta nuevamente.', 'Error al procesar carga', 'cargar'),
  ('pagar_dni_prompt', '💸 *Proceso de Pago*\n\nIngresa el DNI del cliente:', 'Solicita DNI', 'pagar'),
  ('pagar_tramite_prompt', 'Ingresa el tipo de trámite:', 'Solicita tipo de trámite', 'pagar'),
  ('pagar_patente_prompt', 'Ingresa la patente:', 'Solicita patente', 'pagar'),
  ('pagar_monto_prompt', 'Ingresa el monto en ARS:', 'Solicita monto ARS', 'pagar'),
  ('pagar_monto_invalid', '❌ Por favor ingresa un monto válido mayor a 0.', 'Monto inválido en pago', 'pagar'),
  ('pagar_saldo_insuficiente', '❌ Saldo insuficiente.\n\nNecesitas: {needed} USDT\nTienes: {have} USDT', 'Saldo insuficiente', 'pagar'),
  ('pagar_registrado', '✅ *Pago registrado*\n\nMonto: ${monto} ARS ({amount_usdt} USDT)\nTu saldo restante: {saldo_restante} USDT\n\nEl pago está siendo procesado.', 'Pago registrado exitosamente', 'pagar'),
  ('pagar_error', '❌ Error al procesar pago. Intenta nuevamente.', 'Error al procesar pago', 'pagar'),
  ('admin_denied', '❌ Acceso denegado. Solo administradores.', 'Acceso denegado', 'admin'),
  ('admin_auth_success', '✅ Autenticación exitosa.', 'Autenticación admin exitosa', 'admin'),
  ('admin_auth_failed', '❌ Contraseña incorrecta.', 'Contraseña incorrecta', 'admin'),
  ('admin_cargar_success', '✅ Saldo acreditado\n\nUsuario: @{username}\nMonto: {amount} USDT\nNuevo saldo: {new_saldo} USDT', 'Saldo acreditado por admin', 'admin'),
  ('admin_cargar_user_notify', '✅ *Saldo acreditado*\n\nSe te han acreditado {amount} USDT.\nTu saldo actual: {saldo} USDT', 'Notificación de saldo acreditado', 'admin'),
  ('admin_cargar_user_not_found', '❌ Usuario no encontrado.', 'Usuario no encontrado', 'admin'),
  ('admin_cargar_invalid', '❌ Uso: /cargar @usuario monto', 'Uso incorrecto de comando', 'admin'),
  ('cancelar_motivo_prompt', '📝 *Motivo de cancelación:*\n\nIngresa el motivo:', 'Solicita motivo de cancelación', 'admin'),
  ('cancelar_success', '✅ Transacción cancelada. Motivo: {motivo}', 'Cancelación exitosa', 'admin'),
  ('cancelar_user_notify', '❌ *Pago cancelado*\n\nMotivo: {motivo}\n\n💸 El monto ha sido reembolsado a tu saldo virtual.', 'Notificación de cancelación', 'admin'),
  ('cancelar_no_pending', '❌ No hay transacciones pendientes para cancelar.', 'No hay transacciones pendientes', 'admin'),
  ('error_generic', '❌ Ocurrió un error. Por favor intenta nuevamente.', 'Error genérico', 'errors'),
  ('error_register', '❌ Error al registrar usuario. Intenta nuevamente.', 'Error al registrar usuario', 'errors')
ON CONFLICT (key) DO NOTHING;
