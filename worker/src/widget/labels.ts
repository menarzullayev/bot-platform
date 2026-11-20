import type { Lang } from "../env";

// Short strings used INSIDE the widget (and the chat caption). Only the keys listed in
// INNER_KEYS are embedded into the widget HTML (one language per build); `caption` is for
// the sendWidget `caption` parameter.
export interface WidgetLabels {
  t: string; // history placeholder (shown while the history is empty)
  c: string; // copy button
  cd: string; // copied
  b: string; // send-to-bot button
  bd: string; // sent
  bf: string; // not sent (request refused or failed)
  z: string; // division by zero
  s: string; // syntax error
  m: string; // math error (domain / overflow)
  dg: string; // degrees mode label
  rd: string; // radians mode label
  a: string; // aria-labels, '|'-separated, for the keys: backspace, AC, =, +/-, x^2, sqrt
  caption: string; // message caption (outside the widget)
}

export const WIDGET_LABELS: Record<Lang, WidgetLabels> = {
  "uz-latn": {
    t: "Tarix", c: "Nusxa", cd: "Nusxalandi", b: "Botga", bd: "Yuborildi", bf: "Yuborilmadi",
    z: "0 ga bo'lib bo'lmaydi", s: "Ifoda xato", m: "Hisoblab bo'lmadi", dg: "DEG", rd: "RAD",
    a: "O'chirish|Tozalash|Teng|Ishora|Kvadrat|Ildiz",
    caption: "Kalkulyator",
  },
  "uz-cyrl": {
    t: "Тарих", c: "Нусха", cd: "Нусхаланди", b: "Ботга", bd: "Юборилди", bf: "Юборилмади",
    z: "0 га бўлиб бўлмайди", s: "Ифода хато", m: "Ҳисоблаб бўлмади", dg: "ГРД", rd: "РАД",
    a: "Ўчириш|Тозалаш|Тенг|Ишора|Квадрат|Илдиз",
    caption: "Калькулятор",
  },
  ru: {
    t: "История", c: "Копия", cd: "Скопировано", b: "Боту", bd: "Отправлено", bf: "Не отправлено",
    z: "Деление на 0", s: "Ошибка в выражении", m: "Невозможно вычислить", dg: "ГРАД", rd: "РАД",
    a: "Удалить|Очистить|Равно|Знак|Квадрат|Корень",
    caption: "Калькулятор",
  },
  en: {
    t: "History", c: "Copy", cd: "Copied", b: "To bot", bd: "Sent", bf: "Not sent",
    z: "Division by 0", s: "Syntax error", m: "Math error", dg: "DEG", rd: "RAD",
    a: "Delete|Clear|Equals|Sign|Square|Root",
    caption: "Calculator",
  },
  tr: {
    t: "Geçmiş", c: "Kopyala", cd: "Kopyalandı", b: "Bota", bd: "Gönderildi", bf: "Gönderilemedi",
    z: "0'a bölünemez", s: "İfade hatalı", m: "Hesaplanamadı", dg: "DER", rd: "RAD",
    a: "Sil|Temizle|Eşittir|İşaret|Kare|Kök",
    caption: "Hesap makinesi",
  },
  ar: {
    t: "السجل", c: "نسخ", cd: "تم النسخ", b: "للبوت", bd: "أُرسل", bf: "لم يُرسل",
    z: "القسمة على صفر", s: "خطأ في التعبير", m: "تعذّر الحساب", dg: "درجة", rd: "راديان",
    a: "حذف|مسح|يساوي|الإشارة|مربع|جذر",
    caption: "الآلة الحاسبة",
  },
  es: {
    t: "Historial", c: "Copiar", cd: "Copiado", b: "Al bot", bd: "Enviado", bf: "No enviado",
    z: "División por 0", s: "Error de sintaxis", m: "Error matemático", dg: "GRD", rd: "RAD",
    a: "Borrar|Borrar todo|Igual|Signo|Cuadrado|Raíz",
    caption: "Calculadora",
  },
};

/** Keys embedded into the widget HTML (everything except the caption). */
export const INNER_KEYS = ["t", "c", "cd", "b", "bd", "bf", "z", "s", "m", "dg", "rd", "a"] as const;
