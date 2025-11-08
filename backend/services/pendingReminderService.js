const pool = require('../db/connection');
const groupManager = require('../bot/utils/groupManager');
const { escapeMarkdown } = require('../utils/helpers');

const CHECK_INTERVAL_MINUTES = 5;
const RE_ALERT_INTERVAL_MINUTES = 30;

let intervalId = null;
let botInstance = null;

async function getThresholdMinutes() {
  try {
    const result = await pool.query("SELECT value FROM config WHERE key = 'pending_alert_minutes'");
    const value = parseInt(result.rows[0]?.value, 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  } catch (error) {
    console.error('Error fetching pending_alert_minutes:', error.message);
  }
  return 45;
}

async function checkPendingTransactions() {
  try {
    const threshold = await getThresholdMinutes();

    const query = `
      SELECT t.id, t.type, t.amount_usdt, t.amount_ars, t.identifier, t.status, t.created_at,
             t.alerted_at, u.username
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.status IN ('pendiente','procesando')
        AND t.created_at <= NOW() - ($1 || ' minutes')::interval
        AND (t.alerted_at IS NULL OR t.alerted_at <= NOW() - ($2 || ' minutes')::interval)
      ORDER BY t.created_at ASC
      LIMIT 15
    `;

    const result = await pool.query(query, [threshold.toString(), RE_ALERT_INTERVAL_MINUTES.toString()]);

    if (result.rows.length === 0) {
      return;
    }

    const lines = result.rows.map((tx) => {
      const createdAt = escapeMarkdown(new Date(tx.created_at).toLocaleString('es-AR'));
      const tipo = escapeMarkdown(tx.type === 'carga' ? 'Carga de saldo' : 'Pago');
      const estado = escapeMarkdown(tx.status.toUpperCase());
      const monto = escapeMarkdown(`${parseFloat(tx.amount_usdt || 0).toFixed(2)} USDT`);
      const id = escapeMarkdown(tx.id);
      const username = escapeMarkdown(tx.username || 'sin_username');
      return `• #${id} – ${tipo} – Usuario: @${username}\n  Estado: ${estado} | Importe: ${monto}\n  Creado: ${createdAt}`;
    });

    const header = `⚠️ *Transacciones pendientes (${threshold} minutos o más)*\n\n`;
    const footer = '\nPor favor, priorizar estas operaciones. Confirme o cancele desde el panel o el bot.';
    const message = header + lines.join('\n\n') + footer;

    if (botInstance && botInstance.telegram) {
      await groupManager.sendToAdminGroups(botInstance, message, { parse_mode: 'Markdown' });
    }

    const ids = result.rows.map((tx) => tx.id);
    await pool.query(
      'UPDATE transactions SET alerted_at = NOW() WHERE id = ANY($1::int[])',
      [ids]
    );
  } catch (error) {
    console.error('Error checking pending transactions:', error);
  }
}

function start(bot) {
  botInstance = bot || botInstance;
  if (intervalId) {
    return;
  }

  const intervalMs = CHECK_INTERVAL_MINUTES * 60 * 1000;
  intervalId = setInterval(() => {
    checkPendingTransactions().catch((error) => {
      console.error('Pending reminder interval error:', error);
    });
  }, intervalMs);

  // Ejecutar una vez al inicio (en background)
  checkPendingTransactions().catch((error) => {
    console.error('Initial pending reminder error:', error);
  });
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  start,
  stop,
  checkPendingTransactions
};


