import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleAdmin } from "../../src/admin";
import { getEntitlement, grantPeriod, buildPayload } from "../../src/pro";
import { setLogSink } from "../../src/log";
import { ADMIN, FakeDb, makeEnv, seedBot } from "../helpers";
import { NOW, PERIOD } from "./util";

const auth = { authorization: `Bearer ${ADMIN}` };
const TOKEN = "123456:TESTTOKENTESTTOKENTESTTOKENTEST12";
const req = (path: string, body?: unknown, headers: Record<string, string> = auth, method = "POST") =>
  new Request("https://w.test" + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

function tg(result: { ok: boolean; description?: string } | Error = { ok: true }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

let db: FakeDb;
const grant = (botId = "b1", userId = 5, chargeId = "ch1") =>
  grantPeriod(db, { botId, userId, chargeId, stars: 150, periodEnd: NOW + PERIOD, payload: buildPayload(botId, userId), kind: "subscription_first", now: NOW });
const run = (body: unknown, t = tg(), botId = "b1") =>
  handleAdmin(req(`/admin/bots/${botId}/refund`, body), makeEnv(), { db, fetchFn: t.fetchFn, now: () => NOW + 10 });

beforeEach(async () => {
  db = new FakeDb();
  await seedBot(db, { id: "b1" });
  await seedBot(db, { id: "b2" });
});
afterEach(() => setLogSink(null));

describe("POST /admin/bots/:id/refund", () => {
  it("requires the admin bearer token", async () => {
    const t = tg();
    const res = await handleAdmin(req("/admin/bots/b1/refund", { user_id: 5, charge_id: "ch1" }, {}), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(401);
    expect(t.calls).toHaveLength(0);
  });

  it("refunds at Telegram, marks refunded=1 and revokes Pro; the token never reaches the response", async () => {
    await grant();
    const t = tg();
    const res = await run({ user_id: 5, charge_id: "ch1" }, t);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, refunded: true, revoked: true, pro_until: 0 });
    expect(text).not.toContain("TESTTOKEN");
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/refundStarPayment`);
    expect(t.calls[0].body).toEqual({ user_id: 5, telegram_payment_charge_id: "ch1" });
    expect(db.payments.get("ch1")!.refunded).toBe(1);
    expect((await getEntitlement(db, "b1", 5, NOW + 10)).isPro).toBe(false);
  });

  it("Telegram rejection leaves Pro untouched and does not leak the token", async () => {
    await grant();
    const res = await run({ user_id: 5, charge_id: "ch1" }, tg({ ok: false, description: "Bad Request: CHARGE_ALREADY_REFUNDED" }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("TESTTOKEN");
    expect(db.payments.get("ch1")!.refunded).toBe(0);
    expect((await getEntitlement(db, "b1", 5, NOW + 10)).isPro).toBe(true);
  });

  it("a network error is a 502 and nothing changes; the token is redacted from logs", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    await grant();
    const res = await run({ user_id: 5, charge_id: "ch1" }, tg(new Error(`fetch failed for bot${TOKEN}`)));
    expect(res.status).toBe(502);
    expect(db.payments.get("ch1")!.refunded).toBe(0);
    expect(lines.join("\n")).not.toContain("TESTTOKENTESTTOKEN");
  });

  it("refuses a charge that belongs to another user or bot, and an already refunded one, without calling Telegram", async () => {
    await grant("b1", 5, "ch1");
    const t = tg();
    expect((await run({ user_id: 6, charge_id: "ch1" }, t)).status).toBe(409);
    expect((await run({ user_id: 5, charge_id: "ch1" }, t, "b2")).status).toBe(409);
    expect(t.calls).toHaveLength(0);

    await run({ user_id: 5, charge_id: "ch1" }, t);
    expect((await run({ user_id: 5, charge_id: "ch1" }, t)).status).toBe(409);
    expect(t.calls).toHaveLength(1);
  });

  it("an unknown charge is still refunded at Telegram and reported as revoked=false", async () => {
    const t = tg();
    const res = await run({ user_id: 5, charge_id: "never-seen" }, t);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: true, revoked: false });
  });

  it("validates the body and the bot", async () => {
    const t = tg();
    for (const bad of [{}, { user_id: "5", charge_id: "c" }, { user_id: -1, charge_id: "c" }, { user_id: 5, charge_id: "" }, { user_id: 5, charge_id: "a b" }, { user_id: 5 }]) {
      expect((await run(bad, t)).status).toBe(400);
    }
    expect((await run("not json", t)).status).toBe(400);
    expect((await run({ user_id: 5, charge_id: "c" }, t, "nobot")).status).toBe(404);
    expect(t.calls).toHaveLength(0);
  });

  it("only POST is routed (GET falls through to 404)", async () => {
    const res = await handleAdmin(req("/admin/bots/b1/refund", undefined, auth, "GET"), makeEnv(), { db });
    expect(res.status).toBe(404);
  });
});
