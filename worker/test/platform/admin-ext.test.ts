import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleAdmin } from "../../src/admin";
import { registerTemplate, unregisterTemplate, type Template } from "../../src/templates";
import { ADMIN, FakeDb, makeEnv, seedBot } from "../helpers";

const auth = { authorization: `Bearer ${ADMIN}` };
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = auth) =>
  new Request("https://w.test" + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const profiled: Template<Record<string, never>> = {
  name: "profiled",
  parseConfig: () => ({}),
  install() {},
  profile: () => ({
    commands: { default: [{ command: "start", description: "Start" }], ru: [{ command: "start", description: "Old" }] },
    names: { default: "Calc" },
    shortDescriptions: { default: "short" },
    descriptions: { default: "long", ru: "dolgo" },
  }),
};

beforeEach(() => registerTemplate(profiled));
afterEach(() => unregisterTemplate("profiled"));

function tg(failMethods: string[] = []) {
  const calls: { method: string; body: Record<string, unknown> | undefined }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const method = url.split("/").pop()!;
    calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "getWebhookInfo") {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: "https://w.test/wh/b1",
            has_custom_certificate: false,
            pending_update_count: 3,
            last_error_date: 111,
            last_error_message: "boom",
            allowed_updates: ["message"],
            secret_token: "LEAK",
          },
        }),
      );
    }
    return new Response(JSON.stringify({ ok: !failMethods.includes(method), result: true }));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("admin extensions", () => {
  it("all new endpoints require auth", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const cases: [string, string][] = [
      ["GET", "/admin/bots/b1/webhook"],
      ["POST", "/admin/bots/b1/setup"],
      ["GET", "/admin/stats"],
      ["PATCH", "/admin/bots/b1"],
    ];
    for (const [m, p] of cases) {
      const res = await handleAdmin(req(m, p, m === "PATCH" ? { enabled: false } : undefined, {}), makeEnv(), { db });
      expect(res.status).toBe(401);
    }
  });

  it("PATCH toggles enabled; validates body; 404 for unknown", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const ok = await handleAdmin(req("PATCH", "/admin/bots/b1", { enabled: false }), makeEnv(), { db });
    expect(ok.status).toBe(200);
    expect(db.bots.get("b1")!.enabled).toBe(0);
    await handleAdmin(req("PATCH", "/admin/bots/b1", { enabled: true }), makeEnv(), { db });
    expect(db.bots.get("b1")!.enabled).toBe(1);
    expect((await handleAdmin(req("PATCH", "/admin/bots/b1", { enabled: "no" }), makeEnv(), { db })).status).toBe(400);
    expect((await handleAdmin(req("PATCH", "/admin/bots/zzz", { enabled: true }), makeEnv(), { db })).status).toBe(404);
  });

  it("GET webhook returns only safe fields", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const t = tg();
    const res = await handleAdmin(req("GET", "/admin/bots/b1/webhook"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      url: "https://w.test/wh/b1",
      pending_update_count: 3,
      last_error_date: 111,
      last_error_message: "boom",
      allowed_updates: ["message"],
    });
    expect(text).not.toContain("LEAK");
    expect(text).not.toContain("TESTTOKEN");
    const missing = await handleAdmin(req("GET", "/admin/bots/zzz/webhook"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(missing.status).toBe(404);
  });

  it("POST setup calls profile methods per language and reports each result", async () => {
    const db = new FakeDb();
    await seedBot(db, { template: "profiled", config: {} });
    const t = tg(["setMyDescription"]);
    const res = await handleAdmin(req("POST", "/admin/bots/b1/setup"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { ok: boolean; results: { method: string; language: string; ok: boolean }[] };
    expect(out.ok).toBe(false);
    expect(out.results).toHaveLength(6);
    expect(out.results.filter((r) => !r.ok).map((r) => r.method)).toEqual(["setMyDescription", "setMyDescription"]);
    const cmds = t.calls.filter((c) => c.method === "setMyCommands");
    expect(cmds.map((c) => c.body!.language_code)).toEqual([undefined, "ru"]);
    expect(t.calls.find((c) => c.method === "setMyName")!.body).toEqual({ name: "Calc" });
    expect(JSON.stringify(out)).not.toContain("TESTTOKEN");
  });

  it("POST setup: template without profile -> 409; fetch failure -> ok:false", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const t = tg();
    const nop = await handleAdmin(req("POST", "/admin/bots/b1/setup"), makeEnv(), { db, fetchFn: t.fetchFn });
    expect(nop.status).toBe(409);

    const db2 = new FakeDb();
    await seedBot(db2, { template: "profiled", config: {} });
    const failing = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    const res = await handleAdmin(req("POST", "/admin/bots/b1/setup"), makeEnv(), { db: db2, fetchFn: failing });
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });

  it("GET stats: bots and users per bot", async () => {
    const db = new FakeDb();
    await seedBot(db, { id: "a" });
    await seedBot(db, { id: "b", enabled: 0 });
    db.users.add("a:1");
    db.users.add("a:2");
    const res = await handleAdmin(req("GET", "/admin/stats"), makeEnv(), { db });
    expect(await res.json()).toEqual({ bots: 2, enabled: 1, users: { a: 2, b: 0 } });
  });

  it("POST /admin/bots validates config via the registry template", async () => {
    const db = new FakeDb();
    const t = tg();
    const token = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const bad = await handleAdmin(
      req("POST", "/admin/bots", { id: "x", token, template: "forcesub", config: { channels: [] } }),
      makeEnv(),
      { db, fetchFn: t.fetchFn },
    );
    expect(bad.status).toBe(400);
    const unknown = await handleAdmin(req("POST", "/admin/bots", { id: "x", token, template: "nope" }), makeEnv(), {
      db,
      fetchFn: t.fetchFn,
    });
    expect(unknown.status).toBe(400);
    expect(t.calls).toHaveLength(0);
  });
});
