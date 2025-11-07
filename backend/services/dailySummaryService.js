const cron = require('node-cron');
const pool = require('../db/connection');
const groupManager = require('../bot/utils/groupManager');

let scheduledTask = null;
let botInstance = null;

async function getSummaryHour() {
  try {
    const result = await pool.query("SELECT value FROM config WHERE key = 'daily_summary_hour'");
    const hour = parseInt(result.rows[0]?.value, 10);
    if (Number.isFinite(hour) && hour >= 0 && hour < 24) {
      return hour;
    }
  } catch (error) {
    console.error('Error fetching daily_summary_hour:', error.message);
  }
  return 20; // 20:00 por defecto
}

async function generateSummary() {
  const summaryQuery = `
    SELECT 
      COUNT(*) FILTER (WHERE type = 'pago' AND status = 'pagado') AS pagos_pagados,
      SUM(amount_usdt) FILTER (WHERE type = 'pago' AND status = 'pagado') AS total_pagos_usdt,
      COUNT(*) FILTER (WHERE type = 'pago' AND status IN ('pendiente','procesando')) AS pagos_pendientes,
      COUNT(*) FILTER (WHERE type = 'carga' AND status = 'pagado') AS cargas_acreditadas,
      SUM(amount_usdt) FILTER (WHERE type = 'carga' AND status = 'pagado') AS total_cargas_usdt,
      COUNT(*) FILTER (WHERE type = 'pago' AND status = 'cancelado') AS pagos_cancelados
    FROM transactions
    WHERE DATE(created_at) = CURRENT_DATE
  `;

  const topUsersQuery = `
    SELECT u.username, SUM(t.amount_usdt) AS total_usdt
    FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE DATE(t.created_at) = CURRENT_DATE
      AND t.status = 'pagado'
    GROUP BY u.username
    ORDER BY total_usdt DESC
    LIMIT 3
  `;

  const [summaryResult, topUsersResult] = await Promise.all([
    pool.query(summaryQuery),
    pool.query(topUsersQuery)
  ]);

  const summary = summaryResult.rows[0];

  const pagosPagados = parseInt(summary.pagos_pagados || 0, 10);
  const totalPagosUSDT = parseFloat(summary.total_pagos_usdt || 0).toFixed(2);
  const pagosPendientes = parseInt(summary.pagos_pendientes || 0, 10);
  const pagosCancelados = parseInt(summary.pagos_cancelados || 0, 10);
  const cargasAcreditadas = parseInt(summary.cargas_acreditadas || 0, 10);
  const totalCargasUSDT = parseFloat(summary.total_cargas_usdt || 0).toFixed(2);

  let topUsersText = '—';
  if (topUsersResult.rows.length > 0) {
    topUsersText = topUsersResult.rows
      .map((row, index) => `#${index + 1} @${row.username || 'sin_username'} · ${parseFloat(row.total_usdt || 0).toFixed(2)} USDT`)
      .join('\n');
  }

  const message = `📊 *Resumen diario - ${new Date().toLocaleDateString('es-AR')}*\n\n` +
    `• Pagos acreditados: *${pagosPagados}* (${totalPagosUSDT} USDT)\n` +
    `• Pagos pendientes/procesando: *${pagosPendientes}*\n` +
    `• Pagos cancelados: *${pagosCancelados}*\n` +
    `• Cargas acreditadas: *${cargasAcreditadas}* (${totalCargasUSDT} USDT)\n\n` +
    `🏅 *Top usuarios del día:*\n${topUsersText}`;

  return message;
}

async function sendSummaryToAdmins() {
  try {
    if (!botInstance || !botInstance.telegram) {
      console.warn('Bot instance not available for daily summary');
      return;
    }

    const message = await generateSummary();
    await groupManager.sendToAdminGroups(botInstance, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error sending daily summary:', error);
  }
}

async function start(bot) {
  botInstance = bot || botInstance;

  const hour = await getSummaryHour();
  const cronExpression = `0 ${hour} * * *`;

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(cronExpression, () => {
    sendSummaryToAdmins().catch((error) => {
      console.error('Daily summary cron error:', error);
    });
  }, {
    timezone: 'America/Argentina/Buenos_Aires'
  });

  console.log(`✅ DailySummaryService programado todos los días a las ${hour}:00 (America/Argentina/Buenos_Aires)`);
}

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  start,
  stop,
  generateSummary,
  sendSummaryToAdmins
};


