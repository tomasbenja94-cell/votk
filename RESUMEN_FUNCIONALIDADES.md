# 📋 RESUMEN DE FUNCIONALIDADES - BINOPOLIS PAY

## 🤖 BOT DE TELEGRAM (@bor_tedt_bot)

### 🎯 Comandos Principales

#### `/start`
- Menú principal del bot
- Muestra opciones: PAGAR MULTAS, PAGAR MACRO/PLUS PAGOS, VER SALDO, CARGAR SALDO
- Limpia el historial del chat y muestra el menú con botones inline

#### `/saldo`
- Muestra el saldo disponible en USDT del usuario
- Incluye animación de carga
- Botón "Regresar" para volver al menú principal

#### `/cargar`
- Permite cargar saldo USDT a la cuenta
- Solicita el monto a cargar
- Genera un identificador único (ORDEN #XXXXXX)
- Muestra las wallets disponibles (BEP20 y TRC20)
- Solicita foto del comprobante de transferencia
- Envía la foto al grupo de administración para aprobación

#### `/pagar`
- Menú para seleccionar tipo de pago:
  - **PAGAR MULTAS**: Pago de multas PBA
  - **PAGAR MACRO / PLUS PAGOS**: Pago de servicios

#### `/movimientos`
- Muestra el historial de transacciones del usuario (últimas 50)
- Incluye: tipo de transacción, estado, monto, fecha, identificador y motivo
- Formato visual con emojis y colores

---

### 💸 FLUJO DE PAGO: MULTAS PBA

1. **DNI**: Ingresa DNI del titular (8 caracteres, numérico)
2. **Número de Trámite**: Ingresa número de trámite (11 caracteres)
3. **Sexo**: Ingresa M o F
4. **Patente**: Ingresa patente del vehículo (6 caracteres)
5. **Monto**: Ingresa monto en ARS (formato: `500000,00` = $500.000,00)
6. **Confirmación**: Muestra resumen con:
   - DNI, Sexo, Trámite, Patente
   - Monto en ARS
   - Monto en USDT (20% del monto ARS convertido a USDT)
   - Botones: ✅ Sí / ❌ No
7. **Espera de Aprobación**: Si confirma, muestra mensaje "Esperando aprobación desde administración..."
8. **Aprobación Admin**: 
   - Admin puede "Admitir" o "Rechazar"
   - Si admite: estado cambia a "ADMITIDO", mensaje se elimina del grupo
   - Admin puede "Pagar" cuando se procesa el pago
   - Al pagar: se muestra mensaje "ORDEN PAGADA" en el grupo
9. **Notificación al Usuario**: 
   - Si fue admitido: muestra "✅ Pago acreditado correctamente"
   - Barra de progreso de 10 segundos
   - Después: limpia el chat y muestra el menú principal
   - Guarda registro en `/movimientos`

---

### 🏦 FLUJO DE PAGO: MACRO / PLUS PAGOS

1. **Nombre del Servicio**: Ingresa el nombre del servicio (ej: "Macro", "PlusPagos")
2. **Número del Servicio**: Ingresa DNI/NIS/código de servicio (mínimo 4 caracteres)
3. **Nombre del Titular**: Ingresa nombre del titular (mínimo 2 caracteres)
4. **Monto**: Ingresa monto en ARS (formato: `500000,00` = $500.000,00)
5. **Confirmación**: Muestra resumen con:
   - Nombre del servicio
   - Número/DNI
   - Nombre del titular
   - Monto en ARS y USDT
   - Botones: ✅ Confirmar / ❌ Cancelar
6. **Procesamiento**: 
   - Deduce el saldo inmediatamente
   - Crea transacción en estado "procesando"
   - Envía notificación al grupo de administración
7. **Aprobación Admin**: 
   - Admin puede "✅ Pagado" o "❌ Cancelar"
   - Si cancela: se reembolsa el saldo al usuario
8. **Notificación**: Usuario recibe notificación del estado del pago

---

### 🪙 FLUJO DE CARGA DE SALDO

1. **Monto**: Usuario ingresa monto en USDT
2. **Identificador**: Sistema genera identificador único (ORDEN #XXXXXX)
3. **Wallets**: Muestra wallets disponibles (BEP20 y TRC20)
4. **Comprobante**: Usuario envía foto del comprobante de transferencia
5. **Envío al Grupo**: 
   - Foto se reenvía al grupo de "transferencias recibidas"
   - Notificación con botones se envía al grupo de "órdenes"
6. **Aprobación Admin**:
   - "✅ Acreditar saldo": Acredita el saldo, actualiza balance, envía foto a transferencias
   - "❌ Rechazar": Rechaza la orden, elimina foto y notifica al usuario

---

### ⚙️ COMANDOS ADMINISTRATIVOS

#### `/admin`
- Autenticación de administrador
- Requiere contraseña: `Fucker123@`
- Muestra menú administrativo con opciones:
  - 👥 Usuarios
  - 💰 Wallets
  - 📊 Estadísticas
  - 📝 Logs
  - ⬅️ Regresar

#### `/eliminarsaldo <telegram_id> <monto>`
- Solo disponible en el grupo de órdenes
- Resta saldo a un usuario específico
- Crea transacción tipo "reembolso"
- Notifica al usuario y al grupo

#### `/cancelar`
- Permite cancelar transacciones pendientes
- Solicita motivo de cancelación

#### `/wallet`
- Gestión de wallets para recargas

#### `/logs`
- Visualización de logs del sistema

#### `/config`
- Configuración del bot y sistema

---

### 🎨 CARACTERÍSTICAS VISUALES

- **Animaciones de Carga**: Barras de progreso con bloques `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓` y `▒▒▒▒▒▒▒▒▒▒▒▒`
- **Emojis y Símbolos**: Uso extensivo de emojis para mejor UX
- **Limpieza de Chat**: Mensajes se limpian automáticamente según el flujo
- **Botones Inline**: Navegación fluida con botones interactivos
- **Mensajes Editables**: Todos los mensajes del bot pueden editarse desde el panel web

---

## 🌐 PANEL WEB ADMINISTRATIVO

### 🔐 Autenticación
- **URL**: `http://localhost:3000`
- **Usuario**: `flipendo`
- **Contraseña**: `fucker123`

### 📊 Páginas Disponibles

#### **Dashboard**
- Estadísticas generales del sistema
- Total de usuarios
- Total de transacciones
- Transacciones pendientes
- Saldo total en el sistema
- Gráficos y métricas

#### **Usuarios**
- Lista editable de todos los usuarios
- Campos: Telegram ID, Username, Saldo USDT
- Edición en línea de saldos
- Búsqueda y filtrado

#### **Wallets**
- CRUD completo de wallets
- Tipos: BEP20, TRC20
- Direcciones de wallet
- Activar/desactivar wallets
- Orden de prioridad

#### **Configuración**
- Editar token del bot
- Configurar grupos de administración
- Gestionar administradores
- Cambiar contraseñas
- Configuración de precios

#### **Código Viewer**
- Visualización de código fuente
- Edición de archivos
- Backup automático antes de cambios
- Navegación por directorios
- Soporte para múltiples extensiones (.js, .jsx, .css, .json, etc.)

#### **Mensajes del Bot**
- Gestión centralizada de todos los mensajes del bot
- Edición en tiempo real
- Soporte para variables (reemplazo automático)
- Formato Markdown
- Actualización inmediata (sin reiniciar bot)

#### **Logs de Auditoría**
- Registro de todas las acciones administrativas
- Filtros por acción, actor, fecha
- Detalles de cada operación
- Exportación de logs

---

## 🔔 SISTEMA DE NOTIFICACIONES

### Notificaciones a Usuarios
- Pago aprobado
- Pago cancelado (con motivo)
- Carga de saldo confirmada
- Notificaciones de transacciones

### Notificaciones a Administradores
- Nuevas órdenes de pago
- Nuevas solicitudes de carga
- Cancelaciones y reembolsos
- Actualizaciones de estado

---

## 📱 GRUPOS DE TELEGRAM

### Grupo de Órdenes (`admin_groups`)
- Recibe notificaciones de nuevas órdenes
- Botones para aprobar/rechazar pagos
- Botones para acreditar/rechazar cargas
- Comando `/eliminarsaldo` disponible

### Grupo de Transferencias (`transfer_groups`)
- Recibe fotos de comprobantes aprobados
- Solo transferencias confirmadas
- Archivo histórico de transferencias

---

## 🔄 ESTADOS DE TRANSACCIONES

- **pendiente**: Orden creada, esperando aprobación
- **procesando**: Orden en proceso
- **admitido**: Orden admitida (solo multas)
- **pagado**: Pago completado
- **cancelado**: Pago cancelado

---

## ⏰ FUNCIONES AUTOMÁTICAS

### Auto-Cancelación
- Cancela automáticamente órdenes pendientes mayores a 24 horas
- Reembolsa saldo si corresponde
- Notifica al usuario
- Limpia mensajes del grupo

---

## 💾 BASE DE DATOS

### Tablas Principales
- **users**: Usuarios del sistema
- **transactions**: Transacciones (pagos, cargas, reembolsos)
- **wallets**: Wallets para recargas
- **admins**: Administradores del sistema
- **config**: Configuración del sistema
- **audit_logs**: Logs de auditoría
- **bot_messages**: Mensajes editables del bot
- **group_chat_ids**: IDs de grupos de Telegram

---

## 🔒 SEGURIDAD

- Autenticación JWT para panel web
- Contraseñas encriptadas
- Logs de auditoría de todas las acciones
- Validación de permisos de administrador
- Validación de datos de entrada
- Transacciones de base de datos para operaciones críticas

---

## 📝 FORMATOS Y VALIDACIONES

### Montos ARS
- Formato de entrada: `500000,00` o `500.000,00`
- Se interpreta como: `$500.000,00`
- Conversión automática a USDT según precio actual

### DNI
- 8 caracteres numéricos
- Validación de longitud

### Trámite
- 11 caracteres
- Validación de longitud

### Patente
- 6 caracteres
- Se convierte a mayúsculas
- Validación de longitud

---

## 🚀 COMANDOS DE DESARROLLO

### Backend
```bash
cd backend
npm start
```

### Frontend
```bash
cd frontend
npm start
```

### Inicializar Base de Datos
```bash
npm run init-db
```

---

## 📞 SOPORTE

Para más información o problemas, consultar los logs del sistema o contactar al administrador.

---

**Última actualización**: Noviembre 2025
**Versión**: 1.0

