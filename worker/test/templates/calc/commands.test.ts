import { afterEach, describe, expect, it } from "vitest";
import { DICTIONARIES, LANGS, LANG_LABELS } from "../../../src/i18n";
import { en } from "../../../src/i18n/en";
import { setLogSink } from "../../../src/log";
import { PRO_LIMITS } from "../../../src/pro";
import { parseVatArgs, pickVariable } from "../../../src/templates/calc/commands";
import { CalcFakeDb, NOW, callback, command, harness, makePro, seedRates, setUser, text } from "./util";

afterEach(() => setLogSink(null));

const kb = (c: { payload: Record<string, unknown> }) => JSON.stringify(c.payload.reply_markup ?? {});

describe("/start", () => {
  it("first time: greets by (escaped) name and offers the 7 languages", async () => {
    const h = harness();
    const m = text("/start");
    (m.message.from as { first_name: string }).first_name = "<b>Ali</b>";
    await h.send(m);
    const sent = h.sent("sendMessage")[0];
    expect(String(sent.payload.text)).toContain("Hi, &lt;b&gt;Ali&lt;/b&gt;!");
    const markup = kb(sent);
    for (const l of LANGS) expect(markup).toContain(`"callback_data":"ls:${l}"`);
    for (const l of LANGS) expect(markup).toContain(LANG_LABELS[l]);
  });

  it("registers the user in bot_users (private chats only)", async () => {
    const h = harness();
    await h.send(text("/start"));
    expect(h.db.users.has("b1:5")).toBe(true);
    await h.send(text("/start", { from: 8, type: "group" }));
    expect(h.db.users.has("b1:8")).toBe(false);
  });

  it("with a stored language: no keyboard, text in that language", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "ru" });
    await h.send(text("/start"));
    const sent = h.sent("sendMessage")[0];
    expect(String(sent.payload.text)).toContain("Привет, Ali!");
    expect(sent.payload.reply_markup).toBeUndefined();
  });

  it("language choice from /start stores it and swaps the message to the start text", async () => {
    const h = harness();
    await h.send(callback("ls:ru"));
    expect(h.db.userRows.get("b1:5")?.lang).toBe("ru");
    const e = h.sent("editMessageText")[0];
    expect(String(e.payload.text)).toContain("Привет, Ali!");
    expect(h.sent("answerCallbackQuery")).toHaveLength(1);
  });

  it("start in a group does not register or show the keyboard", async () => {
    const h = harness();
    await h.send(text("/start@tezcalc_bot", { type: "group" }));
    expect(h.sent("sendMessage")[0].payload.reply_markup).toBeUndefined();
  });
});

describe("/help, /privacy, /terms", () => {
  it("/help in the user's language", async () => {
    const h = harness();
    await h.send(text("/help", { lang: "es" }));
    expect(h.texts()).toEqual([DICTIONARIES.es.help]);
  });

  it("/privacy and /terms; support contact appended (escaped) when configured", async () => {
    const h = harness({ config: { supportContact: "@tez_support" } });
    await h.send(text("/privacy"));
    await h.send(text("/terms"));
    expect(h.texts()[0]).toBe(en.privacy + "\n\n💬 @tez_support");
    expect(h.texts()[1]).toBe(en.terms + "\n\n💬 @tez_support");
  });

  it("without a contact they are the dictionary text", async () => {
    const h = harness();
    await h.send(text("/privacy"));
    expect(h.texts()).toEqual([en.privacy]);
  });
});

describe("/lang", () => {
  it("shows 7 buttons and stores the choice", async () => {
    const h = harness();
    await h.send(text("/lang"));
    const markup = kb(h.sent("sendMessage")[0]);
    for (const l of LANGS) expect(markup).toContain(`"callback_data":"lg:${l}"`);
    await h.send(callback("lg:ar"));
    expect(h.db.userRows.get("b1:5")?.lang).toBe("ar");
    expect(String(h.sent("editMessageText")[0].payload.text)).toBe(DICTIONARIES.ar.lang_changed);
  });

  it("an unknown language code changes nothing", async () => {
    const h = harness();
    await h.send(callback("lg:xx"));
    expect(h.db.userRows.size).toBe(0);
    expect(h.sent("editMessageText")).toHaveLength(0);
  });

  it("choosing uz-cyrl is stored as uz-cyrl", async () => {
    const h = harness();
    await h.send(callback("lg:uz-cyrl"));
    expect(h.db.userRows.get("b1:5")?.lang).toBe("uz-cyrl");
  });

  it("a language change is one write and no read", async () => {
    const h = harness();
    h.db.resetCounters();
    await h.send(callback("lg:tr"));
    expect(h.db.writes).toBe(1);
    expect(h.db.reads).toBe(0);
  });

  it("the next message uses the new language", async () => {
    const h = harness();
    await h.send(callback("lg:tr"));
    await h.send(text("1/0"));
    expect(h.texts()).toEqual([DICTIONARIES.tr.err_div0]);
  });
});

describe("/settings", () => {
  it("renders the current values and the toggle buttons", async () => {
    const h = harness();
    await h.send(text("/settings"));
    const m = h.sent("sendMessage")[0];
    expect(String(m.payload.text)).toContain(en.settings_title);
    const markup = kb(m);
    expect(markup).toContain("st:a:deg");
    expect(markup).toContain("st:a:rad");
    for (const d of [6, 12, 20]) expect(markup).toContain(`st:d:${d}`);
    expect(markup).toContain("st:h:1");
    expect(markup).toContain("✓ 📐 deg");
  });

  it("angle callback saves and edits the message", async () => {
    const h = harness();
    await h.send(callback("st:a:rad"));
    expect(h.db.userRows.get("b1:5")?.angle).toBe("rad");
    const e = h.sent("editMessageText")[0];
    expect(kb(e)).toContain("✓ rad");
    expect(String(e.payload.text)).toContain("<b>rad</b>");
  });

  it.each([6, 20])("digits %i", async (d) => {
    const h = harness();
    await h.send(callback(`st:d:${d}`));
    expect(h.db.userRows.get("b1:5")?.digits).toBe(d);
  });

  it("history toggle on and off", async () => {
    const h = harness();
    await h.send(callback("st:h:1"));
    expect(h.db.userRows.get("b1:5")?.keep_history).toBe(1);
    expect(kb(h.sent("editMessageText")[0])).toContain("st:h:0");
    await h.send(callback("st:h:0"));
    expect(h.db.userRows.get("b1:5")?.keep_history).toBe(0);
  });

  it("choosing the value that is already set writes nothing and edits nothing", async () => {
    const h = harness();
    h.db.resetCounters();
    await h.send(callback("st:d:12"));
    expect(h.db.writes).toBe(0);
    expect(h.sent("editMessageText")).toHaveLength(0);
    expect(h.sent("answerCallbackQuery")).toHaveLength(1);
  });

  it("an invalid value is ignored", async () => {
    const h = harness();
    await h.send(callback("st:d:7"));
    await h.send(callback("st:a:xyz"));
    await h.send(callback("st:h:2"));
    expect(h.db.userRows.size).toBe(0);
  });

  it("settings take effect on the next calculation", async () => {
    const h = harness();
    await h.send(callback("st:d:6"));
    h.calls.length = 0;
    await h.send(text("1/3"));
    expect(h.texts()[0]).toContain("<code>0.333333</code>");
  });

  it("a save failure is reported to the user, not swallowed", async () => {
    const h = harness();
    setLogSink(() => {});
    h.db.failSql = /INSERT INTO users/;
    await h.send(callback("st:a:rad"));
    expect(h.sent("answerCallbackQuery")[0].payload.show_alert).toBe(true);
  });

  it("'message is not modified' from Telegram is not an error", async () => {
    const h = harness({ failMethods: ["editMessageText"] });
    setLogSink(() => {});
    await h.send(callback("st:a:rad"));
    expect(h.sent("editMessageText")).toHaveLength(1);
  });

  it("buttons are localized (history state)", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "ru", keep_history: 1 });
    await h.send(text("/settings"));
    expect(kb(h.sent("sendMessage")[0])).toContain(DICTIONARIES.ru.btn_on);
  });
});

describe("/history", () => {
  const fill = (h: ReturnType<typeof harness>, n: number, uid = 5) => {
    for (let i = 1; i <= n; i++) h.db.history.push({ id: i, bot_id: "b1", user_id: uid, expr: `${i}+1`, result: String(i + 1), ts: NOW });
  };

  it("empty history", async () => {
    const h = harness();
    await h.send(text("/history"));
    expect(h.texts()).toEqual([en.history_empty]);
  });

  it("free users see the last freeHistory entries, newest first", async () => {
    const h = harness();
    fill(h, 50);
    await h.send(text("/history"));
    const t = h.texts()[0];
    const lines = t.split("\n").slice(1);
    expect(lines).toHaveLength(PRO_LIMITS.freeHistory);
    expect(lines[0]).toContain("<code>50+1</code>");
    expect(t).not.toContain("<code>29+1</code>");
  });

  it("Pro users see more (bounded by the message size)", async () => {
    const h = harness();
    makePro(h.db);
    fill(h, 100);
    await h.send(text("/history"));
    const t = h.texts()[0];
    expect(t.split("\n").length - 1).toBeGreaterThan(PRO_LIMITS.freeHistory);
    expect(t.length).toBeLessThanOrEqual(4096);
  });

  it("a Pro user with 1000 entries still gets one valid message", async () => {
    const h = harness();
    makePro(h.db);
    fill(h, 1000);
    await h.send(text("/history"));
    expect(h.texts()[0].length).toBeLessThanOrEqual(4096);
  });

  it("an expired Pro counts as free", async () => {
    const h = harness();
    makePro(h.db, 5, "b1", NOW - 10);
    fill(h, 50);
    await h.send(text("/history"));
    expect(h.texts()[0].split("\n").length - 1).toBe(PRO_LIMITS.freeHistory);
  });

  it("only the caller's own rows", async () => {
    const h = harness();
    fill(h, 3, 99);
    await h.send(text("/history"));
    expect(h.texts()).toEqual([en.history_empty]);
  });

  it("/history clear deletes the caller's rows", async () => {
    const h = harness();
    fill(h, 3);
    fill(h, 2, 99);
    await h.send(text("/history clear"));
    expect(h.texts()).toEqual([en.history_cleared]);
    expect(h.db.history.every((r) => r.user_id === 99)).toBe(true);
  });

  it("is not available in groups", async () => {
    const h = harness();
    fill(h, 3);
    await h.send(text("/history", { type: "group" }));
    expect(h.calls).toHaveLength(0);
  });

  it("escapes the stored expression", async () => {
    const h = harness();
    h.db.history.push({ id: 1, bot_id: "b1", user_id: 5, expr: "<script>&", result: "1", ts: NOW });
    await h.send(text("/history"));
    expect(h.texts()[0]).toContain("&lt;script&gt;&amp;");
  });
});

describe("/convert", () => {
  it("without arguments shows the help", async () => {
    const h = harness();
    await h.send(text("/convert"));
    expect(h.texts()).toEqual([en.converter_help]);
  });

  it("units", async () => {
    const h = harness();
    await h.send(text("/convert 100 km mi"));
    expect(h.texts()[0]).toMatch(/<code>100 km<\/code> = <code>62\.13\d* mi<\/code>/);
  });

  it("currencies use the stored table", async () => {
    const h = harness();
    seedRates(h.db);
    await h.send(text("/convert 50 USD UZS"));
    expect(h.texts()[0]).toContain("<code>600,000 UZS</code>");
  });

  it("missing rates -> err_no_rate", async () => {
    const h = harness();
    await h.send(text("/convert 50 USD EUR"));
    expect(h.texts()[0]).toContain("USD/EUR");
  });

  it("garbage falls back to the help", async () => {
    const h = harness();
    await h.send(text("/convert hello world"));
    expect(h.texts()).toEqual([en.converter_help]);
  });

  it("incompatible units", async () => {
    const h = harness();
    await h.send(text("/convert 5 kg km"));
    expect(h.texts()).toEqual([en.err_units_mismatch]);
  });
});

describe("/loan", () => {
  it("shows monthly payment, total, interest and a 6-month schedule for free users", async () => {
    const h = harness();
    await h.send(text("/loan 50000 18 24"));
    const t = h.texts()[0];
    expect(t).toContain(`<b>${en.loan_label_monthly}</b>`);
    expect(t).toContain(`<b>${en.loan_label_total}</b>`);
    expect(t).toContain(`<b>${en.loan_label_interest}</b>`);
    expect(t).toContain("First 6 months");
    expect(t.match(/<code>\d+\. /g)).toHaveLength(6);
    expect(t).toContain("2,496.21");
  });

  it("Pro users get up to 12 months", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/loan 50000 18 24"));
    expect(h.texts()[0]).toContain("First 12 months");
    expect(h.texts()[0].match(/<code>\d+\. /g)).toHaveLength(12);
  });

  it("a short loan shows all its months", async () => {
    const h = harness();
    await h.send(text("/loan 1000 12 3"));
    expect(h.texts()[0]).toContain("First 3 months");
  });

  it("differentiated loans show first -> last payment", async () => {
    const h = harness();
    await h.send(text("/loan 12000 12 12 diff"));
    expect(h.texts()[0]).toContain("1,120.00 → 1,010.00");
  });

  it("years suffix", async () => {
    const h = harness();
    await h.send(text("/loan 10000 10 2y"));
    expect(h.texts()[0]).toContain("First 6 months");
  });

  it.each(["", "abc", "1000", "-5 10 10", "1000 5000 12", "1000 10 0"])("invalid arguments %j show the help", async (args) => {
    const h = harness();
    await h.send(text(`/loan ${args}`.trim()));
    expect(h.texts()).toEqual([en.loan_help]);
  });

  it("zero rate loans are fine", async () => {
    const h = harness();
    await h.send(text("/loan 1200 0 12"));
    expect(h.texts()[0]).toContain("100.00");
  });

  it("is localized (ru)", async () => {
    const h = harness();
    await h.send(text("/loan 50000 18 24", { lang: "ru" }));
    expect(h.texts()[0]).toContain(DICTIONARIES.ru.loan_label_total);
  });

  it("Arabic output isolates the numbers", async () => {
    const h = harness();
    await h.send(text("/loan 50000 18 24", { lang: "ar" }));
    expect(h.texts()[0]).toContain("<code>⁦");
  });
});

describe("/vat", () => {
  it("adds the default 12% VAT", async () => {
    const h = harness();
    await h.send(text("/vat 1000000"));
    const t = h.texts()[0];
    expect(t).toContain("<code>1,000,000.00</code>");
    expect(t).toContain("(12%)");
    expect(t).toContain("<code>120,000.00</code>");
    expect(t).toContain("<code>1,120,000.00</code>");
  });

  it("removes VAT from a gross amount", async () => {
    const h = harness();
    await h.send(text("/vat 1120000 remove"));
    const t = h.texts()[0];
    expect(t).toContain("<code>1,000,000.00</code>");
    expect(t).toContain("<code>120,000.00</code>");
  });

  it("custom rate (with or without %)", async () => {
    const h = harness();
    await h.send(text("/vat 1000 15"));
    await h.send(text("/vat 1000 15%"));
    expect(h.texts()[0]).toContain("<code>150.00</code>");
    expect(h.texts()[1]).toContain("<code>150.00</code>");
  });

  it("decimal comma", async () => {
    const h = harness();
    await h.send(text("/vat 99,5"));
    expect(h.texts()[0]).toContain("<code>99.50</code>");
  });

  it.each(["", "abc", "1 2 3", "100 add remove x", "100 2000"])("invalid %j shows the help", async (args) => {
    const h = harness();
    await h.send(text(`/vat ${args}`.trim()));
    expect(h.texts()).toEqual([en.vat_help]);
  });

  it("parseVatArgs", () => {
    expect(parseVatArgs("100")?.mode).toBe("add");
    expect(parseVatArgs("100 remove")?.mode).toBe("remove");
    expect(parseVatArgs("100 15")?.rate?.toString()).toBe("15");
    expect(parseVatArgs("nope")).toBeNull();
    expect(parseVatArgs("")).toBeNull();
  });
});

describe("/widget", () => {
  it("sends the widget with the documented parameters", async () => {
    const h = harness();
    await h.send(text("/widget"));
    const w = h.sent("sendWidget");
    expect(w).toHaveLength(1);
    expect(w[0].payload.chat_id).toBe(5);
    expect(typeof w[0].payload.html).toBe("string");
    expect(w[0].payload.allow_queries).toBe(true);
    expect(w[0].payload.protect_content).toBe(true);
    expect(String(w[0].payload.caption).length).toBeLessThanOrEqual(1024);
    expect(h.sent("sendMessage")).toHaveLength(0);
  });

  it("is not Pro-gated", async () => {
    const h = harness();
    await h.send(text("/widget"));
    expect(h.texts()).not.toContain(en.pro_required);
  });

  it("in a group it explains that widgets are private-only", async () => {
    const h = harness();
    await h.send(text("/widget@tezcalc_bot", { type: "group" }));
    expect(h.sent("sendWidget")).toHaveLength(0);
    expect(h.texts()).toEqual([en.widget_unavailable]);
  });

  it("a Telegram failure is reported, not thrown", async () => {
    const h = harness({ failMethods: ["sendWidget"] });
    setLogSink(() => {});
    await h.send(text("/widget"));
    expect(h.texts()).toEqual([en.widget_unavailable]);
  });

  it("uses the user's language for the widget", async () => {
    const h = harness();
    await h.send(text("/widget", { lang: "ru" }));
    const en1 = harness();
    await en1.send(text("/widget"));
    expect(h.sent("sendWidget")[0].payload.caption).not.toBe(en1.sent("sendWidget")[0].payload.caption);
  });
});

describe("/app", () => {
  it("private: web_app button with ?b=<botId>", async () => {
    const h = harness();
    await h.send(text("/app"));
    const m = h.sent("sendMessage")[0];
    expect(kb(m)).toContain('"web_app":{"url":"https://calc.test/app/?b=b1"}');
  });

  it("uses miniAppPath from the config", async () => {
    const h = harness({ config: { miniAppPath: "/calc/" } });
    await h.send(text("/app"));
    expect(kb(h.sent("sendMessage")[0])).toContain("https://calc.test/calc/?b=b1");
  });

  it("group: a t.me link instead (web_app buttons are private-only)", async () => {
    const h = harness();
    await h.send(text("/app", { type: "group" }));
    const markup = kb(h.sent("sendMessage")[0]);
    expect(markup).not.toContain("web_app");
    expect(markup).toContain("https://t.me/tezcalc_bot");
  });

  it("without PUBLIC_BASE_URL: generic error", async () => {
    const h = harness({ appConfig: { publicBaseUrl: null } });
    setLogSink(() => {});
    await h.send(text("/app"));
    expect(h.texts()).toEqual([en.err_generic]);
  });
});

describe("Pro-only symbolic commands", () => {
  it.each(["solve", "derive", "integrate"])("/%s without Pro -> pro_required", async (cmd) => {
    const h = harness();
    await h.send(text(`/${cmd} x^2`));
    expect(h.texts()).toEqual([en.pro_required]);
  });

  it.each(["solve", "derive", "integrate"])("/%s without arguments shows the help (free)", async (cmd) => {
    const h = harness();
    await h.send(text(`/${cmd}`));
    expect(h.texts()).toEqual([en.symbolic_help]);
  });

  it("/solve an equation with steps", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/solve x^2-5x+6=0"));
    const t = h.texts()[0];
    expect(t).toContain("x = 2, x = 3");
    expect(t).toContain("1. <b>");
  });

  it("/solve plain arithmetic explains the order of operations", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/solve 2+3*4"));
    expect(h.texts()[0]).toContain("<code>14</code>");
  });

  it("/derive", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/derive x^3"));
    const t = h.texts()[0];
    expect(t).toContain("3x²");
    expect(t).toContain("d/dx");
  });

  it("/integrate", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/integrate 2x"));
    const t = h.texts()[0];
    expect(t).toContain("+ C");
    expect(t).toContain("∫");
  });

  it("picks another variable letter", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/derive t^2"));
    expect(h.texts()[0]).toContain("d/dt");
  });

  it("an unsupported problem", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/solve sin(x)=x^5+x+1"));
    expect([en.err_unsupported, en.err_parse, en.err_too_complex]).toContain(h.texts()[0]);
  });

  it("garbage input -> err_parse", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/derive ((("));
    expect(h.texts()).toEqual([en.err_parse]);
  });

  it("too_complex offers the Mini App button (private chats)", async () => {
    const h = harness();
    makePro(h.db);
    const big = Array.from({ length: 120 }, (_, i) => `x^${i + 2}`).join("+");
    await h.send(text(`/derive ${big}`));
    const m = h.sent("sendMessage")[0];
    expect(m.payload.text).toBe(en.err_too_complex);
    expect(kb(m)).toContain("https://calc.test/app/?b=b1");
  });

  it("steps are HTML-safe and capped to one message", async () => {
    const h = harness();
    makePro(h.db);
    const sum = Array.from({ length: 30 }, (_, i) => `sin(${i + 1}x)`).join("+");
    await h.send(text(`/derive ${sum}`));
    expect(h.texts()[0].length).toBeLessThanOrEqual(4096);
  });

  it("Arabic: the expression is isolated", async () => {
    const h = harness();
    makePro(h.db);
    await h.send(text("/derive x^2", { lang: "ar" }));
    expect(h.texts()[0]).toContain("⁦");
  });

  it("pickVariable", () => {
    expect(pickVariable("x^2")).toBe("x");
    expect(pickVariable("3t+1")).toBe("t");
    expect(pickVariable("e^x")).toBe("x");
    expect(pickVariable("sin(2)")).toBe("x");
    expect(pickVariable("2+3")).toBe("x");
  });
});

describe("/deleteme", () => {
  it("asks for confirmation with delete / cancel buttons", async () => {
    const h = harness();
    await h.send(text("/deleteme"));
    const m = h.sent("sendMessage")[0];
    expect(m.payload.text).toBe(en.deleteme_confirm);
    expect(kb(m)).toContain("dm:y");
    expect(kb(m)).toContain("dm:n");
  });

  it("confirm: wipes history, settings and bot_users; keeps the Pro period and payments", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "ru", angle: "rad", digits: 20, keep_history: 1, pro_until: NOW + 1000 });
    h.db.history.push({ id: 1, bot_id: "b1", user_id: 5, expr: "1+1", result: "2", ts: NOW });
    h.db.history.push({ id: 2, bot_id: "b1", user_id: 6, expr: "9+9", result: "18", ts: NOW });
    h.db.users.add("b1:5");
    h.db.payments.set("c1", { charge_id: "c1", bot_id: "b1", user_id: 5, stars: 150, period_end: NOW + 1000, refunded: 0, seq: 1 } as never);
    await h.send(callback("dm:y"));
    const row = h.db.userRows.get("b1:5")!;
    expect(row).toMatchObject({ lang: null, angle: "deg", digits: 12, keep_history: 0, pro_until: NOW + 1000 });
    expect(h.db.history.map((r) => r.user_id)).toEqual([6]);
    expect(h.db.users.has("b1:5")).toBe(false);
    expect(h.db.payments.has("c1")).toBe(true);
    const e = String(h.sent("editMessageText")[0].payload.text);
    expect(e).toContain(DICTIONARIES.ru.deleteme_done);
    expect(e).toContain(DICTIONARIES.ru.deleteme_payments_note);
  });

  it("confirm also clears the in-memory ans", async () => {
    const h = harness();
    await h.send(text("6*7"));
    await h.send(callback("dm:y"));
    await h.send(text("ans"));
    expect(h.texts().at(-1)).toContain("don't know what");
  });

  it("cancel deletes nothing", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    h.db.history.push({ id: 1, bot_id: "b1", user_id: 5, expr: "1+1", result: "2", ts: NOW });
    await h.send(callback("dm:n"));
    expect(h.db.history).toHaveLength(1);
    expect(h.db.userRows.get("b1:5")?.keep_history).toBe(1);
    expect(String(h.sent("editMessageText")[0].payload.text)).toBe(en.btn_cancel);
  });

  it("a failure is reported to the user", async () => {
    const h = harness();
    setLogSink(() => {});
    h.db.failSql = /DELETE FROM history/;
    await h.send(callback("dm:y"));
    expect(h.sent("answerCallbackQuery")[0].payload.show_alert).toBe(true);
    expect(h.sent("editMessageText")).toHaveLength(0);
  });

  it("deleting a user who never had a row is harmless", async () => {
    const h = harness();
    await h.send(callback("dm:y", { from: 4242 }));
    expect(h.db.userRows.size).toBe(0);
    expect(h.sent("editMessageText")).toHaveLength(1);
  });
});

describe("Pro integration (installPro is wired)", () => {
  it("/pro shows the price and a buy button", async () => {
    const h = harness({ config: { proStars: 99 } });
    await h.send(text("/pro"));
    expect(h.texts()[0]).toContain("99 ⭐");
    expect(kb(h.sent("sendMessage")[0])).toContain("pro:buy");
  });

  it("the buy button creates a 30-day XTR subscription link", async () => {
    const h = harness();
    await h.send(callback("pro:buy"));
    const c = h.sent("createInvoiceLink")[0].payload;
    expect(c.currency).toBe("XTR");
    expect(c.subscription_period).toBe(2_592_000);
    expect(c.payload).toBe("pro:b1:5:v1");
  });

  it("pre_checkout_query is answered even when the user is rate limited", async () => {
    const h = harness({ rateLimited: () => true });
    await h.send({
      pre_checkout_query: { id: "pq", from: { id: 5, is_bot: false, first_name: "A", language_code: "en" }, currency: "XTR", total_amount: 150, invoice_payload: "pro:b1:5:v1" },
    });
    expect(h.sent("answerPreCheckoutQuery")).toHaveLength(1);
    expect(h.sent("answerPreCheckoutQuery")[0].payload.ok).toBe(true);
  });

  it("a successful payment grants Pro, which unlocks /solve", async () => {
    const h = harness();
    await h.send({
      message: {
        message_id: 2,
        date: NOW,
        chat: { id: 5, type: "private", first_name: "A" },
        from: { id: 5, is_bot: false, first_name: "A", language_code: "en" },
        successful_payment: {
          currency: "XTR",
          total_amount: 150,
          invoice_payload: "pro:b1:5:v1",
          telegram_payment_charge_id: "chg1",
          provider_payment_charge_id: "",
          subscription_expiration_date: NOW + 2_592_000,
          is_recurring: true,
          is_first_recurring: true,
        },
      },
    });
    expect(h.db.payments.has("chg1")).toBe(true);
    h.calls.length = 0;
    await h.send(text("/solve x^2-4=0"));
    expect(h.texts()[0]).toContain("x = −2, x = 2");
  });

  it("/paysupport answers", async () => {
    const h = harness();
    await h.send(text("/paysupport"));
    expect(h.texts()[0]).toContain(en.paysupport);
  });

  it("a payment message is never treated as chit-chat", async () => {
    const h = harness({ rateLimited: () => true });
    await h.send({
      message: {
        message_id: 2,
        date: NOW,
        chat: { id: 5, type: "private", first_name: "A" },
        from: { id: 5, is_bot: false, first_name: "A" },
        successful_payment: { currency: "XTR", total_amount: 150, invoice_payload: "bad", telegram_payment_charge_id: "c9", provider_payment_charge_id: "" },
      },
    });
    expect(h.texts().every((t) => !t.includes(en.rate_limited))).toBe(true);
  });
});

describe("DB budget of commands", () => {
  it("/help = 1 read, 0 writes", async () => {
    const h = harness();
    h.db.resetCounters();
    await h.send(text("/help"));
    expect([h.db.reads, h.db.writes]).toEqual([1, 0]);
  });

  it("/start = 1 read, 1 write", async () => {
    const h = harness();
    h.db.resetCounters();
    await h.send(text("/start"));
    expect([h.db.reads, h.db.writes]).toEqual([1, 1]);
  });

  it("/solve (Pro) = 2 reads, 0 writes", async () => {
    const h = harness();
    makePro(h.db);
    h.db.resetCounters();
    await h.send(text("/solve 2+2"));
    expect([h.db.reads, h.db.writes]).toEqual([2, 0]);
  });

  it("a calculation with history on = 1 read, 1 write", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    h.db.resetCounters();
    await h.send(text("2+2"));
    expect([h.db.reads, h.db.writes]).toEqual([1, 1]);
  });

  it("history is pruned on every 25th insert only", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    h.db.resetCounters();
    for (let i = 0; i < 25; i++) await h.send(text(`${i}+1`));
    expect(h.db.writes).toBe(26);
  });

  it("CalcFakeDb is a FakeDb", () => {
    expect(new CalcFakeDb().bots.size).toBe(0);
  });
});
