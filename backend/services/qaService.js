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
    intent: 'pago_20_por_ciento',
    keywords: ['cobra', '20', 'porcentaje', 'fee', 'comision', 'cobran'],
    answer:
      'Los pagos se realizan en ARS y el bot descuenta automáticamente el *20%* del valor convertido a USDT. Este monto cubre el servicio y siempre se redondea al entero superior.'
  },
  {
    intent: 'como_cargar_saldo',
    keywords: ['cargar', 'saldo', 'recarga', 'deposito'],
    answer:
      'Para cargar saldo utilizá `/cargar`. El bot te pedirá el monto en USDT y luego deberás enviar el comprobante. Un administrador validará la carga y recibirás la confirmación por el bot.'
  },
  {
    intent: 'estado_pago',
    keywords: ['estado', 'pago', 'tarda', 'cuanto demora', 'demora', 'cuando confirman'],
    answer:
      'Las órdenes pasan por revisión manual. Cuando el administrador confirma el pago recibirás una notificación con todos los datos y el botón para volver al menú.'
  },
  {
    intent: 'contacto_admin',
    keywords: ['contactar', 'admin', 'ayuda', 'soporte'],
    answer:
      'Si necesitás ayuda personalizada escribí a los administradores por el canal habitual o respondé al mensaje del grupo de órdenes. También podés dejar tu consulta aquí y será derivada.'
  },
  {
    intent: 'comandos_principales',
    keywords: ['comandos', 'menu', 'opciones', 'funciones'],
    answer:
      'Comandos principales: `/pagar`, `/cargar`, `/saldo`, `/movimientos`, `/notificaciones`, `/preguntas`, `/me`. Copiá la pregunta sugerida o indicá el número que corresponde y recibirás la respuesta. Podés volver al menú usando el botón *MENU PRINCIPAL*.'
  },
  {
    intent: 'rentas_info',
    keywords: ['rentas', 'cordoba', 'impuesto', 'ingresos', 'automotor', 'inmobiliario'],
    answer:
      'En `/pagar` → Rentas Córdoba podés elegir Automotor, Inmobiliario, Ingresos Brutos, Sellos o Multas Caminera. El bot te pedirá los datos específicos y luego confirmará con el 20% correspondiente.'
  },
  {
    intent: 'preguntas_info',
    keywords: ['preguntas', 'ia', 'centro', 'faq', 'consultas'],
    answer:
      'El comando `/preguntas` abre el centro de asistencia con IA. Copiá una de las preguntas sugeridas o escribí el número correspondiente y recibirás la respuesta basada en los datos del bot. Para salir, escribí `MENU` o usá el botón *MENU PRINCIPAL*.'
  },
  {
    intent: 'menu_principal',
    keywords: ['menu principal', 'volver', 'regresar', 'menu'],
    answer:
      'Para regresar al menú principal podés usar el botón *MENU PRINCIPAL* del teclado o escribir simplemente `MENU`.'
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

