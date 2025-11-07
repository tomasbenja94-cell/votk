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
  ('welcome', '🤖 *Bienvenido a Binopolis Pay*\n\nEstimado/a {first_name},\n\nSomos su plataforma corporativa para gestionar pagos automatizados con activos digitales.\n\n*Comandos disponibles:*\n/pagar - Iniciar una solicitud de pago\n/saldo - Consultar su saldo disponible\n/cargar - Acreditar fondos en su cuenta', 'Mensaje de bienvenida (/start)', 'commands'),
  ('saldo', '💰 *Saldo disponible: {saldo} USDT*', 'Mensaje de saldo (/saldo)', 'commands'),
  ('cargar_amount_prompt', '🪙 *Solicitud de acreditación de saldo*\n\nIngrese el monto en USDT que desea acreditar.', 'Solicita monto para cargar', 'cargar'),
  ('cargar_amount_invalid', '⚠️ Ingrese un monto válido mayor a 0.', 'Monto inválido', 'cargar'),
  ('cargar_wallets', '💰 *Carga de Saldo*\n\nMonto: *{amount} USDT*\nIdentificador: *{identifier}*\n\n⚠️ *IMPORTANTE:*\nEnvíe exactamente {amount} USDT utilizando el identificador {identifier}.\n\n*Billeteras disponibles:*\n\n{wallets}\n\n⚠️ *Confirme únicamente cuando la transferencia haya sido ejecutada.*', 'Muestra wallets para cargar', 'cargar'),
  ('cargar_proof_prompt', '📎 *Comprobante de transferencia*\n\nAdjunte una imagen nítida del comprobante de la operación.', 'Solicita comprobante', 'cargar'),
  ('cargar_proof_received', '✅ *Comprobante recibido correctamente*\n\nVerificaremos la información y notificaremos la acreditación a la brevedad.', 'Confirmación de comprobante recibido', 'cargar'),
  ('cargar_canceled', '❌ Carga cancelada.', 'Carga cancelada', 'cargar'),
  ('cargar_error', '❌ Error al procesar monto. Intenta nuevamente.', 'Error al procesar carga', 'cargar'),
  ('pagar_dni_prompt', '💸 *Proceso de pago*\n\nIngrese el DNI del titular del servicio.', 'Solicita DNI', 'pagar'),
  ('pagar_tramite_prompt', 'Indique el tipo de trámite o acta asociado.', 'Solicita tipo de trámite', 'pagar'),
  ('pagar_patente_prompt', 'Ingrese la patente sin espacios ni guiones.', 'Solicita patente', 'pagar'),
  ('pagar_monto_prompt', 'Ingrese el monto total en pesos argentinos (ARS).', 'Solicita monto ARS', 'pagar'),
  ('pagar_monto_invalid', '⚠️ Ingrese un monto válido mayor a 0.', 'Monto inválido en pago', 'pagar'),
  ('pagar_saldo_insuficiente', '⚠️ Saldo insuficiente.\n\nNecesita: {needed} USDT\nDisponible: {have} USDT', 'Saldo insuficiente', 'pagar'),
  ('pagar_registrado', '✅ *Solicitud registrada*\n\nMonto: ${monto} ARS ({amount_usdt} USDT)\nSaldo restante: {saldo_restante} USDT\n\nLa operación se encuentra en revisión.', 'Pago registrado exitosamente', 'pagar'),
  ('pagar_error', '❌ Error al procesar pago. Intenta nuevamente.', 'Error al procesar pago', 'pagar'),
  ('admin_denied', '❌ Acceso denegado. Solo administradores.', 'Acceso denegado', 'admin'),
  ('admin_auth_success', '✅ Autenticación exitosa.', 'Autenticación admin exitosa', 'admin'),
  ('admin_auth_failed', '❌ Contraseña incorrecta.', 'Contraseña incorrecta', 'admin'),
  ('admin_cargar_success', '✅ Saldo acreditado\n\nUsuario: @{username}\nMonto: {amount} USDT\nNuevo saldo: {new_saldo} USDT', 'Saldo acreditado por admin', 'admin'),
  ('admin_cargar_user_notify', '✅ *Acreditación confirmada*\n\nSe acreditaron {amount} USDT en su cuenta.\nSaldo disponible: {saldo} USDT', 'Notificación de saldo acreditado', 'admin'),
  ('admin_cargar_user_not_found', '❌ Usuario no encontrado.', 'Usuario no encontrado', 'admin'),
  ('admin_cargar_invalid', '❌ Uso: /cargar @usuario monto', 'Uso incorrecto de comando', 'admin'),
  ('cancelar_motivo_prompt', '📝 *Motivo de cancelación*\n\nIngrese el motivo correspondiente.', 'Solicita motivo de cancelación', 'admin'),
  ('cancelar_success', '✅ Transacción cancelada. Motivo: {motivo}', 'Cancelación exitosa', 'admin'),
  ('cancelar_user_notify', '⚠️ *Pago cancelado*\n\nMotivo: {motivo}\n\n💸 El importe fue reintegrado a su saldo virtual.', 'Notificación de cancelación', 'admin'),
  ('cancelar_no_pending', '❌ No hay transacciones pendientes para cancelar.', 'No hay transacciones pendientes', 'admin'),
  ('error_generic', '❌ Ocurrió un error. Por favor intenta nuevamente.', 'Error genérico', 'errors'),
  ('error_register', '❌ Error al registrar usuario. Intenta nuevamente.', 'Error al registrar usuario', 'errors')
ON CONFLICT (key) DO NOTHING;
