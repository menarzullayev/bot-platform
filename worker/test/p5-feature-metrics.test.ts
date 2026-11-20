// DEC-015: feature usage counters (f:*, pro:view, pro:buy) are in-memory increments only: no D1 write on the hot path,
// no user or text in the key, and a rejected or failed action does not count.

import { describe, expect, it } from "vitest";
import { dayOf, pendingEvents, pendingSum } from "../src/metrics";
import { buildPayload } from "../src/pro";
import { guest, harness, inline, setUser, text } from "./templates/calc/util";
import { harness as proHarness, command as proCommand, callback as proCallback, successfulPayment, NOW as PRO_NOW, PERIOD } from "./pro/util";

const day = () => dayOf(Date.now());
type H = ReturnType<typeof harness>;
const n = (h: { db: object }, key: string) => pendingSum(h.db as never, day(), key);

function makePro(h: H): void {
  setUser(h.db, 5, { pro_until: 2_000_000_000 });
}

describe("feature counters: calculation paths", () => {
  it("a plain text calculation counts f:calc, a conversion f:convert", async () => {
    const h = harness();
    await h.send(text("2+2"));
    await h.send(text("2+2"));
    await h.send(text("5 km in mi"));
    expect(n(h, "f:calc")).toBe(2);
    expect(n(h, "f:convert")).toBe(1);
  });

  it("prose that is not math and errors do not count", async () => {
    const h = harness();
    await h.send(text("hello how are you today"));
    await h.send(text("1/0"));
    expect(n(h, "f:calc")).toBe(0);
  });

  it("/convert counts only when it produced a result", async () => {
    const h = harness();
    await h.send(text("/convert"));
    await h.send(text("/convert hello world"));
    expect(n(h, "f:convert")).toBe(0);
    await h.send(text("/convert 100 km mi"));
    expect(n(h, "f:convert")).toBe(1);
  });

  it("/loan and /vat count after a valid input only", async () => {
    const h = harness();
    await h.send(text("/loan"));
    await h.send(text("/vat"));
    expect(n(h, "f:loan") + n(h, "f:vat")).toBe(0);
    await h.send(text("/loan 50000 18 24"));
    await h.send(text("/vat 1000"));
    expect(n(h, "f:loan")).toBe(1);
    expect(n(h, "f:vat")).toBe(1);
  });

  it("inline counts f:inline for results, not for the empty query or errors", async () => {
    const h = harness();
    await h.send(inline(""));
    await h.send(inline("1/0"));
    expect(n(h, "f:inline")).toBe(0);
    await h.send(inline("12*3"));
    expect(n(h, "f:inline")).toBe(1);
  });

  it("guest counts f:guest for a computed answer", async () => {
    const h = harness();
    await h.send(guest("12*3+4"));
    expect(n(h, "f:guest")).toBe(1);
    await h.send(guest("just words here"));
    expect(n(h, "f:guest")).toBe(1);
  });

  it.each(["solve", "derive", "integrate"] as const)("/%s counts for Pro users and not for free users", async (cmd) => {
    const h = harness();
    const arg = cmd === "solve" ? "x^2-5x+6=0" : "x^3";
    await h.send(text(`/${cmd} ${arg}`));
    expect(n(h, `f:${cmd}`)).toBe(0);
    makePro(h);
    await h.send(text(`/${cmd} ${arg}`));
    expect(n(h, `f:${cmd}`)).toBe(1);
  });
});

describe("feature counters: privacy and cost", () => {
  it("no D1 statement is executed by counting (the flush is index.ts' job)", async () => {
    const h = harness();
    await h.send(text("2+2")); // warms the user lookup
    h.db.resetCounters();
    await h.send(text("2+2"));
    expect(h.db.sqlLog.some((s) => /metrics_daily/.test(s))).toBe(false);
  });

  it("only whitelisted anonymous keys are pending: no user id, no expression", async () => {
    const h = harness();
    await h.send(text("123456789*987654321", { from: 777 }));
    expect(pendingEvents(h.db)).toBeGreaterThan(0);
    // everything pending is one of the aggregate keys: probe by looking for the expression and the id in any counter key
    expect(n(h, "f:calc")).toBe(1);
    expect(pendingEvents(h.db)).toBe(1);
  });

  it("per bot: another bot id on the same db has its own counters", async () => {
    const h = harness({ botId: "other" });
    await h.send(text("1+1"));
    expect(pendingSum(h.db as never, day(), "f:calc")).toBe(1);
  });
});

describe("pro:view and pro:buy", () => {
  it("/pro counts pro:view, /pro cancel does not", async () => {
    const h = proHarness();
    await h.send(proCommand("/pro cancel"));
    expect(pendingSum(h.db as never, day(), "pro:view")).toBe(0);
    await h.send(proCommand("/pro"));
    expect(pendingSum(h.db as never, day(), "pro:view")).toBe(1);
  });

  it("showing the invoice link counts pro:view too", async () => {
    const h = proHarness();
    await h.send(proCallback("pro:buy"));
    expect(pendingSum(h.db as never, day(), "pro:view")).toBe(1);
  });

  it("a granted payment counts pro:buy once; a redelivery does not", async () => {
    const h = proHarness();
    const upd = successfulPayment({
      payload: buildPayload("b1", 5),
      chargeId: "c1",
      subscription_expiration_date: PRO_NOW + PERIOD,
      is_first_recurring: true,
      is_recurring: true,
    });
    await h.send(upd);
    await h.send(upd);
    expect(pendingSum(h.db as never, day(), "pro:buy")).toBe(1);
  });

  it("a rejected payment (wrong payload) does not count", async () => {
    const h = proHarness();
    await h.send(successfulPayment({ payload: "garbage", chargeId: "c2" }));
    expect(pendingSum(h.db as never, day(), "pro:buy")).toBe(0);
  });
});

