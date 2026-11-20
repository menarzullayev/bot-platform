import { describe, expect, it } from "vitest";
import { handleAdmin } from "../src/admin";
import { decryptToken } from "../src/crypto";
import { ADMIN, FakeDb, TEST_KEY, makeEnv, post } from "./helpers";

const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const auth = { authorization: `Bearer ${ADMIN}` };

function tgMock() {
  const calls: { url: string; body?: unknown }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/getMe")) {
      return new Response(JSON.stringify({ ok: true, result: { id: 123456, is_bot: true, username: "t_bot" } }));
    }
    return new Response(JSON.stringify({ ok: true, result: true }));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const body = { id: "b1", token: TOKEN, template: "forcesub", config: { channels: ["@kanal_bir"] } };

describe("admin API", () => {
  it("avtorizatsiyasiz 401", async () => {
    const res = await handleAdmin(post("https://w.test/admin/bots", body), makeEnv(), { db: new FakeDb() });
    expect(res.status).toBe(401);
  });

  it("noto'g'ri token formati 400, Telegram'ga murojaat qilinmaydi", async () => {
    const t = tgMock();
    const res = await handleAdmin(post("https://w.test/admin/bots", { ...body, token: "xato" }, auth), makeEnv(), {
      db: new FakeDb(),
      fetchFn: t.fetchFn,
    });
    expect(res.status).toBe(400);
    expect(t.calls).toHaveLength(0);
  });

  it("muvaffaqiyatli ro'yxatga olish: webhook o'rnatiladi, token shifrlangan saqlanadi", async () => {
    const db = new FakeDb();
    const t = tgMock();
    const res = await handleAdmin(post("https://w.test/admin/bots", body, auth), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(201);
    const hook = t.calls.find((c) => c.url.endsWith("/setWebhook"))!;
    const hb = hook.body as { url: string; secret_token: string; allowed_updates: string[] };
    expect(hb.url).toBe("https://w.test/wh/b1");
    expect(hb.secret_token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const row = db.bots.get("b1")!;
    expect(String(row.token_enc)).not.toContain("ABCDEFGH");
    expect(await decryptToken(TEST_KEY, String(row.token_enc))).toBe(TOKEN);
    expect(row.secret).toBe(hb.secret_token);
  });

  it("takroriy id 409", async () => {
    const db = new FakeDb();
    const t = tgMock();
    await handleAdmin(post("https://w.test/admin/bots", body, auth), makeEnv(), { db, fetchFn: t.fetchFn });
    const res = await handleAdmin(post("https://w.test/admin/bots", body, auth), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(409);
  });

  it("ro'yxat tokenlarni ko'rsatmaydi", async () => {
    const db = new FakeDb();
    const t = tgMock();
    await handleAdmin(post("https://w.test/admin/bots", body, auth), makeEnv(), { db, fetchFn: t.fetchFn });
    const res = await handleAdmin(new Request("https://w.test/admin/bots", { headers: auth }), makeEnv(), { db });
    const text = await res.text();
    expect(text).toContain('"b1"');
    expect(text).not.toContain("token");
    expect(text).not.toContain("secret");
  });
});
