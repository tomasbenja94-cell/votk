const pool = require('../db/connection');

async function updateWelcomeMessage() {
  try {
    const newMessage = `🤖 *Bienvenido a Binopolis Pay*\n\n` +
      `Hola {first_name}!\n\n` +
      `Sistema de pagos automaticos.\n\n` +
      `*Comandos disponibles:*\n` +
      `/pagar - Realizar un pago\n` +
      `/saldo - Ver tu saldo disponible\n` +
      `/cargar - Cargar saldo a tu cuenta`;

    await pool.query(
      `UPDATE bot_messages 
       SET message = $1, updated_at = NOW() 
       WHERE key = 'welcome'`,
      [newMessage]
    );

    console.log('✅ Mensaje de bienvenida actualizado en la base de datos');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando mensaje:', error);
    process.exit(1);
  }
}

updateWelcomeMessage();

