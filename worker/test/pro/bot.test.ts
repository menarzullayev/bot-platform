import { afterEach, describe, expect, it } from "vitest";
import { buildPayload, getEntitlement } from "../../src/pro";
import { setLogSink } from "../../src/log";
import { requirePro } from "../../src/templates/calc/pro";
import { en } from "../../src/i18n/en";
import { FakeDb } from "../helpers";
import { NOW, PERIOD, callback, command, harness, preCheckout, successfulPayment, user } from "./util";
import type { Context } from "grammy";

afterEach(() => setLogSink(null));

const texts = (h: ReturnType<typeof harness>) => h.sent("sendMessage").map((c) => String(c.payload.text));

describe("/pro", () => {
  it("shows title, features and price with a buy button for a free user", async () => {
    const h = harness({ proStars: 200 });
    await h.send(command("/pro"));
    const m = h.sent("sendMessage")[0];
    const text = String(m.payload.text);
    expect(text).toContain(en.pro_title);
    expect(text).toContain(en.pro_features);
    expect(text).toContain("200 ⭐");
    expect(JSON.stringify(m.payload.reply_markup)).toContain("pro:buy");
  });

  it("shows pro_active with the date (no buy button) for a Pro user", async () => {
    const h = harness();
    await h.send(successfulPayment({ payload: buildPayload("b1", 5), chargeId: "c1", subscription_expiration_date: NOW + PERIOD, is_first_recurring: true, is_recurring: true }));
    h.calls.length = 0;
    await h.send(command("/pro"));
    const m = h.sent("sendMessage")[0];
    expect(String(m.payload.text)).toContain(new Date((NOW + PERIOD) * 1000).toISOString().slice(0, 10));
    expect(m.payload.reply_markup).toBeUndefined();
  });

  it("/pro cancel sends the cancellation instructions", async () => {
    const h = harness();
    await h.send(command("/pro cancel"));
    expect(texts(h)).toEqual([en.pro_cancel_info]);
  });
});

describe("buy button -> createInvoiceLink", () => {
  it("creates a 30-day XTR subscription link with one price item, no provider token, and replies with a URL button", async () => {
    const h = harness({ proStars: 150 });
    await h.send(callback("pro:buy"));
    const c = h.sent("createInvoiceLink")[0].payload;
    expect(c.currency).toBe("XTR");
    expect(c.subscription_period).toBe(2592000);
    expect(c.payload).toBe("pro:b1:5:v1");
    expect(c.prices).toEqual([{ label: "⭐ TezCalc Pro", amount: 150 }]);
    expect(c.provider_token).toBeFalsy();
    expect(String(c.title).length).toBeLessThanOrEqual(32);
    expect(String(c.description).length).toBeLessThanOrEqual(255);
    expect(h.sent("sendInvoice")).toHaveLength(0);
    expect(JSON.stringify(h.sent("sendMessage")[0].payload.reply_markup)).toContain("https://t.me/$testslug");
  });

  it("an already-Pro user gets pro_already and no new invoice", async () => {
    const h = harness();
    await h.send(successfulPayment({ payload: buildPayload("b1", 5), chargeId: "c1" }));
    h.calls.length = 0;
    await h.send(callback("pro:buy"));
    expect(h.sent("createInvoiceLink")).toHaveLength(0);
    expect(texts(h)).toEqual([en.pro_already]);
  });

  it("API failure is logged and the user gets a generic error", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const h = harness({ failMethods: ["createInvoiceLink"] });
    await h.send(callback("pro:buy"));
    expect(texts(h)).toEqual([en.err_generic]);
    expect(lines.some((l) => l.includes("invoice link failed"))).toBe(true);
  });
});

describe("pre_checkout_query", () => {
  it("valid payload -> ok=true, without touching the DB", async () => {
    const db = new FakeDb();
    const h = harness({ db });
    const touched: string[] = [];
    const orig = db.prepare.bind(db);
    db.prepare = (sql: string) => (touched.push(sql), orig(sql));
    await h.send(preCheckout(buildPayload("b1", 5)));
    expect(h.sent("answerPreCheckoutQuery")[0].payload).toMatchObject({ pre_checkout_query_id: "pq1", ok: true });
    expect(touched).toHaveLength(0);
  });

  it.each([
    ["wrong shape", "garbage"],
    ["other bot", buildPayload("b2", 5)],
    ["other user", buildPayload("b1", 6)],
  ])("rejects %s with ok=false and an error message", async (_n, payload) => {
    const h = harness();
    await h.send(preCheckout(payload));
    const a = h.sent("answerPreCheckoutQuery");
    expect(a).toHaveLength(1);
    expect(a[0].payload.ok).toBe(false);
    expect(String(a[0].payload.error_message)).toBeTruthy();
  });

  it("rejects a non-XTR currency", async () => {
    const h = harness();
    await h.send(preCheckout(buildPayload("b1", 5), 5, { currency: "USD" }));
    expect(h.sent("answerPreCheckoutQuery")[0].payload.ok).toBe(false);
  });

  it("always answers, even when the payload is not even a string", async () => {
    const h = harness();
    await h.send(preCheckout(undefined));
    expect(h.sent("answerPreCheckoutQuery")).toHaveLength(1);
    expect(h.sent("answerPreCheckoutQuery")[0].payload.ok).toBe(false);
  });

  it("a failing answer call is swallowed and logged", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const h = harness({ failMethods: ["answerPreCheckoutQuery"] });
    await expect(h.send(preCheckout(buildPayload("b1", 5)))).resolves.toBeUndefined();
    expect(lines.some((l) => l.includes("answerPreCheckoutQuery failed"))).toBe(true);
  });
});

describe("successful_payment", () => {
  const first = (chargeId = "chg-1", extra: Record<string, unknown> = {}) =>
    successfulPayment({
      payload: buildPayload("b1", 5),
      chargeId,
      is_recurring: true,
      is_first_recurring: true,
      subscription_expiration_date: NOW + PERIOD,
      ...extra,
    });

  it("grants Pro, thanks the user and logs the charge id", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const h = harness();
    await h.send(first());
    expect(await getEntitlement(h.db, "b1", 5, NOW)).toEqual({ isPro: true, proUntil: NOW + PERIOD });
    expect(texts(h)).toEqual([en.pro_thanks]);
    const log = lines.find((l) => l.includes("payment granted"))!;
    expect(log).toContain("chg-1");
    expect(log).not.toContain("TESTTOKEN");
  });

  it("a redelivered update is not granted or thanked twice", async () => {
    const h = harness();
    await h.send(first());
    await h.send(first());
    expect(h.db.payments.size).toBe(1);
    expect((await getEntitlement(h.db, "b1", 5, NOW)).proUntil).toBe(NOW + PERIOD);
    expect(texts(h)).toHaveLength(1);
  });

  it("a monthly renewal extends Pro and reports the new date instead of repeating the thanks", async () => {
    const h = harness();
    await h.send(first());
    h.clock.now = NOW + PERIOD;
    h.calls.length = 0;
    await h.send(
      successfulPayment({
        payload: buildPayload("b1", 5),
        chargeId: "chg-2",
        is_recurring: true,
        subscription_expiration_date: NOW + 2 * PERIOD,
      }),
    );
    expect((await getEntitlement(h.db, "b1", 5, h.clock.now)).proUntil).toBe(NOW + 2 * PERIOD);
    expect(h.db.payments.get("chg-2")!.kind).toBe("subscription_renewal");
    expect(texts(h)[0]).toContain(new Date((NOW + 2 * PERIOD) * 1000).toISOString().slice(0, 10));
  });

  it("a payload for another bot or user grants nothing", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const h = harness();
    await h.send(successfulPayment({ payload: buildPayload("b2", 5), chargeId: "x1" }));
    await h.send(successfulPayment({ payload: buildPayload("b1", 99), chargeId: "x2" }));
    expect(h.db.payments.size).toBe(0);
    expect((await getEntitlement(h.db, "b1", 5, NOW)).isPro).toBe(false);
    expect(lines.filter((l) => l.includes("successful_payment rejected"))).toHaveLength(2);
    expect(lines.join()).toContain("x1");
  });

  it("two bots stay isolated end to end", async () => {
    const db = new FakeDb();
    const a = harness({ db, botId: "b1" });
    const b = harness({ db, botId: "b2" });
    await a.send(first("chg-a"));
    expect((await getEntitlement(db, "b1", 5, NOW)).isPro).toBe(true);
    expect((await getEntitlement(db, "b2", 5, NOW)).isPro).toBe(false);
    // b1's payload replayed against b2 is refused
    await b.send(first("chg-a2"));
    expect((await getEntitlement(db, "b2", 5, NOW)).isPro).toBe(false);
  });

  it("a DB failure is logged with the charge id and the user is pointed to /paysupport", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new FakeDb();
    const h = harness({ db });
    db.prepare = () => {
      throw new Error("d1 down");
    };
    await h.send(first("chg-lost"));
    expect(lines.some((l) => l.includes("processing failed") && l.includes("chg-lost"))).toBe(true);
    expect(texts(h)[0]).toContain("/paysupport");
  });
});

describe("/paysupport", () => {
  it("replies with the support text and no list when there are no payments", async () => {
    const h = harness();
    await h.send(command("/paysupport"));
    expect(texts(h)).toEqual([en.paysupport]);
  });

  it("appends the configured support contact (HTML-escaped)", async () => {
    const h = harness({ supportContact: "@support<b>" });
    await h.send(command("/paysupport"));
    const t = texts(h)[0];
    expect(t).toContain(en.paysupport);
    expect(t).toContain("💬 @support&lt;b&gt;");
  });

  it("lists the last 3 charge ids of this user only", async () => {
    const h = harness();
    for (let i = 1; i <= 4; i++) {
      h.clock.now = NOW + i;
      await h.send(successfulPayment({ payload: buildPayload("b1", 5), chargeId: `mine-${i}`, subscription_expiration_date: NOW + PERIOD + i }));
    }
    await h.send(successfulPayment({ payload: buildPayload("b1", 8), chargeId: "other-user" }, 8));
    h.calls.length = 0;
    await h.send(command("/paysupport"));
    const t = texts(h)[0];
    expect(t).toContain("mine-4");
    expect(t).toContain("mine-3");
    expect(t).toContain("mine-2");
    expect(t).not.toContain("mine-1");
    expect(t).not.toContain("other-user");
    expect(t.startsWith(en.paysupport)).toBe(true);
  });
});

describe("requirePro", () => {
  const fakeCtx = (id: number) => {
    const replies: string[] = [];
    const ctx = { from: user(id), reply: async (t: string) => void replies.push(t) } as unknown as Context;
    return { ctx, replies };
  };

  it("blocks free users with pro_required, lets Pro users through", async () => {
    const h = harness();
    await h.send(successfulPayment({ payload: buildPayload("b1", 5), chargeId: "c1" }));
    const deps = { botId: "b1", db: h.db, now: () => NOW };

    const free = fakeCtx(77);
    expect(await requirePro(free.ctx, "en", deps)).toBe(false);
    expect(free.replies).toEqual([en.pro_required]);
    expect(en.pro_required).toContain("/pro");

    const pro = fakeCtx(5);
    expect(await requirePro(pro.ctx, "en", deps)).toBe(true);
    expect(pro.replies).toEqual([]);
  });

  it("is scoped per bot", async () => {
    const h = harness();
    await h.send(successfulPayment({ payload: buildPayload("b1", 5), chargeId: "c1" }));
    const c = fakeCtx(5);
    expect(await requirePro(c.ctx, "en", { botId: "b2", db: h.db, now: () => NOW })).toBe(false);
  });
});
