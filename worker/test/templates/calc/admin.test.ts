import { afterEach, describe, expect, it } from "vitest";
import { ALLOWED_UPDATES, handleAdmin } from "../../../src/admin";
import { setLogSink } from "../../../src/log";
import { ADMIN, makeEnv, seedBot } from "../../helpers";
import { APP_CONFIG, CalcFakeDb } from "./util";

afterEach(() => setLogSink(null));

const auth = { authorization: `Bearer ${ADMIN}` };
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = auth) =>
  new Request("https://w.test" + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const TOKEN = "123456:TESTTOKENTESTTOKENTESTTOKENTEST12";

function tg(opts: { fail?: string[]; throwOn?: string[] } = {}) {
  const calls: { method: string; url: string; body: Record<string, unknown> | undefined }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const method = url.split("/").pop()!;
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (opts.throwOn?.includes(method)) throw new Error(`connect failed for ${url}`);
    return new Response(JSON.stringify({ ok: !opts.fail?.includes(method), result: true }));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("ALLOWED_UPDATES", () => {
  it("contains every update type the calc bot consumes (official names)", () => {
    for (const u of ["message", "callback_query", "pre_checkout_query", "inline_query", "chosen_inline_result", "guest_message", "widget_query"]) {
      expect(ALLOWED_UPDATES).toContain(u);
    }
  });

  it("keeps the previous platform types and has no duplicates", () => {
    expect(ALLOWED_UPDATES).toEqual(expect.arrayContaining(["my_chat_member", "chat_member"]));
    expect(new Set(ALLOWED_UPDATES).size).toBe(ALLOWED_UPDATES.length);
  });

  it("registering a new bot uses the full list", async () => {
    const db = new CalcFakeDb();
    const t = tg();
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: "tezcalc_bot" } }));
      return t.fetchFn(url, init);
    }) as unknown as typeof fetch;
    await handleAdmin(req("POST", "/admin/bots", { id: "c1", token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345", template: "calc" }), makeEnv(), { db, fetchFn });
    const hook = t.calls.find((c) => c.method === "setWebhook")!;
    expect(hook.body!.allowed_updates).toEqual(ALLOWED_UPDATES);
  });
});

describe("POST /admin/bots/:id/sync-webhook", () => {
  it("requires auth", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const res = await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook", undefined, {}), makeEnv(), { db });
    expect(res.status).toBe(401);
  });

  it("unknown bot: 404 and no Telegram call", async () => {
    const t = tg();
    const res = await handleAdmin(req("POST", "/admin/bots/nope/sync-webhook"), makeEnv(), { db: new CalcFakeDb(), fetchFn: t.fetchFn });
    expect(res.status).toBe(404);
    expect(t.calls).toHaveLength(0);
  });

  it("re-applies setWebhook with the current list, the same URL and the stored secret", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {}, secret: "stored-secret-xyz" });
    const t = tg();
    const res = await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(1);
    const c = t.calls[0];
    expect(c.method).toBe("setWebhook");
    expect(c.url).toBe(`https://api.telegram.org/bot${TOKEN}/setWebhook`);
    expect(c.body).toEqual({ url: "https://w.test/wh/c1", secret_token: "stored-secret-xyz", allowed_updates: ALLOWED_UPDATES });
  });

  it("does not drop pending updates", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const t = tg();
    await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(t.calls[0].body!.drop_pending_updates).toBeUndefined();
  });

  it("the response carries no token and no secret", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {}, secret: "stored-secret-xyz" });
    const t = tg();
    const res = await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: t.fetchFn });
    const body = await res.text();
    expect(body).not.toContain("stored-secret-xyz");
    expect(body).not.toContain("TESTTOKEN");
    expect(body).not.toContain("123456:");
    expect(JSON.parse(body)).toEqual({ ok: true, webhook: "https://w.test/wh/c1", allowed_updates: ALLOWED_UPDATES });
  });

  it("the stored secret is unchanged afterwards", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {}, secret: "stored-secret-xyz" });
    await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: tg().fetchFn });
    expect(db.bots.get("c1")!.secret).toBe("stored-secret-xyz");
  });

  it("Telegram refusing it: 502", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const res = await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: tg({ fail: ["setWebhook"] }).fetchFn });
    expect(res.status).toBe(502);
  });

  it("a network failure: 502, and the token never reaches the logs", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const res = await handleAdmin(req("POST", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: tg({ throwOn: ["setWebhook"] }).fetchFn });
    expect(res.status).toBe(502);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("GET on the same path is not a sync", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const t = tg();
    const res = await handleAdmin(req("GET", "/admin/bots/c1/sync-webhook"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(404);
    expect(t.calls).toHaveLength(0);
  });
});

describe("POST /admin/bots/:id/setup for a calc bot", () => {
  it("pushes commands, names and descriptions for default + 6 languages", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const t = tg();
    const res = await handleAdmin(req("POST", "/admin/bots/c1/setup"), makeEnv(), { db, fetchFn: t.fetchFn, appConfig: APP_CONFIG });
    const out = (await res.json()) as { ok: boolean; results: { method: string; language: string; ok: boolean }[] };
    expect(out.ok).toBe(true);
    const per = (m: string) => out.results.filter((r) => r.method === m);
    expect(per("setMyCommands")).toHaveLength(7);
    expect(per("setMyName")).toHaveLength(7);
    expect(per("setMyShortDescription")).toHaveLength(7);
    expect(per("setMyDescription")).toHaveLength(7);
    const cmds = t.calls.find((c) => c.method === "setMyCommands" && !c.body!.language_code)!;
    expect((cmds.body!.commands as unknown[]).length).toBe(19);
    expect(t.calls.find((c) => c.method === "setMyCommands" && c.body!.language_code === "uz")).toBeTruthy();
    expect(t.calls.some((c) => c.body?.language_code === "uz-cyrl")).toBe(false);
  });

  it("also sets the Mini App chat menu button from PUBLIC_BASE_URL", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: { miniAppPath: "/calc/" } });
    const t = tg();
    await handleAdmin(req("POST", "/admin/bots/c1/setup"), makeEnv(), { db, fetchFn: t.fetchFn, appConfig: APP_CONFIG });
    const mb = t.calls.find((c) => c.method === "setChatMenuButton")!;
    expect(mb.body).toEqual({
      menu_button: { type: "web_app", text: "📱 Open Mini App", web_app: { url: "https://calc.test/calc/?b=c1" } },
    });
  });

  it("falls back to the request origin without an AppConfig", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const t = tg();
    await handleAdmin(req("POST", "/admin/bots/c1/setup"), makeEnv(), { db, fetchFn: t.fetchFn });
    const mb = t.calls.find((c) => c.method === "setChatMenuButton")!;
    expect((mb.body!.menu_button as { web_app: { url: string } }).web_app.url).toBe("https://w.test/app/?b=c1");
  });

  it("a failing menu button call is reported as a failed result", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const res = await handleAdmin(req("POST", "/admin/bots/c1/setup"), makeEnv(), { db, fetchFn: tg({ fail: ["setChatMenuButton"] }).fetchFn });
    const out = (await res.json()) as { ok: boolean; results: { method: string; ok: boolean }[] };
    expect(out.ok).toBe(false);
    expect(out.results.find((r) => r.method === "setChatMenuButton")!.ok).toBe(false);
  });

  it("forcesub bots (no menuButton) get no menu call", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "f1" });
    const t = tg();
    await handleAdmin(req("POST", "/admin/bots/f1/setup"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(t.calls.some((c) => c.method === "setChatMenuButton")).toBe(false);
  });
});
