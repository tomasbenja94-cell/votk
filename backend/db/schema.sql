-- Binopolis Pay Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  saldo_usdt NUMERIC(18,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW(),
  notify_instant BOOLEAN DEFAULT true,
  notify_daily_summary BOOLEAN DEFAULT false,
  fee_percentage NUMERIC(5,2) DEFAULT 20,
  fee_min_amount_ars NUMERIC(18,2) DEFAULT 0
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('carga','pago','reembolso')),
  amount_usdt NUMERIC(18,2) NOT NULL,
  amount_ars NUMERIC(18,2),
  identifier TEXT,
  status TEXT CHECK (status IN ('pendiente','procesando','admitido','pagado','cancelado')) DEFAULT 'pendiente',
  admin_id INT,
  proof_image TEXT,
  motivo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  review_started_at TIMESTAMP,
  admitted_at TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  alerted_at TIMESTAMP
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  telegram_id BIGINT,
  role TEXT CHECK (role IN ('superadmin','operador','auditor')) DEFAULT 'superadmin',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Config table
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  event TEXT NOT NULL,
  secret TEXT,
  active BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_event ON webhooks(event);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_identifier ON transactions(identifier);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Insert default wallets
INSERT INTO wallets (label, network, address, active) VALUES
  ('BEP20 Principal', 'bep20', '0x009d4b9Aa21A320EEB130720FE4626b79671155E', true),
  ('TRC20 Principal', 'trc20', 'TCFeWDZgCZQxuveQUDEEpdq9TA31itHkdM', true)
ON CONFLICT DO NOTHING;

-- Insert default admins (only if not exists)
INSERT INTO admins (username, telegram_id, role)
SELECT '@pagoTODO25', NULL, 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE username = '@pagoTODO25');

INSERT INTO admins (username, telegram_id, role)
SELECT '@AnubisCcs', NULL, 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE username = '@AnubisCcs');

INSERT INTO admins (username, telegram_id, role)
SELECT '@AK3RRR', NULL, 'operador'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE username = '@AK3RRR');

-- Insert default config
INSERT INTO config (key, value) VALUES
  ('bot_token', '8516105760:AAHyl_-DdfpW-QLzCmLH6ZQzbnaQTwbxFsk'),
  ('bot_username', '@bor_tedt_bot'),
  ('admin_groups', '["https://t.me/+rjez71wbaYk4Yzdh","https://t.me/+2ZlTcRZIOkkwZjQx"]'),
  ('admins', '["@pagoTODO25","@AnubisCcs","@AK3RRR"]'),
  ('web_user', 'flipendo'),
  ('web_pass', 'fucker123'),
  ('admin_password_bot', 'Fucker123@'),
  ('security_question_q', '¿Qué es lo que más le gusta a Anubis?'),
  ('security_question_a', 'GAYS'),
  ('price_source', 'COINGECKO'),
  ('price_cache_seconds', '30'),
  ('pending_alert_minutes', '45'),
  ('daily_summary_hour', '20')
ON CONFLICT (key) DO NOTHING;

-- Bot messages table
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
  ('pagar_sin_saldo', '⚠️ Saldo insuficiente.\n\nSaldo disponible: {saldo} USDT\n\nAcredite fondos mediante /cargar para continuar.', 'Sin saldo para pagar', 'pagar'),
  ('pagar_saldo_insuficiente', '❌ Saldo insuficiente.\n\nNecesitas: {needed} USDT\nTienes: {have} USDT', 'Saldo insuficiente', 'pagar'),
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
