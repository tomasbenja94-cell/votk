const pool = require('../db/connection');

async function setGroupChatIds() {
  try {
    console.log('Configurando chat_ids de grupos...');

    // Grupo de órdenes 1
    const orderGroupLink1 = 'https://t.me/+2ZlTcRZIOkkwZjQx';
    const orderGroupChatId1 = '-1003137036379';

    // Grupo de órdenes 2 (también para comprobantes)
    const orderGroupLink2 = 'https://t.me/+rjez71wbaYk4Yzdh';
    const orderGroupChatId2 = '-1003161356870';

    // Guardar chat_id del grupo de órdenes 1
    await pool.query(
      `INSERT INTO config (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`group_chat_id_${orderGroupLink1}`, orderGroupChatId1]
    );
    console.log(`✅ Grupo de órdenes 1 configurado: ${orderGroupLink1} -> ${orderGroupChatId1}`);

    // Guardar chat_id del grupo de órdenes 2 (también para comprobantes)
    await pool.query(
      `INSERT INTO config (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`group_chat_id_${orderGroupLink2}`, orderGroupChatId2]
    );
    console.log(`✅ Grupo de órdenes 2 configurado: ${orderGroupLink2} -> ${orderGroupChatId2}`);

    console.log('\n✅ Chat_ids configurados correctamente!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setGroupChatIds();

