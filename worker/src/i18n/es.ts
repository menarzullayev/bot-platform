import type { Messages } from "./types";

export const es: Messages = {
  start:
    "👋 ¡Hola, {name}!\n\n" +
    "Soy <b>TezCalc</b>, una calculadora rápida dentro de Telegram. Envíame una expresión y te respondo al instante:\n\n" +
    "<code>12*(3+4)</code>\n<code>480 * 15%</code>\n<code>100 km to mi</code>\n<code>50 USD to EUR</code>\n\n" +
    "También funciono en modo inline y en cualquier chat. Más información: /help.",

  help:
    "<b>📖 Cómo usar TezCalc</b>\n\n" +
    "<b>Cálculos</b>\n" +
    "Solo envía una expresión:\n" +
    "<code>2+3*4</code> · <code>(15+5)/4</code> · <code>2^10</code>\n" +
    "Funciones: <code>sqrt(144)</code>, <code>sin(30)</code>, <code>ln(10)</code>, <code>abs(-5)</code>, <code>5!</code>. Constantes: <code>pi</code>, <code>e</code>.\n\n" +
    "<b>Porcentajes</b>\n" +
    "<code>480 * 15%</code> → 72\n" +
    "<code>200 + 10%</code> → 220\n" +
    "<code>80 - 25%</code> → 60\n\n" +
    "<b>Unidades y divisas</b>\n" +
    "<code>100 km to mi</code>, <code>72 kg to lb</code>, <code>30 C to F</code>\n" +
    "<code>50 USD to EUR</code>, <code>1000000 UZS to USD</code>\n" +
    "Más: /convert\n\n" +
    "<b>Finanzas</b>\n" +
    "Cuota de un préstamo: <code>/loan 50000 18 24</code> (importe, tasa anual en %, meses). Más: /loan\n\n" +
    "<b>Modo inline</b>\n" +
    "En cualquier chat escribe <code>@tezcalc_bot 480 * 15%</code> y elige el resultado para enviarlo.\n\n" +
    "<b>Modo invitado</b>\n" +
    "Menciona <code>@tezcalc_bot</code> seguido de una expresión en cualquier chat, incluso donde no me hayan añadido, y te responderé.\n\n" +
    "🧾 /vat · 🧠 /solve · /derive · /integrate (Pro) · 🧮 /widget · 📱 /app\n" +
    "⚙️ /settings · 🕘 /history · 🌐 /lang · ⭐ /pro",

  lang_menu_title: "🌐 Elige tu idioma",
  lang_changed: "✅ Idioma cambiado a español.",
  settings_title: "⚙️ <b>Ajustes</b>",
  settings_angle: "📐 Unidad de ángulo para trigonometría: grados (<code>deg</code>) o radianes (<code>rad</code>)",
  settings_digits: "🔢 Número de decimales en los resultados",
  btn_back: "↩️ Atrás",
  btn_cancel: "Cancelar",
  btn_delete: "🗑 Borrar mis datos",

  err_syntax: "⚠️ Error de sintaxis cerca de la posición {pos}. Revisa los paréntesis y los operadores.",
  err_div0: "⚠️ La división entre cero no está definida.",
  err_domain: "⚠️ Este valor está fuera del dominio de la función (por ejemplo, la raíz cuadrada de un número negativo o el logaritmo de cero).",
  err_overflow: "⚠️ El resultado es demasiado grande para mostrarlo.",
  err_unknown: "⚠️ No sé qué es «{name}». Revisa cómo está escrita la función, la unidad o la divisa.",
  err_too_long: "⚠️ La expresión es demasiado larga. Acórtala, por favor.",
  err_units_mismatch: "⚠️ Estas unidades no se pueden convertir entre sí (por ejemplo, longitud y masa).",
  err_no_rate: "⚠️ Ahora mismo no hay tipo de cambio disponible para {pair}. Inténtalo de nuevo más tarde.",
  err_generic: "⚠️ Algo salió mal. Inténtalo de nuevo.",
  rate_limited: "⏳ Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",

  history_title: "🕘 <b>Historial</b>",
  history_empty: "Tu historial está vacío. Los cálculos se guardan aquí cuando el historial está activado (Pro).",
  history_cleared: "🗑 Historial borrado.",

  fx_updated: "💱 Tipos de cambio actualizados: {date}",
  fx_stale: "⚠️ Los tipos de cambio están desactualizados (última actualización: {date}). El resultado puede ser inexacto.",

  pro_title: "⭐ <b>TezCalc Pro</b>",
  pro_features:
    "✅ Soluciones paso a paso\n" +
    "✅ Gráficas de funciones\n" +
    "✅ Historial sincronizado entre tus dispositivos\n" +
    "✅ Historial ilimitado\n" +
    "✅ Unidades y divisas avanzadas",
  pro_price: "💳 Precio: {stars} ⭐ Estrellas de Telegram cada 30 días. El pago lo gestiona Telegram y la suscripción se renueva automáticamente.",
  pro_active: "✅ Tu suscripción Pro está activa hasta el {date}.",
  pro_required: "🔒 Esta función forma parte de TezCalc Pro. Más información en /pro.",
  pro_thanks: "🎉 ¡Gracias! Pro ya está activo. Disfruta de las soluciones paso a paso, las gráficas y el historial ilimitado.",
  pro_already: "Ya tienes una suscripción Pro activa.",
  pro_cancel_info:
    "Para cancelar, abre Telegram → Ajustes → Mis estrellas → Suscripciones y cancela TezCalc Pro. " +
    "Seguirás con Pro hasta el final del periodo que ya has pagado.",

  privacy:
    "<b>🔒 Política de privacidad</b>\n\n" +
    "<b>Qué guardamos</b>\n" +
    "• Tu ID de Telegram, tu idioma y tus ajustes (unidad de ángulo, número de decimales).\n" +
    "• Tu historial de cálculos, solo si el historial está activado (Pro).\n" +
    "• Identificadores de pago (ID de pagos y suscripciones con Estrellas) para confirmar y atender tu suscripción Pro.\n\n" +
    "<b>Qué no hacemos</b>\n" +
    "• Las expresiones que envías se procesan solo para calcular la respuesta y no se guardan si el historial está desactivado.\n" +
    "• No vendemos tus datos, no los compartimos con terceros ni los usamos para publicidad. Los pagos los procesa Telegram; nunca vemos los datos de tu tarjeta.\n" +
    "• Los tipos de cambio se obtienen de una fuente pública; no se envía ningún dato personal tuyo.\n\n" +
    "<b>El control es tuyo</b>\n" +
    "Con /deleteme puedes borrar en cualquier momento tus ajustes, tu historial y los datos guardados.",

  terms:
    "<b>📄 Condiciones de uso</b>\n\n" +
    "1. TezCalc es una herramienta de cálculo. Los resultados se ofrecen «tal cual» y pueden contener errores; comprueba por tu cuenta las cifras importantes. Los tipos de cambio son orientativos y no constituyen asesoramiento financiero.\n" +
    "2. Pro es un servicio digital que se paga con Estrellas de Telegram. Es una suscripción de 30 días que se renueva automáticamente hasta que la canceles en Telegram.\n" +
    "3. Reembolsos y problemas de pago: consulta /paysupport.\n" +
    "4. No abuses del bot (spam, solicitudes masivas automatizadas, intentos de vulnerarlo). Podemos limitar o bloquear un uso abusivo.\n" +
    "5. El bot y estas condiciones pueden actualizarse. Si sigues usándolo, aceptas las condiciones vigentes.",

  paysupport:
    "<b>💬 Soporte de pagos</b>\n\n" +
    "¿Tienes un problema con un pago con Estrellas o quieres un reembolso? Responde a este mensaje y describe el problema. " +
    "Indica la fecha del pago y la cantidad de Estrellas.\n\n" +
    "Cada solicitud se revisa de forma individual. Las Estrellas reembolsadas vuelven a tu saldo de Telegram. " +
    "Para evitar cargos futuros, cancela la suscripción como se explica en /pro.",

  deleteme_confirm:
    "⚠️ Se borrarán de forma permanente tus ajustes, tu historial y los datos guardados. No se puede deshacer.\n\n" +
    "Una suscripción Pro activa no se cancela automáticamente. Cancélala antes en Telegram (consulta /pro). ¿Continuar?",
  deleteme_done: "✅ Tus datos se han borrado.",

  unknown_command: "Comando desconocido. Consulta /help para ver lo que puedo hacer.",

  inline_help_title: "Escribe una expresión",
  inline_help_desc: "Por ejemplo: 12*(3+4) o 100 km to mi",
  inline_result_desc: "Toca para enviar el resultado",
  guest_hint: "Consejo: menciona @tezcalc_bot y una expresión en cualquier chat, por ejemplo @tezcalc_bot 12*(3+4)",

  converter_help:
    "<b>🔄 Conversor</b>\n" +
    "Unidades y divisas en una sola línea:\n" +
    "<code>/convert 100 km mi</code>\n" +
    "<code>/convert 50 USD EUR</code>\n" +
    "O simplemente envía <code>100 km to mi</code>.\n\n" +
    "Compatible con: longitud, masa, volumen, temperatura, velocidad, superficie, tiempo, tamaño de datos y muchas divisas del mundo.",

  loan_help:
    "<b>🏦 Calculadora de préstamos</b>\n" +
    "<code>/loan importe tasa meses</code>\n" +
    "Ejemplo: <code>/loan 50000 18 24</code> es un préstamo de 50 000 al 18 % anual a 24 meses.\n\n" +
    "Te mostraré la cuota mensual, el total pagado y el total de intereses (cuotas mensuales iguales).",
  loan_label_monthly: "Cuota mensual",
  loan_label_total: "Total pagado",
  loan_label_interest: "Total de intereses",

  widget_open: "🧮 Abrir el widget",
  mini_open: "📱 Abrir la Mini App",

  cmd_start: "Iniciar el bot",
  cmd_help: "Cómo usar TezCalc",
  cmd_lang: "Cambiar el idioma",
  cmd_settings: "Ajustes",
  cmd_history: "Historial de cálculos",
  cmd_convert: "Convertir unidades y divisas",
  cmd_loan: "Calculadora de préstamos",
  cmd_pro: "Suscripción TezCalc Pro",
  cmd_privacy: "Política de privacidad",
  cmd_terms: "Condiciones de uso",
  cmd_paysupport: "Soporte de pagos y reembolsos",
  cmd_deleteme: "Borrar mis datos",

  bot_name: "TezCalc: Calculadora",
  bot_short_description: "Calculadora rápida: matemáticas, porcentajes, unidades, divisas y préstamos. Funciona inline y en cualquier chat.",
  bot_description:
    "TezCalc es una calculadora rápida dentro de Telegram. Envía una expresión y obtén la respuesta al instante. " +
    "Porcentajes, conversión de unidades y divisas, cuotas de préstamos. Funciona en el chat, en modo inline (@tezcalc_bot) y en cualquier grupo con el modo invitado. " +
    "Pro añade soluciones paso a paso, gráficas e historial sincronizado.",
  bot_about:
    "<b>🧮 TezCalc</b>\n\n" +
    "Una calculadora rápida y práctica para Telegram: cálculos de todos los días, porcentajes, conversión de unidades y divisas y cálculo de préstamos. " +
    "Úsala en este chat, en modo inline en cualquier conversación, en modo invitado o en la Mini App.\n\n" +
    "Gratis para el uso diario. TezCalc Pro (/pro) añade soluciones paso a paso, gráficas e historial sincronizado entre dispositivos.\n\n" +
    "/help · /privacy · /terms",

  // calc template (command handlers)
  not_math_hint: "🤔 Eso no parece un cálculo. Envía una expresión como <code>12*(3+4)</code> o <code>100 km to mi</code>. Más información: /help.",
  settings_history: "🕘 Guardar el historial de cálculos",
  btn_on: "Activado",
  btn_off: "Desactivado",
  loan_schedule_title: "📅 Primeros {n} meses",
  loan_row_legend: "mes. cuota = capital + intereses → saldo",
  vat_help: "<b>🧾 Calculadora de IVA</b>\n<code>/vat 1000000</code> — añade el 12% de IVA al importe.\n<code>/vat 1120000 remove</code> — extrae el IVA de un importe que ya lo incluye.\n<code>/vat 1000000 15</code> — otro tipo (en porcentaje).",
  vat_label_net: "Importe sin IVA",
  vat_label_vat: "IVA",
  vat_label_gross: "Importe con IVA",
  widget_unavailable: "⚠️ El widget solo se puede enviar en un chat privado con el bot y puede no estar disponible ahora.",
  symbolic_help: "<b>🧠 Soluciones paso a paso (Pro)</b>\n<code>/solve x^2-5x+6=0</code> — una ecuación o una expresión.\n<code>/derive x^3*sin(x)</code> — una derivada.\n<code>/integrate x*e^x</code> — una integral indefinida.",
  err_parse: "⚠️ No pude leer la expresión. Revisa los paréntesis y los operadores.",
  err_unsupported: "⚠️ Todavía no sé resolver este tipo de problema.",
  err_too_complex: "⚠️ Es demasiado complejo para un chat. Ábrelo en la Mini App.",
  deleteme_payments_note: "Los registros de pagos y tu periodo Pro se conservan: son necesarios para reembolsos y contabilidad.",
  cmd_vat: "Calculadora de IVA",
  cmd_solve: "Resolver paso a paso (Pro)",
  cmd_derive: "Derivada paso a paso (Pro)",
  cmd_integrate: "Integral paso a paso (Pro)",
  cmd_widget: "Widget de calculadora",
  cmd_app: "Abrir la Mini App",
};
