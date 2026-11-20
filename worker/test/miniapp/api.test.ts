import { afterEach, describe, expect, it } from "vitest";
import { handleAppApi } from "../../src/miniapp/api";
import { setLogLevel, setLogSink } from "../../src/log";
import { PRO_LIMITS } from "../../src/pro";
import type { PlatformDeps } from "../../src/templates";
import { BOT_ID, BOT_TOKEN, NOW, apiRequest, initDataFor, makeBotRow, setup, type AppDb } from "./util";
import type { Env } from "../../src/env";

const USER = 4242;
const good = (user = {}, authDate = NOW): string => initDataFor(BOT_TOKEN, { id: USER, ...user }, authDate);

interface Ctx {
  db: AppDb;
  env: Env;
  deps: PlatformDeps;
  clock: { ms: number };
  fetches: { url: string; init: RequestInit }[];
  call: (action: string, o?: Parameters<typeof apiRequest>[1], botId?: string) => Promise<Response>;
  bodies: string[];
}

async function ctx(
  config: Record<string, unknown> = {},
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Ctx> {
  const { db, env } = await setup(config);
  const clock = { ms: (NOW + 10) * 1000 };
  const fetches: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    fetches.push({ url: String(url), init });
    return fetchImpl ? fetchImpl(String(url), init) : new Response(JSON.stringify({ ok: true, result: "https://t.me/$abc123" }), { status: 200 });
  }) as unknown as typeof fetch;
  const deps: PlatformDeps = { db, fetchFn, nowMs: () => clock.ms, now: () => Math.floor(clock.ms / 1000) };
  const bodies: string[] = [];
  return {
    db,
    env,
    deps,
    clock,
    fetches,
    bodies,
    call: async (action, o, botId) => {
      const res = await handleAppApi(apiRequest(action, o, botId), env, deps);
      bodies.push(await res.clone().text());
      return res;
    },
  };
}

afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

describe("routing and authentication", () => {
  it("rejects a request without Authorization with 401", async () => {
    const c = await ctx();
    const r = await c.call("me");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "unauthorized" });
  });

  it("rejects a forged hash with 401 and an expired session with auth_expired", async () => {
    const c = await ctx();
    const forged = good().replace(/hash=[0-9a-f]{64}$/, "hash=" + "1".repeat(64));
    expect((await c.call("me", { initData: forged })).status).toBe(401);
    c.clock.ms = (NOW + 7200) * 1000;
    const r = await c.call("me", { initData: good() });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "auth_expired" });
  });

  it("returns 404 for an unknown bot and 403 for a disabled one", async () => {
    const c = await ctx();
    expect((await c.call("me", { initData: good() }, "nobot")).status).toBe(404);
    c.db.bots.set(BOT_ID, await makeBotRow({}, 0));
    expect((await c.call("me", { initData: good() })).status).toBe(403);
  });

  it("signature made with a different bot's token does not open this bot", async () => {
    const c = await ctx();
    const other = initDataFor("111:SomeOtherBotTokenSomeOtherBotToken12", { id: USER });
    expect((await c.call("me", { initData: other })).status).toBe(401);
  });

  it("404 for unknown actions, 405 (with Allow) for wrong methods", async () => {
    const c = await ctx();
    expect((await c.call("nothing", { initData: good() })).status).toBe(404);
    const r = await c.call("me", { method: "POST", initData: good() });
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET");
    expect((await c.call("settings", { method: "GET", initData: good() })).status).toBe(405);
    expect((await c.call("history", { method: "PUT", initData: good() })).status).toBe(405);
  });

  it("answers errors as JSON with no-store caching", async () => {
    const c = await ctx();
    const r = await c.call("me");
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /me", () => {
  it("returns defaults for a user without a row, language from language_code", async () => {
    const c = await ctx();
    const r = await c.call("me", { initData: good({ language_code: "ru", first_name: "Ivan" }) });
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, any>;
    expect(j.user).toMatchObject({ id: USER, first_name: "Ivan", language_code: "ru" });
    expect(j.lang).toBe("ru");
    expect(j.pro).toEqual({ is_pro: false, pro_until: 0 });
    expect(j.settings).toEqual({ angle: "deg", digits: 12, keep_history: false, style: null, contrast: null, density: null, lite: null, fs: null });
    expect(j.limits.history).toBe(PRO_LIMITS.freeHistory);
    expect(j.pro_stars).toBe(150);
  });

  it("falls back to the default language for an unsupported language_code", async () => {
    const c = await ctx();
    const j = (await (await c.call("me", { initData: good({ language_code: "xx" }) })).json()) as { lang: string };
    expect(j.lang).toBe("uz-latn");
  });

  it("reflects Pro, stored language and the configured price", async () => {
    const c = await ctx({ pro: { proStars: 300 } });
    c.db.setPro(BOT_ID, USER, NOW + 1_000_000);
    await c.call("settings", { method: "POST", initData: good(), body: { lang: "tr", angle: "rad" } });
    const j = (await (await c.call("me", { initData: good() })).json()) as Record<string, any>;
    expect(j.pro.is_pro).toBe(true);
    expect(j.limits.history).toBe(PRO_LIMITS.proHistory);
    expect(j.lang).toBe("tr");
    expect(j.settings.angle).toBe("rad");
    expect(j.pro_stars).toBe(300);
  });

  it("treats an expired subscription as not Pro", async () => {
    const c = await ctx();
    c.db.setPro(BOT_ID, USER, NOW - 5);
    const j = (await (await c.call("me", { initData: good() })).json()) as Record<string, any>;
    expect(j.pro.is_pro).toBe(false);
  });
});

describe("GET /fx (public)", () => {
  it("is 503 without a table and does not need auth", async () => {
    const c = await ctx();
    const r = await c.call("fx");
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "no_rates" });
  });

  it("returns rates with a 5 minute public cache, staleness flag", async () => {
    const c = await ctx();
    c.db.fx = [
      { base: "USD", quote: "UZS", rate: "12700.5", updated_at: NOW, source: "cbu" },
      { base: "USD", quote: "EUR", rate: "0.92", updated_at: NOW, source: "cbu" },
    ];
    const r = await c.call("fx");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=300");
    const j = (await r.json()) as Record<string, any>;
    expect(j).toMatchObject({ base: "USD", updated_at: NOW, source: "cbu", stale: false });
    expect(j.rates).toEqual({ UZS: "12700.5", EUR: "0.92" });
    c.clock.ms = (NOW + 40 * 3600) * 1000;
    expect(((await (await c.call("fx")).json()) as { stale: boolean }).stale).toBe(true);
  });

  it("only GET is allowed and the bot id format is enforced", async () => {
    const c = await ctx();
    expect((await c.call("fx", { method: "POST" })).status).toBe(405);
    expect((await c.call("fx", {}, "bad id!")).status).toBe(404);
  });
});

describe("look-and-feel settings (style, contrast, density, lite, fs)", () => {
  const post = (c: Ctx, body: unknown, uid = USER): Promise<Response> =>
    c.call("settings", { method: "POST", initData: good({ id: uid }), body });
  const me = async (c: Ctx, uid = USER): Promise<Record<string, any>> =>
    (await (await c.call("me", { initData: good({ id: uid }) })).json()) as Record<string, any>;
  const UNSET = { style: null, contrast: null, density: null, lite: null, fs: null };

  it("me always carries the five fields, null while never saved", async () => {
    const c = await ctx();
    expect((await me(c)).settings).toMatchObject(UNSET);
  });

  it.each([
    ["style", ["tactile", "glass", "fintech", "techno"]],
    ["contrast", ["normal", "high"]],
    ["density", ["comfortable", "compact"]],
    ["lite", ["auto", "on", "off"]],
    ["fs", ["m", "l", "xl"]],
  ] as const)("accepts every %s value and shows it in me", async (field, values) => {
    for (const v of values) {
      const c = await ctx();
      const r = await post(c, { [field]: v });
      expect(r.status).toBe(200);
      expect(((await r.json()) as any).settings[field]).toBe(v);
      expect((await me(c)).settings).toMatchObject({ ...UNSET, [field]: v });
    }
  });

  it("creates the users row when it does not exist yet (style only)", async () => {
    const c = await ctx();
    expect(c.db.users.size).toBe(0);
    expect((await post(c, { style: "techno" })).status).toBe(200);
    expect(c.db.users.get(`${BOT_ID}:${USER}`)).toMatchObject({ style: "techno", angle: "deg", digits: 12, keep_history: 0, contrast: null });
  });

  it("a partial update keeps the other look fields and the classic settings", async () => {
    const c = await ctx();
    await post(c, { style: "glass", angle: "rad", digits: 6 });
    await post(c, { contrast: "high", fs: "xl" });
    const r = await post(c, { density: "compact" });
    expect(((await r.json()) as any).settings).toEqual({
      angle: "rad", digits: 6, keep_history: false, style: "glass", contrast: "high", density: "compact", lite: null, fs: "xl",
    });
    await post(c, { style: "fintech" });
    expect((await me(c)).settings).toMatchObject({ style: "fintech", contrast: "high", density: "compact", fs: "xl", angle: "rad" });
  });

  it("all five in one request, together with a classic field", async () => {
    const c = await ctx();
    const r = await post(c, { style: "fintech", contrast: "high", density: "compact", lite: "on", fs: "l", keep_history: true });
    expect(((await r.json()) as any).settings).toEqual({
      angle: "deg", digits: 12, keep_history: true, style: "fintech", contrast: "high", density: "compact", lite: "on", fs: "l",
    });
  });

  it("does not touch another user's row, nor pro_until", async () => {
    const c = await ctx();
    c.db.setPro(BOT_ID, USER, NOW + 999);
    await post(c, { style: "glass" }, 7);
    await post(c, { style: "techno", lite: "off" });
    expect((await me(c, 7)).settings).toMatchObject({ style: "glass", lite: null });
    expect((await me(c)).settings).toMatchObject({ style: "techno", lite: "off" });
    expect(c.db.users.get(`${BOT_ID}:${USER}`)?.pro_until).toBe(NOW + 999);
    expect(c.db.users.get(`${BOT_ID}:7`)?.pro_until).toBe(0);
  });

  it("an unknown stored value (hand-edited row) reads as null, not as garbage", async () => {
    const c = await ctx();
    c.db.users.set(`${BOT_ID}:${USER}`, { lang: null, angle: "deg", digits: 12, keep_history: 0, pro_until: 0, style: "bogus", contrast: "x", density: null, lite: "ON", fs: "" });
    expect((await me(c)).settings).toMatchObject(UNSET);
  });

  it("D1 budget: me = bot + user reads, settings = bot + user reads + 1 write", async () => {
    const c = await ctx();
    c.db.queries = 0;
    await me(c);
    const meQ = c.db.queries;
    c.db.queries = 0;
    await post(c, { style: "glass" });
    expect(c.db.queries).toBe(meQ + 1);
  });
});

describe("POST /settings", () => {
  const post = (c: Ctx, body: unknown, extra: Parameters<typeof apiRequest>[1] = {}): Promise<Response> =>
    c.call("settings", { method: "POST", initData: good(), body, ...extra });

  it("stores a partial update and merges with existing values", async () => {
    const c = await ctx();
    expect((await post(c, { angle: "rad" })).status).toBe(200);
    expect((await post(c, { digits: 6 })).status).toBe(200);
    const r = await post(c, { keep_history: true, lang: "ar" });
    expect(await r.json()).toEqual({ settings: { angle: "rad", digits: 6, keep_history: true, style: null, contrast: null, density: null, lite: null, fs: null }, lang: "ar" });
    expect(c.db.users.get(`${BOT_ID}:${USER}`)).toMatchObject({ angle: "rad", digits: 6, keep_history: 1, lang: "ar" });
  });

  it("does not touch pro_until when saving settings", async () => {
    const c = await ctx();
    c.db.setPro(BOT_ID, USER, NOW + 999);
    await post(c, { digits: 3 });
    expect(c.db.users.get(`${BOT_ID}:${USER}`)?.pro_until).toBe(NOW + 999);
  });

  it.each([
    ["unknown key", { angle: "deg", admin: true }],
    ["bad angle", { angle: "grad" }],
    ["digits too big", { digits: 21 }],
    ["digits negative", { digits: -1 }],
    ["digits float", { digits: 1.5 }],
    ["digits string", { digits: "5" }],
    ["keep_history not boolean", { keep_history: 1 }],
    ["unsupported lang", { lang: "de" }],
    ["unknown style", { style: "neon" }],
    ["style wrong case", { style: "Glass" }],
    ["style not a string", { style: 1 }],
    ["style null", { style: null }],
    ["unknown contrast", { contrast: "max" }],
    ["unknown density", { density: "tight" }],
    ["unknown lite", { lite: "yes" }],
    ["lite boolean", { lite: true }],
    ["unknown fs", { fs: "s" }],
    ["fs number", { fs: 16 }],
    ["valid style next to an invalid one", { style: "glass", fs: "xxl" }],
    ["empty object", {}],
    ["array body", [1]],
    ["null body", null],
    ["prototype key", JSON.parse('{"__proto__": 1}')],
  ])("400 on invalid body: %s", async (_n, body) => {
    const c = await ctx();
    const r = await post(c, body);
    expect(r.status).toBe(400);
    expect(c.db.users.size).toBe(0);
  });

  it("400 on malformed JSON, 415 on a wrong content type", async () => {
    const c = await ctx();
    expect((await c.call("settings", { method: "POST", initData: good(), rawBody: "{nope" })).status).toBe(400);
    const r = await c.call("settings", { method: "POST", initData: good(), rawBody: '{"angle":"deg"}', headers: { "content-type": "text/plain" } });
    expect(r.status).toBe(415);
  });

  it("413 when the body exceeds 8 KB (declared and streamed)", async () => {
    const c = await ctx();
    const big = JSON.stringify({ lang: "en", pad: "x".repeat(9000) });
    const r = await c.call("settings", { method: "POST", initData: good(), rawBody: big });
    expect(r.status).toBe(413);
    // no content-length: stream reader must still enforce the limit
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('{"a":"' + "y".repeat(9000) + '"}'));
        ctrl.close();
      },
    });
    const req = new Request(`https://example.test/api/app/${BOT_ID}/settings`, {
      method: "POST",
      headers: { authorization: `tma ${good()}`, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
      body: stream,
      // @ts-expect-error duplex is required by undici for streamed bodies
      duplex: "half",
    });
    const res = await handleAppApi(req, c.env, c.deps);
    expect(res.status).toBe(413);
  });
});

describe("/history", () => {
  const add = (c: Ctx, expr: string, result: string, user = {}): Promise<Response> =>
    c.call("history", { method: "POST", initData: good(user), body: { expr, result } });
  const enable = (c: Ctx): Promise<Response> => c.call("settings", { method: "POST", initData: good(), body: { keep_history: true } });

  it("refuses to store while sync is off (409 history_off)", async () => {
    const c = await ctx();
    const r = await add(c, "1+1", "2");
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "history_off" });
    expect(c.db.history).toHaveLength(0);
  });

  it("stores and lists newest first", async () => {
    const c = await ctx();
    await enable(c);
    expect((await add(c, "1+1", "2")).status).toBe(201);
    await add(c, "2*3", "6");
    const j = (await (await c.call("history", { initData: good() })).json()) as { items: { expr: string }[]; limit: number; is_pro: boolean };
    expect(j.items.map((i) => i.expr)).toEqual(["2*3", "1+1"]);
    expect(j.limit).toBe(20);
    expect(j.is_pro).toBe(false);
  });

  it("free tier keeps only the newest 20", async () => {
    const c = await ctx();
    await enable(c);
    for (let i = 0; i < 25; i++) {
      c.clock.ms += 1000; // stay clear of the per-user rate limit
      expect((await add(c, `${i}+0`, String(i))).status).toBe(201);
    }
    expect(c.db.history).toHaveLength(PRO_LIMITS.freeHistory);
    const j = (await (await c.call("history", { initData: good() })).json()) as { items: { expr: string }[] };
    expect(j.items[0].expr).toBe("24+0");
    expect(j.items.at(-1)?.expr).toBe("5+0");
  });

  it("Pro keeps up to 1000 and trims beyond", async () => {
    const c = await ctx();
    await enable(c);
    c.db.setPro(BOT_ID, USER, NOW + 1_000_000);
    for (let i = 0; i < PRO_LIMITS.proHistory; i++) c.db.history.push({ id: i - 5000, bot_id: BOT_ID, user_id: USER, expr: `e${i}`, result: "1", ts: NOW });
    expect((await add(c, "last", "9")).status).toBe(201);
    expect(c.db.history.filter((h) => h.user_id === USER)).toHaveLength(PRO_LIMITS.proHistory);
    const j = (await (await c.call("history", { initData: good() })).json()) as { items: unknown[]; limit: number };
    expect(j.items).toHaveLength(PRO_LIMITS.proHistory);
    expect(j.limit).toBe(1000);
    expect(c.db.history.some((h) => h.expr === "e0")).toBe(false); // oldest dropped
  });

  it("a downgraded user only reads the free limit even if more rows exist", async () => {
    const c = await ctx();
    for (let i = 0; i < 30; i++) c.db.history.push({ id: i + 1, bot_id: BOT_ID, user_id: USER, expr: `e${i}`, result: "1", ts: NOW });
    const j = (await (await c.call("history", { initData: good() })).json()) as { items: unknown[] };
    expect(j.items).toHaveLength(20);
  });

  it.each([
    ["expr too long", { expr: "1".repeat(501), result: "1" }],
    ["result too long", { expr: "1", result: "1".repeat(201) }],
    ["empty expr", { expr: "", result: "1" }],
    ["missing result", { expr: "1" }],
    ["extra field", { expr: "1", result: "1", user_id: 5 }],
    ["number expr", { expr: 1, result: "1" }],
    ["control chars", { expr: "1\u0000+1", result: "2" }],
  ])("400 on invalid entry: %s", async (_n, body) => {
    const c = await ctx();
    await enable(c);
    const r = await c.call("history", { method: "POST", initData: good(), body });
    expect(r.status).toBe(400);
    expect(c.db.history).toHaveLength(0);
  });

  it("DELETE clears only the caller's history", async () => {
    const c = await ctx();
    await enable(c);
    await add(c, "1+1", "2");
    c.db.history.push({ id: 999, bot_id: BOT_ID, user_id: 7, expr: "mine", result: "1", ts: NOW });
    const r = await c.call("history", { method: "DELETE", initData: good() });
    expect(r.status).toBe(200);
    expect(c.db.history.map((h) => h.user_id)).toEqual([7]);
  });

  it("keeps different users' histories apart", async () => {
    const c = await ctx();
    c.db.history.push({ id: 1, bot_id: BOT_ID, user_id: 7, expr: "secret", result: "1", ts: NOW });
    const j = (await (await c.call("history", { initData: good() })).json()) as { items: unknown[] };
    expect(j.items).toHaveLength(0);
  });
});

describe("POST /invoice", () => {
  it("creates a Stars subscription invoice link with the right parameters", async () => {
    const c = await ctx({ pro: { proStars: 250 } });
    const r = await c.call("invoice", { method: "POST", initData: good() });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ link: "https://t.me/$abc123", stars: 250 });
    expect(c.fetches).toHaveLength(1);
    expect(c.fetches[0].url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`);
    const sent = JSON.parse(String(c.fetches[0].init.body)) as Record<string, any>;
    expect(sent).toMatchObject({
      currency: "XTR",
      provider_token: "",
      subscription_period: 2_592_000,
      payload: `pro:${BOT_ID}:${USER}:v1`,
      prices: [{ amount: 250 }],
    });
    expect(sent.title.length).toBeLessThanOrEqual(32);
    expect(sent.description.length).toBeLessThanOrEqual(255);
  });

  it("uses the default price when the config has none", async () => {
    const c = await ctx();
    const j = (await (await c.call("invoice", { method: "POST", initData: good() })).json()) as { stars: number };
    expect(j.stars).toBe(150);
  });

  it("409 for a user who already has Pro, nothing is sent to Telegram", async () => {
    const c = await ctx();
    c.db.setPro(BOT_ID, USER, NOW + 100_000);
    const r = await c.call("invoice", { method: "POST", initData: good() });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "already_pro" });
    expect(c.fetches).toHaveLength(0);
  });

  it("requires authentication before talking to Telegram", async () => {
    const c = await ctx();
    expect((await c.call("invoice", { method: "POST" })).status).toBe(401);
    expect(c.fetches).toHaveLength(0);
  });

  it("502 when Telegram refuses, when it is unreachable and on a non-https result", async () => {
    for (const impl of [
      async () => new Response(JSON.stringify({ ok: false, description: "Bad Request: nope" }), { status: 400 }),
      async () => {
        throw new TypeError("fetch failed https://api.telegram.org/bot" + BOT_TOKEN + "/createInvoiceLink");
      },
      async () => new Response(JSON.stringify({ ok: true, result: "javascript:alert(1)" }), { status: 200 }),
      async () => new Response("<html>gateway</html>", { status: 502 }),
    ]) {
      const c = await ctx({}, impl);
      const r = await c.call("invoice", { method: "POST", initData: good() });
      expect(r.status).toBe(502);
    }
  });
});

describe("rate limiting", () => {
  it("limits an authenticated user (429 + retry-after)", async () => {
    const c = await ctx();
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) codes.push((await c.call("me", { initData: good() })).status);
    expect(codes.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(codes).toContain(429);
    const r = await c.call("me", { initData: good() });
    expect(r.headers.get("retry-after")).toBeTruthy();
    // another user is unaffected
    expect((await c.call("me", { initData: good({ id: 9999 }) })).status).toBe(200);
  });

  it("limits unauthenticated floods per client address before any DB work", async () => {
    const c = await ctx();
    let limited = 0;
    for (let i = 0; i < 130; i++) if ((await c.call("me")).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
    const queriesBefore = c.db.queries;
    await c.call("me");
    expect(c.db.queries).toBe(queriesBefore);
    // a different address still gets through to the auth check
    const r = await c.call("me", { headers: { "cf-connecting-ip": "198.51.100.1" } });
    expect(r.status).toBe(401);
  });

  it("tokens refill over time", async () => {
    const c = await ctx();
    for (let i = 0; i < 40; i++) await c.call("me", { initData: good() });
    expect((await c.call("me", { initData: good() })).status).toBe(429);
    c.clock.ms += 20_000;
    expect((await c.call("me", { initData: good() })).status).toBe(200);
  });
});

describe("the bot token never leaks", () => {
  it("is absent from every response body, header and log line", async () => {
    const lines: string[] = [];
    setLogLevel("debug");
    setLogSink((_l, line) => lines.push(line));
    const c = await ctx({}, async () => {
      throw new TypeError("fetch failed https://api.telegram.org/bot" + BOT_TOKEN + "/createInvoiceLink");
    });
    const initData = good();
    const headers: string[] = [];
    const reqs: Array<[string, Parameters<typeof apiRequest>[1]]> = [
      ["me", { initData }],
      ["me", {}],
      ["me", { initData: initData.replace(/hash=[0-9a-f]{64}$/, "hash=" + "2".repeat(64)) }],
      ["settings", { method: "POST", initData, body: { angle: "rad" } }],
      ["history", { initData }],
      ["invoice", { method: "POST", initData }],
      ["fx", {}],
    ];
    for (const [a, o] of reqs) {
      const r = await c.call(a, o);
      r.headers.forEach((v, k) => headers.push(`${k}: ${v}`));
    }
    const everything = [...c.bodies, ...headers, ...lines].join("\n");
    expect(everything).not.toContain(BOT_TOKEN);
    expect(everything).not.toContain(BOT_TOKEN.split(":")[1]);
    // initData carries personal data and must not be logged either
    expect(lines.join("\n")).not.toContain("query_id");
    expect(lines.length).toBeGreaterThan(0);
  });
});
