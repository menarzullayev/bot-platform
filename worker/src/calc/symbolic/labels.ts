// Step labels in the seven bot languages and the Telegram-HTML renderer.
// The Cyrillic Uzbek texts are written by hand (not transliterated).

import type { Lang } from "../../i18n/types";
import { wrapForRtl } from "../../i18n";
import type { Step, StepRule } from "./types";

export interface StepLabel {
  /** Short rule name. */
  name: string;
  /** Sentence template; placeholders: {before} {after} {note}. */
  tpl: string;
}

type Row = [StepLabel, StepLabel, StepLabel, StepLabel, StepLabel, StepLabel, StepLabel];
const ORDER: readonly Lang[] = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"];

const l = (name: string, tpl: string): StepLabel => ({ name, tpl });
const BA = "{before} = {after}";
const BR = "{before} → {after}";

const ROWS: Record<StepRule, Row> = {
  const: [
    l("Doimiy", `Doimiyning hosilasi nolga teng, integrali c·x: ${BA}`),
    l("Доимий", `Доимийнинг ҳосиласи нолга тенг, интеграли c·x: ${BA}`),
    l("Константа", `Производная константы равна нулю, интеграл равен c·x: ${BA}`),
    l("Constant", `A constant differentiates to 0 and integrates to c·x: ${BA}`),
    l("Sabit", `Sabitin türevi sıfır, integrali c·x'tir: ${BA}`),
    l("ثابت", `مشتقة الثابت تساوي صفرًا وتكامله c·x: ${BA}`),
    l("Constante", `La derivada de una constante es 0 y su integral es c·x: ${BA}`),
  ],
  power: [
    l("Daraja qoidasi", `Daraja qoidasini qoʻllaymiz: ${BA}`),
    l("Даража қоидаси", `Даража қоидасини қўллаймиз: ${BA}`),
    l("Степенное правило", `Применяем правило степени: ${BA}`),
    l("Power rule", `Apply the power rule: ${BA}`),
    l("Kuvvet kuralı", `Kuvvet kuralını uygularız: ${BA}`),
    l("قاعدة القوة", `نطبّق قاعدة القوة: ${BA}`),
    l("Regla de la potencia", `Aplicamos la regla de la potencia: ${BA}`),
  ],
  const_mult: [
    l("Doimiy koʻpaytuvchi", `Doimiy koʻpaytuvchi tashqarida qoladi: ${BA}`),
    l("Доимий кўпайтувчи", `Доимий кўпайтувчи ташқарида қолади: ${BA}`),
    l("Постоянный множитель", `Постоянный множитель выносим за знак: ${BA}`),
    l("Constant multiple", `Constant factors stay outside: ${BA}`),
    l("Sabit çarpan", `Sabit çarpan dışarıda kalır: ${BA}`),
    l("عامل ثابت", `يبقى العامل الثابت خارجًا: ${BA}`),
    l("Factor constante", `El factor constante queda fuera: ${BA}`),
  ],
  sum: [
    l("Yigʻindi qoidasi", `Har bir hadni alohida hisoblaymiz: ${BA}`),
    l("Йиғинди қоидаси", `Ҳар бир ҳадни алоҳида ҳисоблаймиз: ${BA}`),
    l("Правило суммы", `Каждое слагаемое считаем отдельно: ${BA}`),
    l("Sum rule", `Handle each term separately: ${BA}`),
    l("Toplam kuralı", `Her terimi ayrı ayrı işleriz: ${BA}`),
    l("قاعدة المجموع", `نعالج كل حد على حدة: ${BA}`),
    l("Regla de la suma", `Tratamos cada término por separado: ${BA}`),
  ],
  product: [
    l("Koʻpaytma qoidasi", `(fg)′ = f′g + fg′: ${BA}`),
    l("Кўпайтма қоидаси", `(fg)′ = f′g + fg′: ${BA}`),
    l("Правило произведения", `(fg)′ = f′g + fg′: ${BA}`),
    l("Product rule", `(fg)′ = f′g + fg′: ${BA}`),
    l("Çarpım kuralı", `(fg)′ = f′g + fg′: ${BA}`),
    l("قاعدة الضرب", `نطبّق قاعدة الضرب: ${BA}`),
    l("Regla del producto", `(fg)′ = f′g + fg′: ${BA}`),
  ],
  quotient: [
    l("Boʻlinma qoidasi", `(f/g)′ = (f′g − fg′)/g²: ${BA}`),
    l("Бўлинма қоидаси", `(f/g)′ = (f′g − fg′)/g²: ${BA}`),
    l("Правило частного", `(f/g)′ = (f′g − fg′)/g²: ${BA}`),
    l("Quotient rule", `(f/g)′ = (f′g − fg′)/g²: ${BA}`),
    l("Bölüm kuralı", `(f/g)′ = (f′g − fg′)/g²: ${BA}`),
    l("قاعدة القسمة", `نطبّق قاعدة القسمة: ${BA}`),
    l("Regla del cociente", `(f/g)′ = (f′g − fg′)/g²: ${BA}`),
  ],
  chain: [
    l("Murakkab funksiya", `Tashqi hosila ichki hosilaga koʻpayadi ({note}): ${BA}`),
    l("Мураккаб функция", `Ташқи ҳосила ички ҳосилага кўпаяди ({note}): ${BA}`),
    l("Цепное правило", `Производная внешней на производную внутренней ({note}): ${BA}`),
    l("Chain rule", `Outer derivative times inner derivative ({note}): ${BA}`),
    l("Zincir kuralı", `Dış türev çarpı iç türev ({note}): ${BA}`),
    l("قاعدة السلسلة", `مشتقة الخارجية × مشتقة الداخلية ({note}): ${BA}`),
    l("Regla de la cadena", `Derivada externa por derivada interna ({note}): ${BA}`),
  ],
  exp: [
    l("Koʻrsatkichli funksiya", `Koʻrsatkichli funksiya qoidasi: ${BA}`),
    l("Кўрсаткичли функция", `Кўрсаткичли функция қоидаси: ${BA}`),
    l("Показательная функция", `Правило показательной функции: ${BA}`),
    l("Exponential rule", `Rule for the exponential function: ${BA}`),
    l("Üstel fonksiyon", `Üstel fonksiyon kuralı: ${BA}`),
    l("الدالة الأسية", `قاعدة الدالة الأسية: ${BA}`),
    l("Función exponencial", `Regla de la función exponencial: ${BA}`),
  ],
  log: [
    l("Logarifm qoidasi", `Logarifm qoidasini qoʻllaymiz: ${BA}`),
    l("Логарифм қоидаси", `Логарифм қоидасини қўллаймиз: ${BA}`),
    l("Правило логарифма", `Применяем правило логарифма: ${BA}`),
    l("Logarithm rule", `Apply the logarithm rule: ${BA}`),
    l("Logaritma kuralı", `Logaritma kuralını uygularız: ${BA}`),
    l("قاعدة اللوغاريتم", `نطبّق قاعدة اللوغاريتم: ${BA}`),
    l("Regla del logaritmo", `Aplicamos la regla del logaritmo: ${BA}`),
  ],
  trig: [
    l("Trigonometrik qoida", `Trigonometrik jadvaldan foydalanamiz: ${BA}`),
    l("Тригонометрик қоида", `Тригонометрик жадвалдан фойдаланамиз: ${BA}`),
    l("Тригонометрическое правило", `Используем тригонометрическую таблицу: ${BA}`),
    l("Trigonometric rule", `Use the trigonometric table: ${BA}`),
    l("Trigonometrik kural", `Trigonometrik tabloyu kullanırız: ${BA}`),
    l("قاعدة مثلثية", `نستخدم جدول الدوال المثلثية: ${BA}`),
    l("Regla trigonométrica", `Usamos la tabla trigonométrica: ${BA}`),
  ],
  invtrig: [
    l("Teskari trigonometrik qoida", `Teskari trigonometrik jadvaldan foydalanamiz: ${BA}`),
    l("Тескари тригонометрик қоида", `Тескари тригонометрик жадвалдан фойдаланамиз: ${BA}`),
    l("Обратная тригонометрия", `Используем таблицу обратных тригонометрических функций: ${BA}`),
    l("Inverse trigonometric rule", `Use the inverse trigonometric table: ${BA}`),
    l("Ters trigonometrik kural", `Ters trigonometrik tabloyu kullanırız: ${BA}`),
    l("قاعدة مثلثية عكسية", `نستخدم جدول الدوال المثلثية العكسية: ${BA}`),
    l("Regla trigonométrica inversa", `Usamos la tabla de funciones trigonométricas inversas: ${BA}`),
  ],
  hyper: [
    l("Giperbolik qoida", `Giperbolik funksiyalar jadvalidan foydalanamiz: ${BA}`),
    l("Гиперболик қоида", `Гиперболик функциялар жадвалидан фойдаланамиз: ${BA}`),
    l("Гиперболическое правило", `Используем таблицу гиперболических функций: ${BA}`),
    l("Hyperbolic rule", `Use the hyperbolic function table: ${BA}`),
    l("Hiperbolik kural", `Hiperbolik fonksiyon tablosunu kullanırız: ${BA}`),
    l("قاعدة زائدية", `نستخدم جدول الدوال الزائدية: ${BA}`),
    l("Regla hiperbólica", `Usamos la tabla de funciones hiperbólicas: ${BA}`),
  ],
  abs: [
    l("Modul", `Modul qoidasi: ${BA}`),
    l("Модуль", `Модуль қоидаси: ${BA}`),
    l("Модуль", `Правило для модуля: ${BA}`),
    l("Absolute value", `Rule for the absolute value: ${BA}`),
    l("Mutlak değer", `Mutlak değer kuralı: ${BA}`),
    l("القيمة المطلقة", `قاعدة القيمة المطلقة: ${BA}`),
    l("Valor absoluto", `Regla del valor absoluto: ${BA}`),
  ],
  simplify: [
    l("Soddalashtirish", `Soddalashtiramiz: ${BA}`),
    l("Соддалаштириш", `Соддалаштирамиз: ${BA}`),
    l("Упрощение", `Упрощаем: ${BA}`),
    l("Simplify", `Simplify: ${BA}`),
    l("Sadeleştirme", `Sadeleştiririz: ${BA}`),
    l("تبسيط", `نبسّط: ${BA}`),
    l("Simplificar", `Simplificamos: ${BA}`),
  ],
  table: [
    l("Jadval integrali", `Jadvaldagi integraldan foydalanamiz: ${BA}`),
    l("Жадвал интеграли", `Жадвалдаги интегралдан фойдаланамиз: ${BA}`),
    l("Табличный интеграл", `Берём табличный интеграл: ${BA}`),
    l("Table integral", `Standard integral from the table: ${BA}`),
    l("Tablo integrali", `Tablodaki integrali kullanırız: ${BA}`),
    l("تكامل جدولي", `نستخدم التكامل الجدولي: ${BA}`),
    l("Integral de tabla", `Usamos la integral de la tabla: ${BA}`),
  ],
  substitute: [
    l("Almashtirish", `{note} almashtirish qilamiz: ${BA}`),
    l("Алмаштириш", `{note} алмаштириш қиламиз: ${BA}`),
    l("Замена переменной", `Делаем замену {note}: ${BA}`),
    l("Substitution", `Substitute {note}: ${BA}`),
    l("Değişken değiştirme", `{note} dönüşümünü yaparız: ${BA}`),
    l("التعويض", `نعوّض {note}: ${BA}`),
    l("Sustitución", `Sustituimos {note}: ${BA}`),
  ],
  by_parts: [
    l("Boʻlaklab integrallash", `Boʻlaklab integrallaymiz ({note}): ${BA}`),
    l("Бўлаклаб интеграллаш", `Бўлаклаб интеграллаймиз ({note}): ${BA}`),
    l("Интегрирование по частям", `Интегрируем по частям ({note}): ${BA}`),
    l("Integration by parts", `Integrate by parts ({note}): ${BA}`),
    l("Kısmi integrasyon", `Kısmi integrasyon uygularız ({note}): ${BA}`),
    l("التكامل بالتجزئة", `نطبّق التكامل بالتجزئة ({note}): ${BA}`),
    l("Integración por partes", `Integramos por partes ({note}): ${BA}`),
  ],
  partial_fractions: [
    l("Oddiy kasrlarga yoyish", `Oddiy kasrlarga ajratamiz: ${BA}`),
    l("Оддий касрларга ёйиш", `Оддий касрларга ажратамиз: ${BA}`),
    l("Простейшие дроби", `Раскладываем на простейшие дроби: ${BA}`),
    l("Partial fractions", `Split into simple fractions: ${BA}`),
    l("Basit kesirler", `Basit kesirlere ayırırız: ${BA}`),
    l("الكسور الجزئية", `نفكّك إلى كسور جزئية: ${BA}`),
    l("Fracciones parciales", `Descomponemos en fracciones parciales: ${BA}`),
  ],
  rewrite: [
    l("Standart koʻrinish", `Hammasini bir tomonga oʻtkazamiz: ${BR}`),
    l("Стандарт кўриниш", `Ҳаммасини бир томонга ўтказамиз: ${BR}`),
    l("Стандартный вид", `Переносим всё в одну часть: ${BR}`),
    l("Standard form", `Move everything to one side: ${BR}`),
    l("Standart biçim", `Her şeyi bir tarafa alırız: ${BR}`),
    l("الصيغة القياسية", `ننقل كل شيء إلى طرف واحد: ${BR}`),
    l("Forma estándar", `Pasamos todo a un lado: ${BR}`),
  ],
  linear: [
    l("Chiziqli tenglama", `Nomaʼlumni ajratamiz: ${BR}`),
    l("Чизиқли тенглама", `Номаълумни ажратамиз: ${BR}`),
    l("Линейное уравнение", `Выражаем неизвестное: ${BR}`),
    l("Linear equation", `Isolate the unknown: ${BR}`),
    l("Doğrusal denklem", `Bilinmeyeni yalnız bırakırız: ${BR}`),
    l("معادلة خطية", `نعزل المجهول: ${BR}`),
    l("Ecuación lineal", `Despejamos la incógnita: ${BR}`),
  ],
  discriminant: [
    l("Diskriminant", `Diskriminantni topamiz ({note}): ${BR}`),
    l("Дискриминант", `Дискриминантни топамиз ({note}): ${BR}`),
    l("Дискриминант", `Находим дискриминант ({note}): ${BR}`),
    l("Discriminant", `Find the discriminant ({note}): ${BR}`),
    l("Diskriminant", `Diskriminantı buluruz ({note}): ${BR}`),
    l("المميّز", `نحسب المميّز ({note}): ${BR}`),
    l("Discriminante", `Calculamos el discriminante ({note}): ${BR}`),
  ],
  root: [
    l("Ildizlar", `Ildizlarni topamiz: ${BR}`),
    l("Илдизлар", `Илдизларни топамиз: ${BR}`),
    l("Корни", `Находим корни: ${BR}`),
    l("Roots", `Find the roots: ${BR}`),
    l("Kökler", `Kökleri buluruz: ${BR}`),
    l("الجذور", `نجد الجذور: ${BR}`),
    l("Raíces", `Hallamos las raíces: ${BR}`),
  ],
  cubic: [
    l("Kubik tenglama", `Kardano formulasidan foydalanamiz ({note}): ${BR}`),
    l("Кубик тенглама", `Кардано формуласидан фойдаланамиз ({note}): ${BR}`),
    l("Кубическое уравнение", `Применяем формулы Кардано ({note}): ${BR}`),
    l("Cubic equation", `Use Cardano's formulas ({note}): ${BR}`),
    l("Kübik denklem", `Cardano formüllerini kullanırız ({note}): ${BR}`),
    l("معادلة تكعيبية", `نستخدم صيغ كاردانو ({note}): ${BR}`),
    l("Ecuación cúbica", `Usamos las fórmulas de Cardano ({note}): ${BR}`),
  ],
  cramer: [
    l("Kramer usuli", `Aniqlovchini hisoblaymiz: ${BA}`),
    l("Крамер усули", `Аниқловчини ҳисоблаймиз: ${BA}`),
    l("Правило Крамера", `Считаем определитель: ${BA}`),
    l("Cramer's rule", `Compute the determinant: ${BA}`),
    l("Cramer kuralı", `Determinantı hesaplarız: ${BA}`),
    l("قاعدة كرامر", `نحسب المحدّد: ${BA}`),
    l("Regla de Cramer", `Calculamos el determinante: ${BA}`),
  ],
  check: [
    l("Tekshirish", `Qaytarib qoʻyib tekshiramiz: ${BA}`),
    l("Текшириш", `Қайтариб қўйиб текширамиз: ${BA}`),
    l("Проверка", `Подставляем обратно: ${BA}`),
    l("Check", `Substitute back: ${BA}`),
    l("Kontrol", `Geri yerine koyarız: ${BA}`),
    l("التحقق", `نعوّض للتحقق: ${BA}`),
    l("Comprobación", `Sustituimos para comprobar: ${BA}`),
  ],
  arith: [
    l("Arifmetika", `Navbatdagi amal: ${BR}`),
    l("Арифметика", `Навбатдаги амал: ${BR}`),
    l("Арифметика", `Следующее действие: ${BR}`),
    l("Arithmetic", `Next operation: ${BR}`),
    l("Aritmetik", `Sıradaki işlem: ${BR}`),
    l("حساب", `العملية التالية: ${BR}`),
    l("Aritmética", `Siguiente operación: ${BR}`),
  ],
};

export const STEP_LABELS: Record<StepRule, Record<Lang, StepLabel>> = Object.fromEntries(
  (Object.keys(ROWS) as StepRule[]).map((rule) => [rule, Object.fromEntries(ORDER.map((lang, i) => [lang, ROWS[rule][i]]))]),
) as Record<StepRule, Record<Lang, StepLabel>>;

export function stepLabel(rule: StepRule, lang: Lang): StepLabel {
  const row = Object.hasOwn(STEP_LABELS, rule) ? STEP_LABELS[rule] : undefined;
  if (row === undefined) return { name: String(rule), tpl: BR };
  return row[lang] ?? row.en;
}

/** Escape text for Telegram HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Render steps as Telegram HTML (<b>, <code>). Every piece of text is escaped; math fragments are isolated with
 * LRI/PDI for right-to-left languages.
 */
export function renderSteps(steps: readonly Step[], lang: Lang): string {
  const out: string[] = [];
  steps.forEach((s, i) => {
    const lab = stepLabel(s.rule, lang);
    const code = (t: string): string => `<code>${escapeHtml(wrapForRtl(lang, t))}</code>`;
    let tpl = lab.tpl;
    const usesNote = tpl.includes("{note}");
    if (s.note === undefined || s.note === "") tpl = tpl.replace(/\s*\(\{note\}\)/g, "").replace(/\{note\}/g, "");
    const body = tpl
      .split(/(\{before\}|\{after\}|\{note\})/)
      .map((part) => {
        if (part === "{before}") return code(s.before);
        if (part === "{after}") return code(s.after);
        if (part === "{note}") return code(s.note ?? "");
        return escapeHtml(part);
      })
      .join("");
    const extra = !usesNote && s.note !== undefined && s.note !== "" ? `\n${code(s.note)}` : "";
    out.push(`${i + 1}. <b>${escapeHtml(lab.name)}</b>\n${body}${extra}`);
  });
  return out.join("\n\n");
}
