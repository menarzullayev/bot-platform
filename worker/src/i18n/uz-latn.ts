import type { Messages } from "./types";

// Uzbek (Latin, 1995 alphabet, new orthography). The Cyrillic variant is generated from this file by translit.ts,
// so: use ʻ (U+02BB) for oʻ/gʻ, ʼ (U+02BC) for the tutuq belgisi, and wrap anything that must stay Latin in <code>.
export const uzLatn: Messages = {
  start:
    "👋 Salom, {name}!\n\n" +
    "Men <b>TezCalc</b> — Telegram ichidagi tezkor kalkulyatorman. Ifodani yuboring, javobni darhol olasiz:\n\n" +
    "<code>12*(3+4)</code>\n<code>480 * 15%</code>\n<code>100 km to mi</code>\n<code>50 USD to EUR</code>\n\n" +
    "Men inlayn rejimda va istalgan chatda ham ishlayman. Batafsil: /help.",

  help:
    "<b>📖 TezCalc bilan ishlash qoʻllanmasi</b>\n\n" +
    "<b>Hisob-kitob</b>\n" +
    "Ifodani shunchaki yuboring:\n" +
    "<code>2+3*4</code> · <code>(15+5)/4</code> · <code>2^10</code>\n" +
    "Funksiyalar: <code>sqrt(144)</code>, <code>sin(30)</code>, <code>ln(10)</code>, <code>abs(-5)</code>, <code>5!</code>. Doimiylar: <code>pi</code>, <code>e</code>.\n\n" +
    "<b>Foizlar</b>\n" +
    "<code>480 * 15%</code> → 72\n" +
    "<code>200 + 10%</code> → 220\n" +
    "<code>80 - 25%</code> → 60\n\n" +
    "<b>Birliklar va valyutalar</b>\n" +
    "<code>100 km to mi</code>, <code>72 kg to lb</code>, <code>30 C to F</code>\n" +
    "<code>50 USD to EUR</code>, <code>1000000 UZS to USD</code>\n" +
    "Batafsil: /convert\n\n" +
    "<b>Moliya</b>\n" +
    "Kredit toʻlovi: <code>/loan 50000 18 24</code> (summa, yillik foiz, oylar soni). Batafsil: /loan\n\n" +
    "<b>Inlayn rejim</b>\n" +
    "Istalgan chatda <code>@tezcalc_bot 480 * 15%</code> deb yozing va natijani tanlab yuboring.\n\n" +
    "<b>Mehmon rejimi</b>\n" +
    "Istalgan chatda, hatto men qoʻshilmagan guruhda ham, <code>@tezcalc_bot</code> va ifodani yozing — men javob beraman.\n\n" +
    "🧾 /vat · 🧠 /solve · /derive · /integrate (Pro) · 🧮 /widget · 📱 /app\n" +
    "⚙️ /settings · 🕘 /history · 🌐 /lang · ⭐ /pro",

  lang_menu_title: "🌐 Tilni tanlang",
  lang_changed: "✅ Til oʻzgartirildi: oʻzbekcha.",
  settings_title: "⚙️ <b>Sozlamalar</b>",
  settings_angle: "📐 Trigonometriya uchun burchak birligi: daraja (<code>deg</code>) yoki radian (<code>rad</code>)",
  settings_digits: "🔢 Natijadagi kasr xonalari soni",
  btn_back: "↩️ Orqaga",
  btn_cancel: "Bekor qilish",
  btn_delete: "🗑 Maʼlumotlarimni oʻchirish",

  err_syntax: "⚠️ {pos}-oʻrin yaqinida sintaksis xatosi bor. Qavslar va amallarni tekshiring.",
  err_div0: "⚠️ Nolga boʻlish mumkin emas.",
  err_domain: "⚠️ Bu qiymat funksiyaning aniqlanish sohasidan tashqarida (masalan, manfiy sonning ildizi yoki nolning logarifmi).",
  err_overflow: "⚠️ Natija koʻrsatish uchun juda katta.",
  err_unknown: "⚠️ “{name}” nimaligini bilmayman. Funksiya, birlik yoki valyuta yozilishini tekshiring.",
  err_too_long: "⚠️ Ifoda juda uzun. Iltimos, qisqartiring.",
  err_units_mismatch: "⚠️ Bu birliklarni bir-biriga aylantirib boʻlmaydi (masalan, uzunlik va massa).",
  err_no_rate: "⚠️ Hozir {pair} uchun kurs mavjud emas. Keyinroq urinib koʻring.",
  err_generic: "⚠️ Nimadir xato ketdi. Iltimos, qayta urinib koʻring.",
  rate_limited: "⏳ Soʻrovlar juda koʻp. Biroz kutib, qayta urinib koʻring.",

  history_title: "🕘 <b>Tarix</b>",
  history_empty: "Tarix boʻsh. Tarix yoqilganda (Pro) hisob-kitoblar shu yerda saqlanadi.",
  history_cleared: "🗑 Tarix tozalandi.",

  fx_updated: "💱 Kurslar yangilangan: {date}",
  fx_stale: "⚠️ Valyuta kurslari eskirgan (oxirgi yangilanish: {date}). Natija noaniq boʻlishi mumkin.",

  pro_title: "⭐ <b>TezCalc Pro</b>",
  pro_features:
    "✅ Bosqichma-bosqich yechim\n" +
    "✅ Funksiya grafiklari\n" +
    "✅ Qurilmalar oʻrtasida sinxronlanadigan tarix\n" +
    "✅ Cheksiz tarix\n" +
    "✅ Kengaytirilgan birliklar va valyutalar",
  pro_price: "💳 Narxi: 30 kun uchun {stars} ⭐ Telegram Stars. Toʻlovni Telegram amalga oshiradi, obuna avtomatik yangilanadi.",
  pro_active: "✅ Pro obunangiz {date} gacha faol.",
  pro_required: "🔒 Bu imkoniyat TezCalc Pro tarkibida. Batafsil maʼlumot: /pro.",
  pro_thanks: "🎉 Rahmat! Pro faollashtirildi. Bosqichma-bosqich yechim, grafiklar va cheksiz tarixdan foydalaning.",
  pro_already: "Sizda Pro obuna allaqachon faol.",
  pro_cancel_info:
    "Bekor qilish uchun Telegram → Sozlamalar → Mening Starslarim → Obunalar boʻlimiga kirib, TezCalc Pro obunasini bekor qiling. " +
    "Toʻlab qoʻyilgan davr oxirigacha Pro ishlashda davom etadi.",

  privacy:
    "<b>🔒 Maxfiylik siyosati</b>\n\n" +
    "<b>Nimalar saqlanadi</b>\n" +
    "• Telegram identifikatoringiz, tilingiz va sozlamalaringiz (burchak birligi, kasr xonalari soni).\n" +
    "• Hisob-kitoblar tarixi — faqat tarix yoqilgan boʻlsa (Pro).\n" +
    "• Toʻlov identifikatorlari (Stars toʻlovi va obuna identifikatorlari) — Pro obunangizni tasdiqlash va qoʻllab-quvvatlash uchun.\n\n" +
    "<b>Nimalar qilinmaydi</b>\n" +
    "• Yuborgan ifodalaringiz faqat javobni hisoblash uchun qayta ishlanadi, tarix oʻchiq boʻlsa saqlanmaydi.\n" +
    "• Maʼlumotlaringiz sotilmaydi, uchinchi shaxslarga berilmaydi va reklama uchun ishlatilmaydi. Toʻlovlarni Telegram qayta ishlaydi, karta maʼlumotlaringizni biz koʻrmaymiz.\n" +
    "• Valyuta kurslari ochiq manbadan olinadi, u yerga shaxsiy maʼlumotlaringiz yuborilmaydi.\n\n" +
    "<b>Nazorat sizda</b>\n" +
    "Sozlamalar, tarix va saqlangan maʼlumotlarni istalgan vaqtda /deleteme buyrugʻi bilan oʻchirishingiz mumkin.",

  terms:
    "<b>📄 Foydalanish shartlari</b>\n\n" +
    "1. TezCalc — hisoblash vositasi. Natijalar “boricha” taqdim etiladi va xato boʻlishi mumkin; muhim raqamlarni oʻzingiz ham tekshiring. Valyuta kurslari taxminiy va moliyaviy maslahat hisoblanmaydi.\n" +
    "2. Pro — Telegram Stars bilan toʻlanadigan raqamli xizmat. U 30 kunlik obuna boʻlib, Telegram orqali bekor qilmaguningizcha avtomatik yangilanadi.\n" +
    "3. Qaytarish va toʻlov muammolari: /paysupport.\n" +
    "4. Botdan suiisteʼmol qilmang (spam, avtomatik ommaviy soʻrovlar, buzishga urinish). Bunday holatda foydalanishni cheklashimiz yoki toʻxtatishimiz mumkin.\n" +
    "5. Bot va shartlar yangilanishi mumkin. Foydalanishni davom ettirsangiz, amaldagi shartlarga rozi boʻlgan hisoblanasiz.",

  paysupport:
    "<b>💬 Toʻlov boʻyicha yordam</b>\n\n" +
    "Stars toʻlovida muammo bormi yoki pulni qaytarmoqchimisiz? Quyidagi aloqa orqali yozib, muammoni bayon qiling. " +
    "Toʻlov sanasi va Stars miqdorini ham koʻrsating.\n\n" +
    "Har bir murojaat alohida koʻrib chiqiladi. Qaytarilgan Stars Telegram balansingizga qaytadi. " +
    "Keyingi yechib olishlarni toʻxtatish uchun /pro dagi koʻrsatma boʻyicha obunani bekor qiling.",

  deleteme_confirm:
    "⚠️ Sozlamalaringiz, tarixingiz va saqlangan maʼlumotlaringiz butunlay oʻchiriladi. Buni qaytarib boʻlmaydi.\n\n" +
    "Faol Pro obuna avtomatik bekor qilinmaydi. Avval uni Telegramda bekor qiling (/pro). Davom etamizmi?",
  deleteme_done: "✅ Maʼlumotlaringiz oʻchirildi.",

  unknown_command: "Nomaʼlum buyruq. Nimalar qila olishimni /help orqali koʻring.",

  inline_help_title: "Ifodani yozing",
  inline_help_desc: "Masalan: 12*(3+4) yoki 100 km to mi",
  inline_result_desc: "Natijani yuborish uchun bosing",
  guest_hint: "Maslahat: istalgan chatda @tezcalc_bot va ifodani yozing, masalan @tezcalc_bot 12*(3+4)",

  converter_help:
    "<b>🔄 Konvertor</b>\n" +
    "Birliklar va valyutalar — bir qatorda:\n" +
    "<code>/convert 100 km mi</code>\n" +
    "<code>/convert 50 USD EUR</code>\n" +
    "Yoki shunchaki <code>100 km to mi</code> deb yuboring.\n\n" +
    "Qoʻllab-quvvatlanadi: uzunlik, massa, hajm, harorat, tezlik, yuza, vaqt, axborot hajmi va koʻplab dunyo valyutalari.",

  loan_help:
    "<b>🏦 Kredit kalkulyatori</b>\n" +
    "<code>/loan summa foiz oylar</code>\n" +
    "Masalan: <code>/loan 50000 18 24</code> — 50 000 summa, yiliga 18%, 24 oyga kredit.\n\n" +
    "Oylik toʻlov, jami toʻlov va jami foiz xarajatini koʻrsataman (teng oylik toʻlovlar).",
  loan_label_monthly: "Oylik toʻlov",
  loan_label_total: "Jami toʻlov",
  loan_label_interest: "Jami foiz",

  widget_open: "🧮 Vidjetni ochish",
  mini_open: "📱 Mini ilovani ochish",

  cmd_start: "Botni ishga tushirish",
  cmd_help: "TezCalc: foydalanish yoʻriqnomasi",
  cmd_lang: "Tilni oʻzgartirish",
  cmd_settings: "Sozlamalar",
  cmd_history: "Hisob-kitoblar tarixi",
  cmd_convert: "Birlik va valyutalarni aylantirish",
  cmd_loan: "Kredit kalkulyatori",
  cmd_pro: "TezCalc Pro obunasi",
  cmd_privacy: "Maxfiylik siyosati",
  cmd_terms: "Foydalanish shartlari",
  cmd_paysupport: "Toʻlov yordami va qaytarish",
  cmd_deleteme: "Maʼlumotlarimni oʻchirish",

  bot_name: "TezCalc: Kalkulyator",
  bot_short_description: "Matematika, foiz, birlik, valyuta va kredit uchun tezkor kalkulyator. Inlayn rejimda va istalgan chatda ishlaydi.",
  bot_description:
    "TezCalc — Telegram ichidagi tezkor kalkulyator. Ifodani yuboring va javobni darhol oling. " +
    "Foizlar, birlik va valyuta konvertatsiyasi, kredit toʻlovlari. Chatda, inlayn rejimda (@tezcalc_bot) va mehmon rejimi orqali istalgan guruhda ishlaydi. " +
    "Pro bosqichma-bosqich yechim, grafiklar va sinxronlangan tarixni qoʻshadi.",
  bot_about:
    "<b>🧮 TezCalc</b>\n\n" +
    "Telegram uchun tezkor va qulay kalkulyator: kundalik hisob-kitoblar, foizlar, birlik va valyuta konvertatsiyasi hamda kredit hisoblari. " +
    "Undan shu chatda, istalgan suhbatda inlayn rejimda, mehmon rejimida yoki Mini ilovada foydalaning.\n\n" +
    "Kundalik foydalanish bepul. TezCalc Pro (/pro) bosqichma-bosqich yechim, grafiklar va qurilmalar oʻrtasida sinxronlangan tarixni qoʻshadi.\n\n" +
    "/help · /privacy · /terms",

  // calc template (command handlers)
  not_math_hint: "🤔 Bu hisob-kitobga oʻxshamaydi. <code>12*(3+4)</code> yoki <code>100 km to mi</code> kabi ifoda yuboring. Batafsil: /help.",
  settings_history: "🕘 Hisob-kitoblar tarixini saqlash",
  btn_on: "Yoqilgan",
  btn_off: "Oʻchiq",
  loan_schedule_title: "📅 Dastlabki {n} oy",
  loan_row_legend: "oy. toʻlov = asosiy qarz + foiz → qoldiq",
  vat_help: "<b>🧾 QQS kalkulyatori</b>\n<code>/vat 1000000</code> — summaga 12% QQS qoʻshiladi.\n<code>/vat 1120000 remove</code> — summa ichidan QQS ajratiladi.\n<code>/vat 1000000 15</code> — boshqa stavka (foizda).",
  vat_label_net: "QQSsiz summa",
  vat_label_vat: "QQS",
  vat_label_gross: "QQS bilan summa",
  widget_unavailable: "⚠️ Vidjetni faqat bot bilan shaxsiy chatda yuborish mumkin va u hozir mavjud boʻlmasligi mumkin.",
  symbolic_help: "<b>🧠 Bosqichma-bosqich yechim (Pro)</b>\n<code>/solve x^2-5x+6=0</code> — tenglama yoki ifoda.\n<code>/derive x^3*sin(x)</code> — hosila.\n<code>/integrate x*e^x</code> — aniqmas integral.",
  err_parse: "⚠️ Ifodani oʻqiy olmadim. Qavslar va amallarni tekshiring.",
  err_unsupported: "⚠️ Bu turdagi masalani hozircha yecha olmayman.",
  err_too_complex: "⚠️ Bu chat uchun juda murakkab. Mini ilovada oching.",
  deleteme_payments_note: "Toʻlov yozuvlari va Pro muddatingiz saqlanadi: ular pulni qaytarish va hisob-kitob uchun kerak.",
  cmd_vat: "QQS kalkulyatori",
  cmd_solve: "Bosqichli yechim (Pro)",
  cmd_derive: "Hosila, bosqichlab (Pro)",
  cmd_integrate: "Integral, bosqichlab (Pro)",
  cmd_widget: "Kalkulyator vidjeti",
  cmd_app: "Mini ilovani ochish",
};
