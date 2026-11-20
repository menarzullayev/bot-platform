import { describe, expect, it } from "vitest";
import {
  PRO_LIMITS,
  buildPayload,
  checkPaymentPayload,
  computePeriodEnd,
  getEntitlement,
  grantPeriod,
  historyLimit,
  lastPayments,
  parsePayload,
  parseProConfig,
  processSuccessfulPayment,
  resolvePeriodEnd,
  revokeByCharge,
} from "../../src/pro";
import { FakeDb } from "../helpers";
import { DAY, NOW, PERIOD } from "./util";

const grant = (db: FakeDb, o: Partial<Parameters<typeof grantPeriod>[1]> = {}) =>
  grantPeriod(db, {
    botId: "b1",
    userId: 5,
    chargeId: "ch1",
    stars: 150,
    periodEnd: NOW + PERIOD,
    payload: buildPayload("b1", 5),
    kind: "subscription_first",
    now: NOW,
    ...o,
  });

describe("config", () => {
  it("defaults to 150 and validates 1..10000 integers", () => {
    expect(parseProConfig(undefined)).toEqual({ proStars: 150 });
    expect(parseProConfig({})).toEqual({ proStars: 150 });
    expect(parseProConfig({ proStars: 1 }).proStars).toBe(1);
    expect(parseProConfig({ proStars: 10000 }).proStars).toBe(10000);
    for (const bad of [0, -5, 10001, 1.5, "150", NaN, true]) {
      expect(() => parseProConfig({ proStars: bad })).toThrow(/proStars/);
    }
  });

  it("limits are history-only: no daily quota exists", () => {
    expect(PRO_LIMITS).toEqual({ freeHistory: 20, proHistory: 1000 });
    expect(Object.keys(PRO_LIMITS).some((k) => /daily|day|perDay/i.test(k))).toBe(false);
    expect(historyLimit(false)).toBe(20);
    expect(historyLimit(true)).toBe(1000);
  });
});

describe("payload", () => {
  it("round-trips and stays within 128 bytes", () => {
    const p = buildPayload("b".repeat(32), 9_007_199_254_740);
    expect(Buffer.byteLength(p)).toBeLessThanOrEqual(128);
    expect(parsePayload(buildPayload("b1", 5))).toEqual({ botId: "b1", userId: 5 });
  });

  it("rejects malformed payloads", () => {
    for (const bad of ["", "pro:b1:5", "pro:b1:5:v2", "xyz:b1:5:v1", "pro::5:v1", "pro:b1:-5:v1", "pro:b1:0:v1", "pro:b1:5:v1:x", null, 7, undefined]) {
      expect(parsePayload(bad)).toBeNull();
    }
  });

  it("checkPaymentPayload: wrong bot, wrong user, currency and amount are rejected", () => {
    const ok = { payload: buildPayload("b1", 5), currency: "XTR", totalAmount: 150 };
    expect(checkPaymentPayload(ok, "b1", 5)).toEqual({ ok: true });
    expect(checkPaymentPayload(ok, "b2", 5)).toEqual({ ok: false, reason: "bot_mismatch" });
    expect(checkPaymentPayload(ok, "b1", 6)).toEqual({ ok: false, reason: "user_mismatch" });
    expect(checkPaymentPayload({ ...ok, currency: "USD" }, "b1", 5)).toEqual({ ok: false, reason: "currency" });
    expect(checkPaymentPayload({ ...ok, totalAmount: 0 }, "b1", 5)).toEqual({ ok: false, reason: "amount" });
    expect(checkPaymentPayload({ ...ok, totalAmount: 10001 }, "b1", 5)).toEqual({ ok: false, reason: "amount" });
    expect(checkPaymentPayload({ ...ok, payload: "junk" }, "b1", 5)).toEqual({ ok: false, reason: "payload_shape" });
  });
});

describe("entitlement", () => {
  it("unknown user is not Pro", async () => {
    expect(await getEntitlement(new FakeDb(), "b1", 5, NOW)).toEqual({ isPro: false, proUntil: 0 });
  });

  it("grantPeriod creates the users row and grants", async () => {
    const db = new FakeDb();
    const r = await grant(db);
    expect(r).toEqual({ granted: true, proUntil: NOW + PERIOD });
    expect(await getEntitlement(db, "b1", 5, NOW)).toEqual({ isPro: true, proUntil: NOW + PERIOD });
    expect((await getEntitlement(db, "b1", 5, NOW + PERIOD)).isPro).toBe(false); // boundary: until is exclusive
  });

  it("is idempotent: replaying a charge does not extend twice", async () => {
    const db = new FakeDb();
    await grant(db);
    const again = await grant(db, { periodEnd: NOW + 2 * PERIOD, now: NOW + 5 });
    expect(again.granted).toBe(false);
    expect(again.proUntil).toBe(NOW + PERIOD);
    expect(db.payments.size).toBe(1);
  });

  it("computePeriodEnd: extends from the end while active, from now once lapsed", () => {
    expect(computePeriodEnd(NOW + 10 * DAY, NOW)).toBe(NOW + 10 * DAY + PERIOD);
    expect(computePeriodEnd(NOW - 10 * DAY, NOW)).toBe(NOW + PERIOD);
    expect(computePeriodEnd(0, NOW)).toBe(NOW + PERIOD);
  });

  it("resolvePeriodEnd trusts a sane Telegram expiry, ignores absurd ones", () => {
    expect(resolvePeriodEnd(NOW + PERIOD, 0, NOW)).toBe(NOW + PERIOD);
    expect(resolvePeriodEnd(NOW - 1, 0, NOW)).toBe(NOW + PERIOD);
    expect(resolvePeriodEnd(NOW + 10 * PERIOD, 0, NOW)).toBe(NOW + PERIOD);
    expect(resolvePeriodEnd("x", NOW + DAY, NOW)).toBe(NOW + DAY + PERIOD);
  });

  it("lastPayments returns newest first, capped", async () => {
    const db = new FakeDb();
    for (let i = 1; i <= 5; i++) await grant(db, { chargeId: `c${i}`, now: NOW + i, periodEnd: NOW + PERIOD + i });
    const rows = await lastPayments(db, "b1", 5, 3);
    expect(rows.map((r) => r.charge_id)).toEqual(["c5", "c4", "c3"]);
  });
});

describe("refund / revoke", () => {
  it("revokeByCharge removes Pro and marks the payment refunded", async () => {
    const db = new FakeDb();
    await grant(db);
    const r = await revokeByCharge(db, { botId: "b1", chargeId: "ch1", now: NOW + 100 });
    expect(r).toEqual({ found: true, userId: 5, proUntil: 0 });
    expect(db.payments.get("ch1")!.refunded).toBe(1);
    expect((await getEntitlement(db, "b1", 5, NOW + 100)).isPro).toBe(false);
  });

  it("refunding one of two payments keeps the other period", async () => {
    const db = new FakeDb();
    await grant(db, { chargeId: "old", periodEnd: NOW + 5 * DAY });
    await grant(db, { chargeId: "new", periodEnd: NOW + 5 * DAY + PERIOD, kind: "subscription_renewal" });
    const r = await revokeByCharge(db, { botId: "b1", chargeId: "new", now: NOW });
    expect(r.proUntil).toBe(NOW + 5 * DAY);
    expect((await getEntitlement(db, "b1", 5, NOW)).isPro).toBe(true);
  });

  it("revoke is idempotent and unknown charges are reported", async () => {
    const db = new FakeDb();
    await grant(db);
    await revokeByCharge(db, { botId: "b1", chargeId: "ch1", now: NOW });
    const again = await revokeByCharge(db, { botId: "b1", chargeId: "ch1", now: NOW });
    expect(again.proUntil).toBe(0);
    expect(await revokeByCharge(db, { botId: "b1", chargeId: "nope", now: NOW })).toEqual({ found: false });
  });

  it("a refunded charge replayed later does not re-grant Pro", async () => {
    const db = new FakeDb();
    await grant(db);
    await revokeByCharge(db, { botId: "b1", chargeId: "ch1", now: NOW });
    const replay = await grant(db, { now: NOW + 10 });
    expect(replay.granted).toBe(false);
    expect(replay.proUntil).toBe(0);
  });
});

describe("two-bot isolation", () => {
  it("same user, different bots: separate entitlements; a bot cannot revoke another bot's charge", async () => {
    const db = new FakeDb();
    await grant(db, { botId: "b1", chargeId: "c-b1" });
    expect((await getEntitlement(db, "b2", 5, NOW)).isPro).toBe(false);
    await grant(db, { botId: "b2", chargeId: "c-b2", periodEnd: NOW + 2 * PERIOD });
    expect((await getEntitlement(db, "b1", 5, NOW)).proUntil).toBe(NOW + PERIOD);
    expect((await getEntitlement(db, "b2", 5, NOW)).proUntil).toBe(NOW + 2 * PERIOD);

    expect(await revokeByCharge(db, { botId: "b2", chargeId: "c-b1", now: NOW })).toEqual({ found: false });
    expect(db.payments.get("c-b1")!.refunded).toBe(0);
    await revokeByCharge(db, { botId: "b1", chargeId: "c-b1", now: NOW });
    expect((await getEntitlement(db, "b1", 5, NOW)).isPro).toBe(false);
    expect((await getEntitlement(db, "b2", 5, NOW)).isPro).toBe(true);
    expect(await lastPayments(db, "b1", 5)).toHaveLength(1);
  });
});

describe("processSuccessfulPayment", () => {
  const sp = (o: Record<string, unknown> = {}) => ({
    currency: "XTR",
    total_amount: 150,
    invoice_payload: buildPayload("b1", 5),
    telegram_payment_charge_id: "ch1",
    ...o,
  });

  it("first payment uses Telegram's expiry; renewal extends and is flagged", async () => {
    const db = new FakeDb();
    const a = await processSuccessfulPayment(db, {
      botId: "b1", fromId: 5, now: NOW,
      sp: sp({ is_recurring: true, is_first_recurring: true, subscription_expiration_date: NOW + PERIOD }),
    });
    expect(a).toMatchObject({ ok: true, granted: true, renewal: false, kind: "subscription_first", proUntil: NOW + PERIOD });
    const later = NOW + PERIOD;
    const b = await processSuccessfulPayment(db, {
      botId: "b1", fromId: 5, now: later,
      sp: sp({ telegram_payment_charge_id: "ch2", is_recurring: true, subscription_expiration_date: later + PERIOD }),
    });
    expect(b).toMatchObject({ ok: true, granted: true, renewal: true, kind: "subscription_renewal", proUntil: later + PERIOD });
  });

  it("without an expiry date the period extends from the end of active Pro", async () => {
    const db = new FakeDb();
    await processSuccessfulPayment(db, { botId: "b1", fromId: 5, now: NOW, sp: sp() });
    const r = await processSuccessfulPayment(db, {
      botId: "b1", fromId: 5, now: NOW + 10 * DAY, sp: sp({ telegram_payment_charge_id: "ch2" }),
    });
    expect(r).toMatchObject({ ok: true, proUntil: NOW + 2 * PERIOD });
  });

  it("without an expiry date a lapsed Pro restarts from now", async () => {
    const db = new FakeDb();
    await processSuccessfulPayment(db, { botId: "b1", fromId: 5, now: NOW, sp: sp() });
    const later = NOW + PERIOD + 20 * DAY;
    const r = await processSuccessfulPayment(db, { botId: "b1", fromId: 5, now: later, sp: sp({ telegram_payment_charge_id: "ch2" }) });
    expect(r).toMatchObject({ ok: true, proUntil: later + PERIOD });
  });

  it("rejects mismatching payloads without touching the DB", async () => {
    const db = new FakeDb();
    for (const bad of [
      sp({ invoice_payload: buildPayload("b2", 5) }),
      sp({ invoice_payload: buildPayload("b1", 6) }),
      sp({ invoice_payload: "junk" }),
      sp({ currency: "USD" }),
      sp({ telegram_payment_charge_id: "" }),
    ]) {
      const r = await processSuccessfulPayment(db, { botId: "b1", fromId: 5, now: NOW, sp: bad });
      expect(r.ok).toBe(false);
    }
    expect(db.payments.size).toBe(0);
    expect(db.proUsers.size).toBe(0);
  });

  it("duplicate charge reports granted=false", async () => {
    const db = new FakeDb();
    await processSuccessfulPayment(db, { botId: "b1", fromId: 5, now: NOW, sp: sp() });
    const r = await processSuccessfulPayment(db, { botId: "b1", fromId: 5, now: NOW + 1, sp: sp() });
    expect(r).toMatchObject({ ok: true, granted: false, proUntil: NOW + PERIOD });
  });
});
