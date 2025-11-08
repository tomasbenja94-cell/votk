const axios = require('axios');
const crypto = require('crypto');
const pool = require('../db/connection');

async function fetchActiveWebhooks(event) {
  const result = await pool.query(
    `SELECT id, name, url, event, secret, active, headers
     FROM webhooks
     WHERE active = true
       AND (event = $1 OR event = $2)`,
    [event, '*']
  );
  return result.rows;
}

function buildHeaders(webhook, event, body) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Binopolis-Event': event,
    'X-Binopolis-Webhook-ID': webhook.id
  };

  if (webhook.secret) {
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');
    headers['X-Binopolis-Signature'] = signature;
  }

  if (webhook.headers && typeof webhook.headers === 'object') {
    Object.entries(webhook.headers).forEach(([key, value]) => {
      if (typeof value !== 'undefined' && value !== null) {
        headers[key] = String(value);
      }
    });
  }

  return headers;
}

async function emit(event, payload = {}) {
  try {
    const webhooks = await fetchActiveWebhooks(event);
    if (webhooks.length === 0) {
      return;
    }

    const envelope = {
      event,
      timestamp: new Date().toISOString(),
      data: payload
    };

    const body = JSON.stringify(envelope);

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        try {
          const headers = buildHeaders(webhook, event, body);
          await axios.post(webhook.url, envelope, { headers, timeout: 10000 });
          console.log(`🔔 Webhook enviado (#${webhook.id} - ${webhook.name}) para evento ${event}`);
        } catch (error) {
          console.error(`❌ Error enviando webhook (#${webhook.id} - ${webhook.name})`, error.message);
        }
      })
    );
  } catch (error) {
    console.error(`❌ Error procesando webhooks para evento ${event}:`, error.message);
  }
}

module.exports = {
  emit
};

