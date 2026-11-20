import type { Messages } from "./types";

// Source language. Telegram HTML parse mode; `{name}` placeholders are substituted by t().
export const en: Messages = {
  start:
    "👋 Hi, {name}!\n\n" +
    "I'm <b>TezCalc</b>, a fast calculator right inside Telegram. Send me an expression and I'll answer instantly:\n\n" +
    "<code>12*(3+4)</code>\n<code>480 * 15%</code>\n<code>100 km to mi</code>\n<code>50 USD to EUR</code>\n\n" +
    "I also work inline and in any chat. See /help.",

  help:
    "<b>📖 How to use TezCalc</b>\n\n" +
    "<b>Calculations</b>\n" +
    "Just send an expression:\n" +
    "<code>2+3*4</code> · <code>(15+5)/4</code> · <code>2^10</code>\n" +
    "Functions: <code>sqrt(144)</code>, <code>sin(30)</code>, <code>ln(10)</code>, <code>abs(-5)</code>, <code>5!</code>. Constants: <code>pi</code>, <code>e</code>.\n\n" +
    "<b>Percentages</b>\n" +
    "<code>480 * 15%</code> → 72\n" +
    "<code>200 + 10%</code> → 220\n" +
    "<code>80 - 25%</code> → 60\n\n" +
    "<b>Units and currencies</b>\n" +
    "<code>100 km to mi</code>, <code>72 kg to lb</code>, <code>30 C to F</code>\n" +
    "<code>50 USD to EUR</code>, <code>1000000 UZS to USD</code>\n" +
    "More: /convert\n\n" +
    "<b>Finance</b>\n" +
    "Loan payment: <code>/loan 50000 18 24</code> (amount, yearly rate in %, months). More: /loan\n\n" +
    "<b>Inline mode</b>\n" +
    "In any chat type <code>@tezcalc_bot 480 * 15%</code> and pick the result to send it.\n\n" +
    "<b>Guest mode</b>\n" +
    "Mention <code>@tezcalc_bot</code> followed by an expression in any chat, even one I haven't been added to, and I'll reply with the answer.\n\n" +
    "🧾 /vat · 🧠 /solve · /derive · /integrate (Pro) · 🧮 /widget · 📱 /app\n" +
    "⚙️ /settings · 🎨 /style · 🕘 /history · 🌐 /lang · ⭐ /pro",

  lang_menu_title: "🌐 Choose your language",
  lang_changed: "✅ Language changed to English.",
  settings_title: "⚙️ <b>Settings</b>",
  settings_angle: "📐 Angle unit for trigonometry: degrees (<code>deg</code>) or radians (<code>rad</code>)",
  settings_digits: "🔢 Number of decimal places in results",
  btn_back: "↩️ Back",
  btn_cancel: "Cancel",
  btn_delete: "🗑 Delete my data",

  err_syntax: "⚠️ Syntax error near position {pos}. Check the brackets and operators.",
  err_div0: "⚠️ Division by zero is not defined.",
  err_domain: "⚠️ This value is outside the function's domain (for example, the square root of a negative number or ln of zero).",
  err_overflow: "⚠️ The result is too large to display.",
  err_unknown: "⚠️ I don't know what “{name}” is. Check the spelling of the function, unit or currency.",
  err_too_long: "⚠️ The expression is too long. Please shorten it.",
  err_units_mismatch: "⚠️ These units can't be converted into each other (for example, length and mass).",
  err_no_rate: "⚠️ No exchange rate is available for {pair} right now. Please try again later.",
  err_generic: "⚠️ Something went wrong. Please try again.",
  rate_limited: "⏳ Too many requests. Please wait a moment and try again.",

  history_title: "🕘 <b>History</b>",
  history_empty: "Your history is empty. Calculations are saved here when history is on (Pro).",
  history_cleared: "🗑 History cleared.",

  fx_updated: "💱 Rates updated: {date}",
  fx_stale: "⚠️ Exchange rates are out of date (last update: {date}). The result may be inaccurate.",

  pro_title: "⭐ <b>TezCalc Pro</b>",
  pro_features:
    "✅ Step-by-step solutions\n" +
    "✅ Graphs of functions\n" +
    "✅ History synced across your devices\n" +
    "✅ Unlimited history\n" +
    "✅ Advanced units and currencies",
  pro_price: "💳 Price: {stars} ⭐ Telegram Stars per 30 days. Billing is handled by Telegram and renews automatically.",
  pro_active: "✅ Your Pro subscription is active until {date}.",
  pro_required: "🔒 This feature is part of TezCalc Pro. Open /pro to learn more.",
  pro_thanks: "🎉 Thank you! Pro is now active. Enjoy step-by-step solutions, graphs and unlimited history.",
  pro_already: "You already have an active Pro subscription.",
  pro_cancel_info:
    "To cancel, open Telegram → Settings → My Stars → Subscriptions and cancel TezCalc Pro. " +
    "You keep Pro until the end of the period you have already paid for.",

  privacy:
    "<b>🔒 Privacy policy</b>\n\n" +
    "<b>What we store</b>\n" +
    "• Your Telegram ID, your language and your settings (angle unit, decimal places).\n" +
    "• Your calculation history, only if history is on (Pro).\n" +
    "• Payment identifiers (Stars payment and subscription IDs) so we can confirm and support your Pro subscription.\n\n" +
    "<b>What we don't do</b>\n" +
    "• Expressions you send are processed only to compute the answer and are not kept when history is off.\n" +
    "• We never sell your data and we don't share it with third parties or use it for advertising. Payments are processed by Telegram; we never see your card details.\n" +
    "• Exchange rates are loaded from a public rate source; none of your personal data is sent there.\n\n" +
    "<b>Your control</b>\n" +
    "Send /deleteme to delete your settings, history and stored data at any time.",

  terms:
    "<b>📄 Terms of use</b>\n\n" +
    "1. TezCalc is a calculation tool. Results are provided as is and may contain errors; check important numbers yourself. Exchange rates are indicative and are not financial advice.\n" +
    "2. Pro is a digital service paid with Telegram Stars. It is a 30-day subscription that renews automatically until you cancel it in Telegram.\n" +
    "3. Refunds and payment problems: see /paysupport.\n" +
    "4. Don't abuse the bot (flooding, automated mass requests, attempts to break it). We may limit or block abusive use.\n" +
    "5. We may update the bot and these terms. Continued use means you accept the current terms.",

  paysupport:
    "<b>💬 Payment support</b>\n\n" +
    "Having a problem with a Stars payment or want a refund? Write to the contact below and describe the issue. " +
    "Please include the payment date and the number of Stars.\n\n" +
    "Each request is reviewed individually. Refunded Stars return to your Telegram balance. " +
    "To stop future charges, cancel the subscription as described in /pro.",

  deleteme_confirm:
    "⚠️ This will permanently delete your settings, history and stored data. It cannot be undone.\n\n" +
    "An active Pro subscription is not cancelled automatically. Cancel it first in Telegram (see /pro). Continue?",
  deleteme_done: "✅ Your data has been deleted.",

  unknown_command: "Unknown command. See /help for what I can do.",

  inline_help_title: "Type an expression",
  inline_help_desc: "For example: 12*(3+4) or 100 km to mi",
  inline_result_desc: "Tap to send the result",
  guest_hint: "Tip: mention @tezcalc_bot and an expression in any chat, for example @tezcalc_bot 12*(3+4)",

  converter_help:
    "<b>🔄 Converter</b>\n" +
    "Units and currencies in one line:\n" +
    "<code>/convert 100 km mi</code>\n" +
    "<code>/convert 50 USD EUR</code>\n" +
    "Or simply send <code>100 km to mi</code>.\n\n" +
    "Supported: length, mass, volume, temperature, speed, area, time, data size and many world currencies.",

  loan_help:
    "<b>🏦 Loan calculator</b>\n" +
    "<code>/loan amount rate months</code>\n" +
    "Example: <code>/loan 50000 18 24</code> is a loan of 50,000 at 18% per year for 24 months.\n\n" +
    "I'll show the monthly payment, the total paid and the total interest (equal monthly payments).",
  loan_label_monthly: "Monthly payment",
  loan_label_total: "Total paid",
  loan_label_interest: "Total interest",

  widget_open: "🧮 Open widget",
  mini_open: "📱 Open Mini App",

  cmd_start: "Start the bot",
  cmd_help: "How to use TezCalc",
  cmd_lang: "Change language",
  cmd_settings: "Settings",
  cmd_history: "Calculation history",
  cmd_convert: "Convert units and currencies",
  cmd_loan: "Loan calculator",
  cmd_pro: "TezCalc Pro subscription",
  cmd_privacy: "Privacy policy",
  cmd_terms: "Terms of use",
  cmd_paysupport: "Payment support and refunds",
  cmd_deleteme: "Delete my data",

  bot_name: "TezCalc: Calculator",
  bot_short_description: "Fast calculator for math, percentages, units, currencies and loans. Works inline and in any chat.",
  bot_description:
    "TezCalc is a fast calculator inside Telegram. Send an expression and get the answer instantly. " +
    "Percentages, unit and currency conversion, loan payments. Works in chat, inline (@tezcalc_bot) and in any group via guest mode. " +
    "Pro adds step-by-step solutions, graphs and synced history.",
  bot_about:
    "<b>🧮 TezCalc</b>\n\n" +
    "A fast, friendly calculator for Telegram: everyday math, percentages, unit and currency conversion and loan calculations. " +
    "Use it in this chat, inline in any conversation, in guest mode or in the Mini App.\n\n" +
    "Free for everyday use. TezCalc Pro (/pro) adds step-by-step solutions, graphs and history synced across devices.\n\n" +
    "/help · /privacy · /terms",

  // calc template (command handlers)
  not_math_hint: "🤔 That doesn't look like a calculation. Send an expression like <code>12*(3+4)</code> or <code>100 km to mi</code>. See /help.",
  settings_history: "🕘 Save calculation history",
  btn_on: "On",
  btn_off: "Off",
  loan_schedule_title: "📅 First {n} months",
  loan_row_legend: "month. payment = principal + interest → balance",
  vat_help: "<b>🧾 VAT calculator</b>\n<code>/vat 1000000</code> — adds 12% VAT to the amount.\n<code>/vat 1120000 remove</code> — extracts the VAT from an amount that includes it.\n<code>/vat 1000000 15</code> — another rate (in percent).",
  vat_label_net: "Amount without VAT",
  vat_label_vat: "VAT",
  vat_label_gross: "Amount with VAT",
  widget_unavailable: "⚠️ The widget can only be sent in a private chat with the bot, and it may be unavailable right now.",
  symbolic_help: "<b>🧠 Step-by-step solutions (Pro)</b>\n<code>/solve x^2-5x+6=0</code> — an equation or an expression.\n<code>/derive x^3*sin(x)</code> — a derivative.\n<code>/integrate x*e^x</code> — an indefinite integral.",
  err_parse: "⚠️ I couldn't read this expression. Check the brackets and operators.",
  err_unsupported: "⚠️ I can't solve this type of problem yet.",
  err_too_complex: "⚠️ This is too complex for a chat message. Open it in the Mini App.",
  deleteme_payments_note: "Payment records and your Pro period are kept: they are needed for refunds and accounting.",
  cmd_vat: "VAT calculator",
  cmd_solve: "Solve step by step (Pro)",
  cmd_derive: "Derivative step by step (Pro)",
  cmd_integrate: "Integral step by step (Pro)",
  cmd_widget: "Calculator widget",
  cmd_app: "Open the Mini App",
  style_title: "🎨 <b>Mini App style</b>\nPick how the TezCalc Mini App looks.",
  style_current: "Current style:",
  style_tactile: "Tactile 3D",
  style_glass: "Glass",
  style_fintech: "Fintech",
  style_techno: "Techno HUD",
  style_changed: "✅ Style saved",
  style_open_app: "📱 Open Mini App",
  cmd_style: "Change the Mini App style",
};
