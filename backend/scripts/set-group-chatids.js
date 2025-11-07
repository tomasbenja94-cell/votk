const pool = require('../db/connection');

async function setGroupChatIds() {
  try {
    console.log('Configurando chat_ids de grupos...');

    // Grupo de órdenes
    const orderGroupLink = 'https://t.me/+2ZlTcRZIOkkwZjQx';
    const orderGroupChatId = '-1003137036379';

    // Grupo de transferencias
    const transferGroupLink = 'https://t.me/+rjez71wbaYk4Yzdh';
    const transferGroupChatId = '-1003161356870';

    // Guardar chat_id del grupo de órdenes
    await pool.query(
      `INSERT INTO config (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`group_chat_id_${orderGroupLink}`, orderGroupChatId]
    );
    console.log(`✅ Grupo de órdenes configurado: ${orderGroupLink} -> ${orderGroupChatId}`);

    // Guardar chat_id del grupo de transferencias
    await pool.query(
      `INSERT INTO config (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`group_chat_id_${transferGroupLink}`, transferGroupChatId]
    );
    console.log(`✅ Grupo de transferencias configurado: ${transferGroupLink} -> ${transferGroupChatId}`);

    console.log('\n✅ Chat_ids configurados correctamente!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setGroupChatIds();

