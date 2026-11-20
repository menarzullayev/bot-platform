// Mini App specific UI strings in the 7 bot languages. Shared texts (errors, Pro copy, loan labels) come from the
// bot's i18n catalog instead (see i18n.ts). Column order of every row: uz-latn, ru, en, tr, ar, es.
// uz-cyrl is not written by hand: it is derived from uz-latn with the platform's deterministic transliteration.

import { latinToCyrillic } from "../../worker/src/i18n/translit";
import type { Lang } from "../../worker/src/i18n/types";

type Row = readonly [uz: string, ru: string, en: string, tr: string, ar: string, es: string];

const ROWS = {
  // ---- navigation ----
  nav_calc: ["Hisoblash", "Счёт", "Calc", "Hesap", "حاسبة", "Calc"],
  nav_convert: ["Konverter", "Конвертер", "Convert", "Çevir", "محوّل", "Conv."],
  nav_graph: ["Grafik", "График", "Graph", "Grafik", "رسم", "Gráfico"],
  nav_solve: ["Yechim", "Решение", "Solve", "Çözüm", "حل", "Resolver"],
  nav_finance: ["Moliya", "Финансы", "Finance", "Finans", "مالية", "Finanzas"],
  nav_settings: ["Sozlama", "Настройки", "Settings", "Ayarlar", "إعدادات", "Ajustes"],

  // ---- shell ----
  open_in_telegram: ["Telegram ichida oching", "Откройте внутри Telegram", "Open inside Telegram", "Telegram içinde açın", "افتح داخل تيليجرام", "Ábrelo dentro de Telegram"],
  open_in_telegram_hint: [
    "Bu mini ilova Telegram ichida toʻliq ishlaydi. Hozir demo rejim: faqat qurilmada hisoblash.",
    "Мини-приложение работает полностью внутри Telegram. Сейчас демо-режим: только вычисления на устройстве.",
    "This Mini App works fully inside Telegram. Demo mode now: calculations on this device only.",
    "Bu mini uygulama Telegram içinde tam çalışır. Şimdi demo modu: yalnızca cihazda hesaplama.",
    "يعمل هذا التطبيق المصغّر بالكامل داخل تيليجرام. الآن وضع تجريبي: حسابات على هذا الجهاز فقط.",
    "Esta Mini App funciona completa dentro de Telegram. Ahora es modo demo: solo cálculos en este dispositivo.",
  ],
  loading: ["Yuklanmoqda…", "Загрузка…", "Loading…", "Yükleniyor…", "جارٍ التحميل…", "Cargando…"],
  retry: ["Qayta urinish", "Повторить", "Retry", "Tekrar dene", "إعادة المحاولة", "Reintentar"],
  copy: ["Nusxalash", "Копировать", "Copy", "Kopyala", "نسخ", "Copiar"],
  copied: ["Nusxalandi", "Скопировано", "Copied", "Kopyalandı", "تم النسخ", "Copiado"],
  close: ["Yopish", "Закрыть", "Close", "Kapat", "إغلاق", "Cerrar"],
  search: ["Qidirish", "Поиск", "Search", "Ara", "بحث", "Buscar"],
  err_network: ["Tarmoq xatosi", "Ошибка сети", "Network error", "Ağ hatası", "خطأ في الشبكة", "Error de red"],
  err_auth: [
    "Tasdiqlanmadi. Mini ilovani bot orqali qayta oching.",
    "Не удалось подтвердить. Откройте мини-приложение через бота заново.",
    "Could not verify you. Reopen the Mini App from the bot.",
    "Doğrulanamadı. Mini uygulamayı bottan yeniden açın.",
    "تعذّر التحقق. أعد فتح التطبيق المصغّر من البوت.",
    "No se pudo verificar. Vuelve a abrir la Mini App desde el bot.",
  ],
  err_expired: [
    "Seans eskirdi. Mini ilovani qayta oching.",
    "Сеанс устарел. Откройте мини-приложение заново.",
    "Session expired. Reopen the Mini App.",
    "Oturum süresi doldu. Mini uygulamayı yeniden açın.",
    "انتهت الجلسة. أعد فتح التطبيق المصغّر.",
    "La sesión caducó. Vuelve a abrir la Mini App.",
  ],

  // ---- calculator ----
  calc_placeholder: ["Ifoda: 2+2*3, sin(30)", "Выражение: 2+2*3, sin(30)", "Expression: 2+2*3, sin(30)", "İfade: 2+2*3, sin(30)", "التعبير: 2+2*3, sin(30)", "Expresión: 2+2*3, sin(30)"],
  calc_history: ["Tarix", "История", "History", "Geçmiş", "السجل", "Historial"],
  calc_history_count: ["{n} / {max} ta saqlanadi", "Хранится {n} из {max}", "{n} of {max} kept", "{n} / {max} saklanır", "المحفوظ {n} من {max}", "{n} de {max} guardados"],
  calc_history_local: ["Faqat shu qurilmada", "Только на этом устройстве", "On this device only", "Yalnızca bu cihazda", "على هذا الجهاز فقط", "Solo en este dispositivo"],
  calc_clear_history: ["Tarixni tozalash", "Очистить историю", "Clear history", "Geçmişi temizle", "مسح السجل", "Borrar historial"],
  calc_keyboard: ["Klaviatura", "Клавиатура", "Keyboard", "Klavye", "لوحة المفاتيح", "Teclado"],
  calc_sci: ["Funksiyalar", "Функции", "Functions", "Fonksiyonlar", "الدوال", "Funciones"],
  calc_tap_insert: ["Bosib ifodaga qoʻying", "Нажмите, чтобы вставить", "Tap to insert", "Eklemek için dokun", "اضغط للإدراج", "Toca para insertar"],

  // ---- converter ----
  conv_value: ["Qiymat", "Значение", "Value", "Değer", "القيمة", "Valor"],
  conv_from: ["Qayerdan", "Из", "From", "Kaynak", "من", "De"],
  conv_to: ["Qayerga", "В", "To", "Hedef", "إلى", "A"],
  conv_swap: ["Almashtirish", "Поменять", "Swap", "Değiştir", "تبديل", "Intercambiar"],
  conv_pick: ["Tanlang", "Выберите", "Choose", "Seçin", "اختر", "Elige"],
  conv_search_ph: ["Kod yoki nom", "Код или название", "Code or name", "Kod veya ad", "الرمز أو الاسم", "Código o nombre"],
  conv_no_match: ["Hech narsa topilmadi", "Ничего не найдено", "No matches", "Eşleşme yok", "لا نتائج", "Sin resultados"],
  conv_rates_loading: ["Kurslar yuklanmoqda…", "Загрузка курсов…", "Loading rates…", "Kurlar yükleniyor…", "جارٍ تحميل الأسعار…", "Cargando tasas…"],
  conv_rates_unavailable: [
    "Valyuta kurslari mavjud emas. Birliklar ishlaydi.",
    "Курсы валют недоступны. Единицы работают.",
    "Exchange rates are unavailable. Units still work.",
    "Döviz kurları yok. Birimler çalışır.",
    "أسعار الصرف غير متاحة. الوحدات تعمل.",
    "Tasas de cambio no disponibles. Las unidades funcionan.",
  ],
  conv_rate_line: ["1 {from} = {rate} {to}", "1 {from} = {rate} {to}", "1 {from} = {rate} {to}", "1 {from} = {rate} {to}", "1 {from} = {rate} {to}", "1 {from} = {rate} {to}"],
  cat_length: ["Uzunlik", "Длина", "Length", "Uzunluk", "الطول", "Longitud"],
  cat_mass: ["Massa", "Масса", "Mass", "Kütle", "الكتلة", "Masa"],
  cat_volume: ["Hajm", "Объём", "Volume", "Hacim", "الحجم", "Volumen"],
  cat_area: ["Yuza", "Площадь", "Area", "Alan", "المساحة", "Área"],
  cat_temperature: ["Harorat", "Температура", "Temperature", "Sıcaklık", "الحرارة", "Temperatura"],
  cat_speed: ["Tezlik", "Скорость", "Speed", "Hız", "السرعة", "Velocidad"],
  cat_time: ["Vaqt", "Время", "Time", "Zaman", "الوقت", "Tiempo"],
  cat_data: ["Maʼlumot", "Данные", "Data", "Veri", "البيانات", "Datos"],
  cat_pressure: ["Bosim", "Давление", "Pressure", "Basınç", "الضغط", "Presión"],
  cat_energy: ["Energiya", "Энергия", "Energy", "Enerji", "الطاقة", "Energía"],
  cat_angle: ["Burchak", "Угол", "Angle", "Açı", "الزاوية", "Ángulo"],
  cat_power: ["Quvvat", "Мощность", "Power", "Güç", "القدرة", "Potencia"],
  cat_currency: ["Valyuta", "Валюта", "Currency", "Para birimi", "العملة", "Moneda"],

  // ---- graph ----
  graph_fx_ph: ["f(x) = …", "f(x) = …", "f(x) = …", "f(x) = …", "f(x) = …", "f(x) = …"],
  graph_add: ["Funksiya qoʻshish", "Добавить функцию", "Add function", "Fonksiyon ekle", "إضافة دالة", "Añadir función"],
  graph_remove: ["Oʻchirish", "Удалить", "Remove", "Kaldır", "حذف", "Quitar"],
  graph_table: ["Jadval", "Таблица", "Table", "Tablo", "جدول", "Tabla"],
  graph_reset: ["Boshlangʻich koʻrinish", "Сбросить вид", "Reset view", "Görünümü sıfırla", "إعادة الضبط", "Restablecer vista"],
  graph_table_from: ["x dan", "x от", "x from", "x başlangıç", "x من", "x desde"],
  graph_table_step: ["Qadam", "Шаг", "Step", "Adım", "الخطوة", "Paso"],
  graph_invalid: ["Ifoda tushunarsiz", "Выражение не распознано", "Cannot read expression", "İfade anlaşılamadı", "تعذّر فهم التعبير", "No se entiende la expresión"],
  graph_note: ["Burchaklar radianda", "Углы в радианах", "Angles in radians", "Açılar radyan", "الزوايا بالراديان", "Ángulos en radianes"],
  graph_hint: ["Suring va chimdib kattalashtiring", "Двигайте и щипком масштабируйте", "Drag to pan, pinch to zoom", "Kaydırın, kıstırarak yakınlaştırın", "اسحب للتحريك واقرص للتكبير", "Arrastra y pellizca para hacer zoom"],

  // ---- solve ----
  solve_derivative: ["Hosila", "Производная", "Derivative", "Türev", "المشتقة", "Derivada"],
  solve_integral: ["Integral", "Интеграл", "Integral", "İntegral", "التكامل", "Integral"],
  solve_equation: ["Tenglama", "Уравнение", "Equation", "Denklem", "معادلة", "Ecuación"],
  solve_system: ["Sistema", "Система", "System", "Sistem", "نظام", "Sistema"],
  solve_arith: ["Amallar", "Действия", "Arithmetic", "İşlem", "حساب", "Aritmética"],
  solve_go: ["Yechish", "Решить", "Solve", "Çöz", "حل", "Resolver"],
  solve_expr_ph: ["Ifoda, masalan x^2*sin(x)", "Выражение, например x^2*sin(x)", "Expression, e.g. x^2*sin(x)", "İfade, örn. x^2*sin(x)", "تعبير مثل x^2*sin(x)", "Expresión, p. ej. x^2*sin(x)"],
  solve_eq_ph: ["Tenglama, masalan x^2-5x+6=0", "Уравнение, например x^2-5x+6=0", "Equation, e.g. x^2-5x+6=0", "Denklem, örn. x^2-5x+6=0", "معادلة مثل x^2-5x+6=0", "Ecuación, p. ej. x^2-5x+6=0"],
  solve_eq1: ["1-tenglama: 2x+3y=7", "Уравнение 1: 2x+3y=7", "Equation 1: 2x+3y=7", "Denklem 1: 2x+3y=7", "المعادلة 1: 2x+3y=7", "Ecuación 1: 2x+3y=7"],
  solve_eq2: ["2-tenglama: x-y=1", "Уравнение 2: x-y=1", "Equation 2: x-y=1", "Denklem 2: x-y=1", "المعادلة 2: x-y=1", "Ecuación 2: x-y=1"],
  solve_definite: ["Aniq integral", "Определённый интеграл", "Definite integral", "Belirli integral", "تكامل محدد", "Integral definida"],
  solve_lower: ["Quyi chegara a", "Нижний предел a", "Lower bound a", "Alt sınır a", "الحد الأدنى a", "Límite inferior a"],
  solve_upper: ["Yuqori chegara b", "Верхний предел b", "Upper bound b", "Üst sınır b", "الحد الأعلى b", "Límite superior b"],
  solve_result: ["Natija", "Результат", "Result", "Sonuç", "النتيجة", "Resultado"],
  solve_steps: ["Qadamlar", "Шаги", "Steps", "Adımlar", "الخطوات", "Pasos"],
  solve_no_roots: ["Yechim yoʻq", "Решений нет", "No solution", "Çözüm yok", "لا يوجد حل", "Sin solución"],
  solve_all: ["Har qanday son yechim", "Подходит любое число", "Every number is a solution", "Her sayı çözümdür", "كل عدد حل", "Cualquier número es solución"],
  solve_infinite: ["Cheksiz koʻp yechim", "Бесконечно много решений", "Infinitely many solutions", "Sonsuz çözüm", "عدد لا نهائي من الحلول", "Infinitas soluciones"],
  solve_err_parse: ["Ifoda tushunarsiz", "Выражение не распознано", "Cannot read the expression", "İfade anlaşılamadı", "تعذّر فهم التعبير", "No se entiende la expresión"],
  solve_err_unsupported: ["Bu turdagi ifoda qoʻllab-quvvatlanmaydi", "Такой вид выражения не поддерживается", "This kind of expression is not supported", "Bu tür ifade desteklenmiyor", "هذا النوع من التعابير غير مدعوم", "Este tipo de expresión no está soportado"],
  solve_err_complex: ["Ifoda juda murakkab", "Выражение слишком сложное", "Expression is too complex", "İfade çok karmaşık", "التعبير معقّد جدًا", "La expresión es demasiado compleja"],
  solve_err_domain: ["Aniqlanish sohasidan tashqari", "Вне области определения", "Outside the domain", "Tanım kümesi dışında", "خارج المجال", "Fuera del dominio"],
  solve_err_divergent: ["Integral uzoqlashadi", "Интеграл расходится", "The integral diverges", "İntegral ıraksıyor", "التكامل متباعد", "La integral diverge"],
  solve_err_invalid: ["Notoʻgʻri kiritish", "Неверный ввод", "Invalid input", "Geçersiz giriş", "إدخال غير صالح", "Entrada no válida"],

  // ---- Pro ----
  pro_badge: ["Pro", "Pro", "Pro", "Pro", "Pro", "Pro"],
  pro_locked_title: ["Bosqichma-bosqich yechim — Pro", "Пошаговое решение — Pro", "Step-by-step solutions — Pro", "Adım adım çözüm — Pro", "الحل خطوة بخطوة — Pro", "Soluciones paso a paso — Pro"],
  pro_locked_text: [
    "Hosila, integral, tenglama va sistemalar toʻliq qadamlar bilan.",
    "Производные, интегралы, уравнения и системы с полными шагами.",
    "Derivatives, integrals, equations and systems with full steps.",
    "Türev, integral, denklem ve sistemler tüm adımlarla.",
    "المشتقات والتكاملات والمعادلات والأنظمة بكل الخطوات.",
    "Derivadas, integrales, ecuaciones y sistemas con todos los pasos.",
  ],
  pro_upgrade: ["Pro tarifiga oʻtish ⭐ {stars}", "Перейти на Pro ⭐ {stars}", "Upgrade to Pro ⭐ {stars}", "Pro'ya geç ⭐ {stars}", "الترقية إلى Pro ⭐ {stars}", "Pasar a Pro ⭐ {stars}"],
  pro_pending: ["Toʻlov tasdiqlanmoqda…", "Подтверждаем оплату…", "Confirming payment…", "Ödeme onaylanıyor…", "جارٍ تأكيد الدفع…", "Confirmando el pago…"],
  pro_paid: ["Pro yoqildi", "Pro включён", "Pro is active", "Pro etkin", "تم تفعيل Pro", "Pro activado"],
  pro_cancelled: ["Toʻlov bekor qilindi", "Оплата отменена", "Payment cancelled", "Ödeme iptal edildi", "تم إلغاء الدفع", "Pago cancelado"],
  pro_failed: ["Toʻlov amalga oshmadi", "Оплата не прошла", "Payment failed", "Ödeme başarısız", "فشل الدفع", "El pago falló"],
  pro_need_telegram: ["Toʻlov faqat Telegram ichida", "Оплата доступна только в Telegram", "Payment works only inside Telegram", "Ödeme yalnızca Telegram içinde", "الدفع داخل تيليجرام فقط", "El pago solo funciona dentro de Telegram"],

  // ---- finance ----
  fin_loan: ["Kredit", "Кредит", "Loan", "Kredi", "قرض", "Préstamo"],
  fin_vat: ["QQS", "НДС", "VAT", "KDV", "ضريبة القيمة المضافة", "IVA"],
  fin_discount: ["Chegirma", "Скидка", "Discount", "İndirim", "خصم", "Descuento"],
  fin_percent: ["Foiz oʻzgarishi", "Изменение в %", "% change", "% değişim", "نسبة التغيّر", "% de cambio"],
  fin_compound: ["Murakkab foiz", "Сложный %", "Compound", "Bileşik faiz", "فائدة مركبة", "Interés compuesto"],
  fin_simple: ["Oddiy foiz", "Простой %", "Simple interest", "Basit faiz", "فائدة بسيطة", "Interés simple"],
  fin_markup: ["Ustama", "Наценка", "Markup", "Kâr payı", "هامش الربح", "Margen"],
  f_principal: ["Summa", "Сумма", "Amount", "Tutar", "المبلغ", "Importe"],
  f_rate: ["Yillik foiz, %", "Годовая ставка, %", "Annual rate, %", "Yıllık oran, %", "المعدل السنوي ٪", "Tasa anual, %"],
  f_months: ["Muddat, oy", "Срок, мес.", "Term, months", "Vade, ay", "المدة بالأشهر", "Plazo, meses"],
  f_type: ["Turi", "Тип", "Type", "Tür", "النوع", "Tipo"],
  f_annuity: ["Annuitet", "Аннуитет", "Annuity", "Anüite", "أقساط ثابتة", "Anualidad"],
  f_diff: ["Differensial", "Дифференц.", "Diminishing", "Azalan", "متناقصة", "Decreciente"],
  f_amount: ["Summa", "Сумма", "Amount", "Tutar", "المبلغ", "Importe"],
  f_vat_rate: ["QQS stavkasi, %", "Ставка НДС, %", "VAT rate, %", "KDV oranı, %", "نسبة الضريبة ٪", "Tipo de IVA, %"],
  f_mode: ["Amal", "Режим", "Mode", "Mod", "الوضع", "Modo"],
  f_vat_add: ["QQS qoʻshish", "Добавить НДС", "Add VAT", "KDV ekle", "إضافة الضريبة", "Añadir IVA"],
  f_vat_remove: ["QQS ajratish", "Выделить НДС", "Extract VAT", "KDV ayır", "استخراج الضريبة", "Extraer IVA"],
  f_price: ["Narx", "Цена", "Price", "Fiyat", "السعر", "Precio"],
  f_discount_pct: ["Chegirma, %", "Скидка, %", "Discount, %", "İndirim, %", "الخصم ٪", "Descuento, %"],
  f_from: ["Dan", "Было", "From", "Önce", "من", "Antes"],
  f_to: ["Gacha", "Стало", "To", "Sonra", "إلى", "Después"],
  f_years: ["Muddat, yil", "Срок, лет", "Term, years", "Süre, yıl", "المدة بالسنوات", "Plazo, años"],
  f_compounding: ["Hisoblash davri", "Капитализация", "Compounding", "Birleşim", "التراكم", "Capitalización"],
  f_yearly: ["Yillik", "Ежегодно", "Yearly", "Yıllık", "سنويًا", "Anual"],
  f_quarterly: ["Choraklik", "Ежеквартально", "Quarterly", "Üç aylık", "ربع سنوي", "Trimestral"],
  f_monthly: ["Oylik", "Ежемесячно", "Monthly", "Aylık", "شهريًا", "Mensual"],
  f_daily: ["Kunlik", "Ежедневно", "Daily", "Günlük", "يوميًا", "Diario"],
  f_cost: ["Tannarx", "Себестоимость", "Cost", "Maliyet", "التكلفة", "Coste"],
  r_first_payment: ["Birinchi toʻlov", "Первый платёж", "First payment", "İlk ödeme", "الدفعة الأولى", "Primer pago"],
  r_last_payment: ["Oxirgi toʻlov", "Последний платёж", "Last payment", "Son ödeme", "الدفعة الأخيرة", "Último pago"],
  r_overpayment: ["Ortiqcha toʻlov", "Переплата", "Overpayment", "Fazla ödeme", "الدفع الزائد", "Sobrecoste"],
  r_net: ["QQSsiz", "Без НДС", "Net", "KDV hariç", "الصافي", "Neto"],
  r_vat: ["QQS", "НДС", "VAT", "KDV", "الضريبة", "IVA"],
  r_gross: ["QQS bilan", "С НДС", "Gross", "KDV dahil", "الإجمالي", "Bruto"],
  r_final: ["Yakuniy summa", "Итого", "Final amount", "Son tutar", "المبلغ النهائي", "Importe final"],
  r_saved: ["Tejaldi", "Экономия", "Saved", "Tasarruf", "الوفر", "Ahorro"],
  r_change_pct: ["Oʻzgarish, %", "Изменение, %", "Change, %", "Değişim, %", "التغيّر ٪", "Cambio, %"],
  r_change: ["Farq", "Разница", "Difference", "Fark", "الفرق", "Diferencia"],
  r_effective: ["Samarali yillik foiz", "Эффективная ставка", "Effective annual rate", "Efektif yıllık oran", "المعدل السنوي الفعلي", "Tasa anual efectiva"],
  r_profit: ["Foyda", "Прибыль", "Profit", "Kâr", "الربح", "Beneficio"],
  r_markup: ["Ustama", "Наценка", "Markup", "Kâr payı", "هامش الربح", "Margen sobre coste"],
  r_margin: ["Marja", "Маржа", "Margin", "Marj", "الهامش", "Margen"],
  r_schedule: ["Toʻlov jadvali (dastlabki 12 oy)", "График платежей (первые 12 мес.)", "Payment schedule (first 12 months)", "Ödeme planı (ilk 12 ay)", "جدول الدفعات (أول 12 شهرًا)", "Calendario de pagos (primeros 12 meses)"],
  r_col_month: ["Oy", "Мес.", "Mo.", "Ay", "الشهر", "Mes"],
  r_col_payment: ["Toʻlov", "Платёж", "Payment", "Ödeme", "الدفعة", "Pago"],
  r_col_principal: ["Asosiy qarz", "Долг", "Principal", "Anapara", "الأصل", "Capital"],
  r_col_interest: ["Foiz", "Проценты", "Interest", "Faiz", "الفائدة", "Interés"],
  r_col_balance: ["Qoldiq", "Остаток", "Balance", "Kalan", "المتبقي", "Saldo"],
  fin_bad_input: ["Maydonlarni toʻgʻri toʻldiring", "Проверьте значения полей", "Check the field values", "Alanları kontrol edin", "تحقق من قيم الحقول", "Revisa los valores"],

  // ---- settings ----
  set_language: ["Til", "Язык", "Language", "Dil", "اللغة", "Idioma"],
  set_angle: ["Burchak birligi", "Единица угла", "Angle unit", "Açı birimi", "وحدة الزاوية", "Unidad de ángulo"],
  set_deg: ["Gradus", "Градусы", "Degrees", "Derece", "درجات", "Grados"],
  set_rad: ["Radian", "Радианы", "Radians", "Radyan", "راديان", "Radianes"],
  set_digits: ["Kasr xonalari", "Знаков после запятой", "Decimal places", "Ondalık basamak", "الخانات العشرية", "Decimales"],
  set_history: ["Tarixni sinxronlash", "Синхронизация истории", "Sync history", "Geçmişi eşitle", "مزامنة السجل", "Sincronizar historial"],
  set_history_hint: [
    "Yoqilsa, hisob-kitoblar tarixi serverda saqlanadi va boshqa qurilmalarda ham koʻrinadi.",
    "Если включено, история вычислений хранится на сервере и видна на других устройствах.",
    "When on, your calculation history is stored on the server and shows on your other devices.",
    "Açıksa hesap geçmişi sunucuda saklanır ve diğer cihazlarda da görünür.",
    "عند التفعيل يُحفظ سجل العمليات على الخادم ويظهر على أجهزتك الأخرى.",
    "Si está activado, el historial se guarda en el servidor y aparece en tus otros dispositivos.",
  ],
  set_theme: ["Mavzu", "Тема", "Theme", "Tema", "المظهر", "Tema"],
  theme_auto: ["Avto", "Авто", "Auto", "Otomatik", "تلقائي", "Auto"],
  theme_light: ["Yorugʻ", "Светлая", "Light", "Açık", "فاتح", "Claro"],
  theme_dark: ["Qorongʻi", "Тёмная", "Dark", "Koyu", "داكن", "Oscuro"],
  set_plan: ["Obuna", "Подписка", "Plan", "Abonelik", "الاشتراك", "Plan"],
  set_plan_free: ["Bepul", "Бесплатно", "Free", "Ücretsiz", "مجاني", "Gratis"],
  set_plan_until: ["Pro: {date} gacha", "Pro до {date}", "Pro until {date}", "Pro: {date} tarihine kadar", "Pro حتى {date}", "Pro hasta {date}"],
  set_saved: ["Saqlandi", "Сохранено", "Saved", "Kaydedildi", "تم الحفظ", "Guardado"],
  set_save_failed: ["Saqlab boʻlmadi", "Не удалось сохранить", "Could not save", "Kaydedilemedi", "تعذّر الحفظ", "No se pudo guardar"],
  set_demo_note: ["Demo rejimda sozlamalar faqat shu qurilmada", "В демо-режиме настройки только на этом устройстве", "In demo mode settings stay on this device", "Demo modunda ayarlar yalnızca bu cihazda", "في الوضع التجريبي تبقى الإعدادات على هذا الجهاز", "En modo demo los ajustes quedan en este dispositivo"],

  // ---- appearance: style picker and adaptation axes (the style names style_<id> come from the bot's i18n catalog) ----
  set_style: ["Uslub", "Стиль", "Style", "Stil", "النمط", "Estilo"],
  style_soon: ["Tez orada", "Скоро", "Soon", "Yakında", "قريبًا", "Pronto"],
  set_contrast: ["Kontrast", "Контраст", "Contrast", "Kontrast", "التباين", "Contraste"],
  contrast_normal: ["Oddiy", "Обычный", "Normal", "Standart", "عادي", "Normal"],
  contrast_high: ["Yuqori", "Высокий", "High", "Yüksek", "مرتفع", "Alto"],
  set_density: ["Zichlik", "Плотность", "Density", "Yoğunluk", "الكثافة", "Densidad"],
  density_comfortable: ["Keng", "Свободно", "Comfortable", "Rahat", "مريح", "Cómoda"],
  density_compact: ["Ixcham", "Компактно", "Compact", "Sıkı", "مضغوط", "Compacta"],
  set_lite: ["Yengil rejim", "Лёгкий режим", "Lite mode", "Hafif mod", "الوضع الخفيف", "Modo ligero"],
  lite_auto: ["Avto", "Авто", "Auto", "Otomatik", "تلقائي", "Auto"],
  lite_on: ["Yoqilgan", "Вкл.", "On", "Açık", "تشغيل", "Sí"],
  lite_off: ["Oʻchiq", "Выкл.", "Off", "Kapalı", "إيقاف", "No"],
  set_fs: ["Matn oʻlchami", "Размер текста", "Text size", "Yazı boyutu", "حجم النص", "Tamaño del texto"],
} as const satisfies Record<string, Row>;

export type MsKey = keyof typeof ROWS;
export const MS_KEYS = Object.keys(ROWS) as MsKey[];

/** Placeholders a key's text uses; every language must use the same set (checked by tests). */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => m[1]))].sort();
}

const COLS: Record<Exclude<Lang, "uz-cyrl">, number> = { "uz-latn": 0, ru: 1, en: 2, tr: 3, ar: 4, es: 5 };

function build(): Record<Lang, Record<MsKey, string>> {
  const out = {} as Record<Lang, Record<MsKey, string>>;
  for (const lang of Object.keys(COLS) as Array<keyof typeof COLS>) {
    out[lang] = {} as Record<MsKey, string>;
    for (const k of MS_KEYS) out[lang][k] = (ROWS[k] as Row)[COLS[lang]];
  }
  out["uz-cyrl"] = {} as Record<MsKey, string>;
  // "QQS" (VAT) is protected from transliteration as a three-letter code; write it in Cyrillic explicitly
  for (const k of MS_KEYS) out["uz-cyrl"][k] = latinToCyrillic(out["uz-latn"][k]).replace(/QQS/g, "ҚҚС");
  return out;
}

export const MS: Record<Lang, Record<MsKey, string>> = build();

/** Text of a Mini App string with `{name}` placeholders replaced. Falls back to English. */
export function ms(lang: Lang, key: MsKey, params?: Record<string, string | number>): string {
  const raw = MS[lang]?.[key] ?? MS.en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{([A-Za-z_]+)\}/g, (w, n: string) => (Object.hasOwn(params, n) ? String(params[n]) : w));
}
