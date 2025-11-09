const normalize = (text = '') =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const knowledgeBase = [
  {
    intent: 'pagar_detalle',
    keywords: ['pagar', 'flujo', 'categorias', 'menu pagar'],
    answer:
      'El comando `/pagar` abre cuatro categorías: Multas PBA, Macro/PlusPagos, Rentas Córdoba y Otros Servicios. Cada opción pide los datos necesarios (identificador, monto, referencia) y genera la orden descontando el 20% correspondiente.'
  },
  {
    intent: 'cargar_detalle',
    keywords: ['cargar', 'saldo', 'recarga', 'deposito'],
    answer:
      'Con `/cargar` ingresás el monto en USDT y enviás el comprobante. Los administradores verifican la transferencia; al aprobarla recibís la notificación y el saldo queda disponible en tu cuenta.'
  },
  {
    intent: 'saldo_detalle',
    keywords: ['saldo disponible', 'consultar saldo'],
    answer:
      'El comando `/saldo` muestra tu saldo actual en USDT y deja el botón para regresar al menú principal.'
  },
  {
    intent: 'movimientos_detalle',
    keywords: ['movimientos', 'historial', 'transacciones'],
    answer:
      '`/movimientos` lista hasta 50 operaciones recientes con su estado y cronología. Si necesitás ver solo las pagadas confirmadas, `/historial` resume las últimas acreditadas.'
  },
  {
    intent: 'notificaciones_detalle',
    keywords: ['notificaciones', 'avisos', 'alertas'],
    answer:
      'En `/notificaciones` podés activar avisos inmediatos, recibir un resumen diario o desactivar las alertas automáticas. Podés cambiar esta configuración cuando quieras.'
  },
  {
    intent: 'preguntas_info',
    keywords: ['preguntas', 'ia', 'centro', 'faq', 'consultas'],
    answer:
      'El comando `/preguntas` abre la asistencia inteligente. Copiá una de las preguntas sugeridas o escribí el número correspondiente para recibir la respuesta. Para salir, escribí `MENU` o usá el botón *MENU PRINCIPAL*.'
  },
  {
    intent: 'me_detalle',
    keywords: ['/me', 'datos usuario', 'id'],
    answer:
      'Con `/me` obtenés tu ID de Telegram, tu usuario y tu nombre registrado. Es útil cuando necesitás soporte o verificar tus datos en el sistema.'
  },
  {
    intent: 'rentas_detalle',
    keywords: ['rentas', 'cordoba', 'automotor', 'inmobiliario', 'ingresos brutos'],
    answer:
      'En `/pagar` → Rentas Córdoba tenés Automotor, Inmobiliario, Ingresos Brutos, Sellos y Multas de Caminera. Cada opción solicita los datos específicos antes de calcular el monto a pagar más el 20%.'
  },
  {
    intent: 'comision_detalle',
    keywords: ['comision', '20%', 'fee', 'redondeo'],
    answer:
      'La comisión es del 20% sobre el monto en USDT. El bot calcula el valor, lo redondea siempre hacia arriba al entero más cercano y lo descuenta automáticamente de tu saldo cuando confirmás el pago.'
  },
  {
    intent: 'comprobante_detalle',
    keywords: ['comprobante', 'validacion', 'acreditacion'],
    answer:
      'Cuando enviás el comprobante de una carga, el bot lo comparte con los administradores. Ellos validan la transferencia; al aprobarla recibís la notificación de saldo acreditado y el mensaje “Depósito confirmado con éxito”.'
  },
  {
    intent: 'contacto_admin',
    keywords: ['contactar', 'admin', 'soporte', 'ayuda'],
    answer:
      'Para hablar con un administrador respondé en el grupo interno de órdenes, usá los canales oficiales del servicio o dejá tu consulta en `/preguntas` para que sea derivada al equipo.'
  },
  {
    intent: 'menu_principal',
    keywords: ['menu principal', 'volver', 'regresar', 'menu'],
    answer:
      'Para regresar al menú principal escribí `MENU` o tocá el botón *MENU PRINCIPAL* del teclado del bot.'
  }
];

function scoreEntry(entry, questionTokens) {
  const entryTokens = entry.keywords.map(normalize);
  let score = 0;
  for (const token of questionTokens) {
    if (!token) continue;
    for (const keyword of entryTokens) {
      if (keyword && token.includes(keyword)) {
        score += keyword.length;
      }
    }
  }
  return score;
}

function getAnswer(question = '') {
  const normalizedQuestion = normalize(question);
  const tokens = normalizedQuestion.split(' ').filter(Boolean);

  let bestMatch = null;
  let bestScore = 0;

  for (const entry of knowledgeBase) {
    const score = scoreEntry(entry, tokens);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestScore > 0) {
    return bestMatch.answer;
  }

  return 'No tengo una respuesta exacta guardada para eso. Un administrador revisará tu consulta y te contactará a la brevedad.';
}

module.exports = {
  getAnswer
};

