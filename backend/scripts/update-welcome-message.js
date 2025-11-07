const pool = require('../db/connection');

async function updateWelcomeMessage() {
  try {
    const newMessage = `🤖 *Bienvenido a Binopolis Pay*\n\n` +
      `Estimado/a {first_name},\n\n` +
      `Somos su plataforma corporativa para gestionar pagos automatizados con activos digitales.\n\n` +
      `*Comandos disponibles:*\n` +
      `/pagar - Iniciar una solicitud de pago\n` +
      `/saldo - Consultar su saldo disponible\n` +
      `/cargar - Acreditar fondos en su cuenta`;

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

