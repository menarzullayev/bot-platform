import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { setLogLevel, setLogSink } from "../src/log";
import { count, pendingSum } from "../src/metrics";
import { getDegradation } from "../src/degrade";
import { handleAppApi } from "../src/miniapp/api";
import {
  CAPTION_MAX,
  CARD_MAX_BYTES,
  CARD_TTL_S,
  assertJpeg,
  assertPng,
  newCardId,
  purgeExpiredCards,
  readCaption,
  savePrepared,
  serveCard,
} from "../src/miniapp/cards";
import type { PlatformDeps } from "../src/templates";
import {
  ADMIN_TOKEN,
  BOT_ID,
  BOT_TOKEN,
  MapCache,
  NOW,
  SqliteDb,
  dayOfSec,
  eqBytes,
  initDataFor,
  makeJpeg,
  makePng,
} from "./p5-helpers";
import { TEST_KEY } from "./helpers";

afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

const USER = 4242;
const DAY = dayOfSec(NOW);

interface Call {
  url: string;
  body: Record<string, unknown>;
}

interface Ctx {
  db: SqliteDb;
  env: Env;
  deps: PlatformDeps;
  clock: { ms: number };
  calls: Call[];
  post(body: BodyInit | null, o?: PostOpts): Promise<Response>;
}

interface PostOpts {
  user?: number;
  initData?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  method?: string;
  bot?: string;
  authDate?: number;
}

const TG_OK = { ok: true, result: { id: "prep-1", expiration_date: NOW + 3600 } };

async function ctx(
  opts: { tg?: (url: string, body: Record<string, unknown>) => Response | Promise<Response>; env?: Partial<Env> } = {},
): Promise<Ctx> {
  const db = new SqliteDb();
  await db.addBot();
  const env = {
    DB: db as unknown as D1Database,
    TOKEN_KEY: TEST_KEY,
    ADMIN_TOKEN,
    PUBLIC_BASE_URL: "https://example.test",
    APP_ENV: "production",
    INITDATA_MAX_AGE_S: "3600",
    ...opts.env,
  } as Env;
  const clock = { ms: (NOW + 10) * 1000 };
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    return opts.tg ? opts.tg(String(url), body) : new Response(JSON.stringify(TG_OK), { status: 200 });
  }) as unknown as typeof fetch;
  const deps: PlatformDeps = { db, fetchFn, nowMs: () => clock.ms, now: () => Math.floor(clock.ms / 1000) };
  return {
    db,
    env,
    deps,
    clock,
    calls,
    post: (body, o = {}) => {
      const headers: Record<string, string> = { "cf-connecting-ip": "203.0.113.9", ...(o.headers ?? {}) };
      const initData = o.initData === undefined ? initDataFor(BOT_TOKEN, { id: o.user ?? USER }, o.authDate ?? NOW) : o.initData;
      if (initData) headers.authorization = `tma ${initData}`;
      if (o.contentType !== null) headers["content-type"] = o.contentType ?? "image/png";
      const init = { method: o.method ?? "POST", headers, body, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit;
      const req = new Request(`https://example.test/api/app/${o.bot ?? BOT_ID}/card`, init);
      return handleAppApi(req, env, deps);
    },
  };
}

const png = (size = 300) => makePng(8, 8, size);

describe("POST /api/app/:botId/card: success", () => {
  it("201 with id, url, prepared_id", async () => {
    const c = await ctx();
    const bytes = png();
    const r = await c.post(bytes);
    expect(r.status).toBe(201);
    const j = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(["expires_at", "id", "prepared_expires_at", "prepared_id", "url"]);
    expect(j.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(j.url).toBe(`https://example.test/card/${j.id}.png`);
    expect(j.prepared_id).toBe("prep-1");
    expect(j.prepared_expires_at).toBe(NOW + 3600);
    expect(j.expires_at).toBe(NOW + 10 + CARD_TTL_S);
  });

  it("stores the exact bytes with bot, user and timestamp", async () => {
    const c = await ctx();
    const bytes = png(1234);
    const j = (await (await c.post(bytes)).json()) as { id: string };
    const row = c.db.rows<{ id: string; bot_id: string; user_id: number; png: Uint8Array; created_at: number }>("SELECT * FROM cards")[0];
    expect(row).toMatchObject({ id: j.id, bot_id: BOT_ID, user_id: USER, created_at: NOW + 10 });
    expect(eqBytes(row.png, bytes)).toBe(true);
  });

  it("is not cacheable and sets the JSON headers", async () => {
    const c = await ctx();
    const r = await c.post(png());
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-type")).toMatch(/^application\/json/);
  });

  it("ids are unique and random (22 base64url characters)", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newCardId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("uses PUBLIC_BASE_URL for the url", async () => {
    const c = await ctx({ env: { PUBLIC_BASE_URL: "https://cards.example.org" } });
    const j = (await (await c.post(png())).json()) as { url: string; id: string };
    expect(j.url).toBe(`https://cards.example.org/card/${j.id}.png`);
  });

  it("content-type with parameters and any case is accepted", async () => {
    const c = await ctx();
    expect((await c.post(png(), { contentType: "image/png; charset=binary" })).status).toBe(201);
    expect((await c.post(png(), { contentType: "IMAGE/PNG" })).status).toBe(201);
  });

  it("exactly 64 KB is accepted", async () => {
    const c = await ctx();
    expect(png(CARD_MAX_BYTES).length).toBe(CARD_MAX_BYTES);
    expect((await c.post(png(CARD_MAX_BYTES))).status).toBe(201);
  });

  it("counts card:create (and nothing user-specific)", async () => {
    const c = await ctx();
    await c.post(png());
    expect(pendingSum(c.db, DAY, "card:create")).toBe(1);
  });
});

describe("savePreparedInlineMessage call", () => {
  it("POSTs the documented parameters to the bot's own token URL", async () => {
    const c = await ctx();
    const j = (await (await c.post(png())).json()) as { id: string; url: string };
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/savePreparedInlineMessage`);
    expect(c.calls[0].body).toEqual({
      user_id: USER,
      result: { type: "photo", id: j.id, photo_url: j.url, thumbnail_url: j.url },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    });
  });

  it("the prepared message is for the authenticated user only", async () => {
    const c = await ctx();
    await c.post(png(), { user: 777 });
    expect(c.calls[0].body.user_id).toBe(777);
  });

  it("result.id is within the 1-64 byte limit", async () => {
    const c = await ctx();
    await c.post(png());
    expect(((c.calls[0].body.result as { id: string }).id).length).toBeLessThanOrEqual(64);
  });

  it("adds the caption from x-card-caption (percent-encoded UTF-8)", async () => {
    const c = await ctx();
    await c.post(png(), { headers: { "x-card-caption": encodeURIComponent("2 + 2 = 4 — Hisob") } });
    expect((c.calls[0].body.result as { caption?: string }).caption).toBe("2 + 2 = 4 — Hisob");
  });

  it("omits the caption when absent", async () => {
    const c = await ctx();
    await c.post(png());
    expect(c.calls[0].body.result).not.toHaveProperty("caption");
  });

  it("readCaption caps length, strips control characters, ignores bad encodings", () => {
    const h = (v: string) => new Request("https://x.test/", { headers: { "x-card-caption": v } });
    expect(readCaption(new Request("https://x.test/"))).toBeUndefined();
    expect(readCaption(h("%E0%A4%A"))).toBeUndefined(); // malformed percent sequence
    expect(readCaption(h(encodeURIComponent("a\nb\u0000c")))).toBe("a b c");
    expect(readCaption(h("%20%20"))).toBeUndefined();
    expect([...(readCaption(h(encodeURIComponent("x".repeat(1000)))) ?? "")]).toHaveLength(CAPTION_MAX);
    expect([...(readCaption(h(encodeURIComponent("\u{1F600}".repeat(400)))) ?? "")]).toHaveLength(CAPTION_MAX);
  });

  it("returns the expiry when Telegram gives one and null otherwise", async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, result: { id: "p" } }))) as unknown as typeof fetch;
    const r = await savePrepared({ fetchFn: f, token: BOT_TOKEN, botId: "b", userId: 1, cardId: "c", url: "https://x/c.png" });
    expect(r).toEqual({ id: "p", expiresAt: null });
  });
});

describe("savePreparedInlineMessage failures never lose the card", () => {
  const failures: [string, (u: string, b: Record<string, unknown>) => Response | Promise<Response>][] = [
    ["ok:false", () => new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: wrong file identifier/HTTP URL specified" }), { status: 400 })],
    ["HTTP 500 with a non-JSON body", () => new Response("<html>oops</html>", { status: 500 })],
    ["200 with ok:true but no result", () => new Response(JSON.stringify({ ok: true }), { status: 200 })],
    ["result.id missing", () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })],
    ["result.id not a string", () => new Response(JSON.stringify({ ok: true, result: { id: 5 } }), { status: 200 })],
    ["empty result.id", () => new Response(JSON.stringify({ ok: true, result: { id: "" } }), { status: 200 })],
    ["429 flood", () => new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 3 } }), { status: 429 })],
    [
      "network error",
      () => {
        throw new Error("connect ETIMEDOUT");
      },
    ],
    ["empty body", () => new Response("", { status: 200 })],
  ];

  it.each(failures)("%s: 201, prepared_id null, row stored, warning logged", async (_n, tg) => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const c = await ctx({ tg });
    const r = await c.post(png());
    expect(r.status).toBe(201);
    const j = (await r.json()) as { id: string; url: string; prepared_id: unknown; prepared_expires_at: unknown };
    expect(j.prepared_id).toBeNull();
    expect(j.prepared_expires_at).toBeNull();
    expect(j.url).toBe(`https://example.test/card/${j.id}.png`);
    expect(c.db.rows("SELECT id FROM cards")).toHaveLength(1);
    expect(lines.some((l) => l.includes('"level":"warn"') && l.includes("cards: savePreparedInlineMessage"))).toBe(true);
  });

  it("the bot token never reaches the logs, not even from a network error that quotes the URL", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const c = await ctx({
      tg: (url) => {
        throw new Error("fetch failed for " + url);
      },
    });
    await c.post(png());
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toContain(BOT_TOKEN);
  });

  it("the Telegram description is logged truncated", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const c = await ctx({ tg: () => new Response(JSON.stringify({ ok: false, description: "d".repeat(5000) }), { status: 400 }) });
    await c.post(png());
    const warn = lines.find((l) => l.includes("rejected"))!;
    expect(warn.length).toBeLessThan(1000);
  });

  it("the Telegram call has a timeout signal", async () => {
    let signal: AbortSignal | undefined;
    const f = (async (_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Response(JSON.stringify(TG_OK));
    }) as unknown as typeof fetch;
    await savePrepared({ fetchFn: f, token: BOT_TOKEN, botId: "b", userId: 1, cardId: "c", url: "https://x/c.png" });
    expect(signal).toBeDefined();
  });
});

describe("POST card: authentication and routing", () => {
  it("401 without Authorization", async () => {
    const c = await ctx();
    const r = await c.post(png(), { initData: null });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "unauthorized" });
    expect(c.db.rows("SELECT * FROM cards")).toHaveLength(0);
  });

  it("401 for a forged hash", async () => {
    const c = await ctx();
    const forged = initDataFor(BOT_TOKEN, { id: USER }, NOW).replace(/hash=[0-9a-f]{64}$/, "hash=" + "0".repeat(64));
    expect((await c.post(png(), { initData: forged })).status).toBe(401);
  });

  it("401 auth_expired for an old initData", async () => {
    const c = await ctx();
    const r = await c.post(png(), { authDate: NOW - 7200 });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "auth_expired" });
  });

  it("initData signed with another bot's token is rejected", async () => {
    const c = await ctx();
    const other = initDataFor("111111111:AAOtherBotTokenOtherBotTokenOtherBot12", { id: USER }, NOW);
    expect((await c.post(png(), { initData: other })).status).toBe(401);
  });

  it("404 unknown bot, 403 disabled bot", async () => {
    const c = await ctx();
    expect((await c.post(png(), { bot: "nobot" })).status).toBe(404);
    await c.db.addBot(BOT_ID, {}, 0);
    expect((await c.post(png())).status).toBe(403);
  });

  it("GET / PUT / DELETE on /card are 405 with an Allow header", async () => {
    const c = await ctx();
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const r = await c.post(null, { method });
      expect(r.status, method).toBe(405);
      expect(r.headers.get("allow")).toBe("POST");
    }
  });

  it("a failed Telegram call does not need the token to be logged or returned in the body", async () => {
    const c = await ctx();
    const t = await (await c.post(png())).text();
    expect(t).not.toContain(BOT_TOKEN);
  });
});

describe("POST card: payload validation", () => {
  it.each([
    ["application/json"],
    ["text/plain"],
    ["image/jpegx"],
    ["image/gif"],
    ["image/pngx"],
    ["application/octet-stream"],
    ["multipart/form-data; boundary=x"],
    ["xx image/png"],
  ])("415 for content-type %s", async (ct) => {
    const c = await ctx();
    const r = await c.post(png(), { contentType: ct });
    expect(r.status).toBe(415);
    expect(await r.json()).toMatchObject({ error: "unsupported_media_type" });
  });

  it("415 without a content-type", async () => {
    const c = await ctx();
    expect((await c.post(png(), { contentType: null })).status).toBe(415);
  });

  const mutate = (f: (b: Uint8Array) => void): Uint8Array => {
    const b = png(300);
    f(b);
    return b;
  };
  const bad: [string, Uint8Array][] = [
    ["wrong first magic byte", mutate((b) => (b[0] = 0x88))],
    ["wrong second magic byte", mutate((b) => (b[1] = 0x51))],
    ["CRLF mangled (ASCII-mode transfer)", mutate((b) => (b[4] = 0x0a))],
    ["a JPEG", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(1)])],
    ["a GIF", new TextEncoder().encode("GIF89a" + "x".repeat(200))],
    ["plain text", new TextEncoder().encode("hello world ".repeat(30))],
    ["an HTML file", new TextEncoder().encode("<html><script>alert(1)</script></html>".repeat(8))],
    ["only the signature", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["truncated (no IEND)", png(300).slice(0, 200)],
    ["IHDR replaced", mutate((b) => (b[12] = 0x58))],
    ["IHDR length wrong", mutate((b) => (b[11] = 12))],
    ["zero width", makePng(0, 8)],
    ["zero height", makePng(8, 0)],
    ["width above 4096", makePng(4097, 8)],
    ["height above 4096", makePng(8, 100_000)],
    ["IEND corrupted", mutate((b) => (b[b.length - 1] = 0))],
    ["trailing garbage after IEND", Uint8Array.from([...png(300), 1, 2, 3])],
  ];

  it.each(bad)("400 invalid_png for %s", async (_n, body) => {
    const c = await ctx();
    const r = await c.post(body);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "invalid_png" });
    expect(c.db.rows("SELECT * FROM cards")).toHaveLength(0);
    expect(c.calls).toHaveLength(0);
  });

  it("400 for an empty body", async () => {
    const c = await ctx();
    expect((await c.post(new Uint8Array(0))).status).toBe(400);
    expect((await c.post(null)).status).toBe(400);
  });

  it("assertPng accepts the 4096 x 4096 edge and a minimal 1 x 1 image", () => {
    expect(() => assertPng(makePng(4096, 4096))).not.toThrow();
    expect(() => assertPng(makePng(1, 1, 80))).not.toThrow();
  });

  it("413 for 64 KB + 1 byte", async () => {
    const c = await ctx();
    const r = await c.post(png(CARD_MAX_BYTES + 1));
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: "payload_too_large" });
    expect(c.db.rows("SELECT * FROM cards")).toHaveLength(0);
  });

  it("413 for a megabyte, before anything is stored", async () => {
    const c = await ctx();
    const r = await c.post(new Uint8Array(1_000_000).fill(7));
    expect(r.status).toBe(413);
    expect(c.calls).toHaveLength(0);
  });

  it("413 on a declared content-length above the limit, without reading the body", async () => {
    const c = await ctx();
    const r = await c.post(png(), { headers: { "content-length": String(CARD_MAX_BYTES + 5000) } });
    expect(r.status).toBe(413);
  });

  it("a streamed body without content-length is capped while reading", async () => {
    const c = await ctx();
    const big = png(CARD_MAX_BYTES + 2000);
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        for (let i = 0; i < big.length; i += 4096) ctrl.enqueue(big.slice(i, i + 4096));
        ctrl.close();
      },
    });
    const r = await c.post(stream as unknown as BodyInit, { headers: {} });
    expect(r.status).toBe(413);
  });

  it("an invalid upload does not consume the hourly quota", async () => {
    const c = await ctx();
    for (let i = 0; i < 30; i++) {
      c.clock.ms += 11_000; // stay under the 30 per 10 s user limiter
      expect((await c.post(new TextEncoder().encode("not a png ".repeat(20)))).status).toBe(400);
    }
    for (let i = 0; i < 10; i++) expect((await c.post(png())).status).toBe(201);
  });
});

describe("POST card: hourly rate limit (10 per user)", () => {
  it("the 11th card within the hour is 429 with Retry-After", async () => {
    const c = await ctx();
    for (let i = 0; i < 10; i++) expect((await c.post(png())).status, `card ${i + 1}`).toBe(201);
    const r = await c.post(png());
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: "rate_limited" });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(c.db.rows("SELECT * FROM cards")).toHaveLength(10);
    expect(c.calls).toHaveLength(10);
  });

  it("is per user: another user still gets cards", async () => {
    const c = await ctx();
    for (let i = 0; i < 10; i++) await c.post(png());
    expect((await c.post(png())).status).toBe(429);
    expect((await c.post(png(), { user: 999 })).status).toBe(201);
  });

  it("refills gradually: one more card after 6 minutes, ten after an hour", async () => {
    const c = await ctx();
    for (let i = 0; i < 10; i++) await c.post(png());
    expect((await c.post(png())).status).toBe(429);
    c.clock.ms += 6 * 60_000 + 1000;
    expect((await c.post(png(), { authDate: Math.floor(c.clock.ms / 1000) })).status).toBe(201);
    expect((await c.post(png(), { authDate: Math.floor(c.clock.ms / 1000) })).status).toBe(429);
  });

  it("a rate-limited request creates no row and no Telegram call", async () => {
    const c = await ctx();
    for (let i = 0; i < 10; i++) await c.post(png());
    const callsBefore = c.calls.length;
    await c.post(png());
    expect(c.calls.length).toBe(callsBefore);
  });
});

describe("POST card: degradation (DEC-013)", () => {
  it.each([
    [69_999, 201],
    [70_000, 503],
    [89_999, 503],
    [90_000, 503],
    [500_000, 503],
  ])("D1 total %i -> %i", async (n, status) => {
    const c = await ctx();
    c.db.setReq(DAY, n);
    const r = await c.post(png());
    expect(r.status).toBe(status);
    if (status === 503) {
      expect(await r.json()).toMatchObject({ error: "degraded" });
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(Number(r.headers.get("retry-after"))).toBeLessThanOrEqual(86_400);
    }
  });

  it("a refused card writes nothing and does not call Telegram", async () => {
    const c = await ctx();
    c.db.setReq(DAY, 80_000);
    await c.post(png());
    expect(c.db.rows("SELECT * FROM cards")).toHaveLength(0);
    expect(c.calls).toHaveLength(0);
  });

  it("is decided before authentication: no bot lookup, no HMAC work", async () => {
    const c = await ctx();
    c.db.setReq(DAY, 80_000);
    c.db.resetCounters();
    const r = await c.post(png(), { initData: null });
    expect(r.status).toBe(503);
    expect(c.db.sqls.some((s) => /FROM bots/.test(s))).toBe(false);
  });

  it("the unflushed counter of this isolate is included", async () => {
    const c = await ctx();
    count(c.db, BOT_ID, "req", 70_000, { nowMs: c.clock.ms });
    expect((await c.post(png())).status).toBe(503);
  });

  it("yesterday's requests do not degrade today", async () => {
    const c = await ctx();
    c.db.setReq(dayOfSec(NOW - 86_400), 99_999);
    expect((await c.post(png())).status).toBe(201);
  });

  it("custom thresholds from the environment apply", async () => {
    const c = await ctx({ env: { DEGRADE_L1: "5", DEGRADE_L2: "9" } });
    c.db.setReq(DAY, 5);
    expect((await c.post(png())).status).toBe(503);
  });

  it("cards come back when the day rolls over", async () => {
    const c = await ctx();
    const lastSecond = NOW - (NOW % 86_400) + 86_399;
    c.db.setReq(dayOfSec(lastSecond), 95_000);
    c.clock.ms = lastSecond * 1000 - 1000;
    expect((await c.post(png(), { authDate: lastSecond - 1 })).status).toBe(503);
    c.clock.ms = (lastSecond + 2) * 1000;
    expect((await c.post(png(), { authDate: lastSecond + 2 })).status).toBe(201);
  });

  it("a D1 outage while reading the total fails open (cards still work)", async () => {
    const c = await ctx();
    c.db.failOn = /FROM metrics_daily/;
    expect((await c.post(png())).status).toBe(201);
  });
});

describe("GET /card/<id>.png", () => {
  async function stored(c: Ctx, age = 0, bytes = png(500)): Promise<string> {
    const id = newCardId();
    c.db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, ?, ?, ?, ?)", id, BOT_ID, USER, bytes, NOW - age);
    return id;
  }
  const get = (c: Ctx, id: string, o: { cache?: MapCache; method?: string; path?: string } = {}) =>
    serveCard({
      req: new Request(`https://example.test${o.path ?? `/card/${id}.png`}`, { method: o.method ?? "GET" }),
      db: c.db,
      now: NOW,
      nowMs: NOW * 1000,
      cache: o.cache,
    });

  it("200 with the exact image headers and bytes, no token needed", async () => {
    const c = await ctx();
    const bytes = png(777);
    const id = await stored(c, 0, bytes);
    const r = await get(c, id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-length")).toBe("777");
    expect(eqBytes(new Uint8Array(await r.arrayBuffer()), bytes)).toBe(true);
  });

  it("HEAD answers with the headers and no body", async () => {
    const c = await ctx();
    const id = await stored(c);
    const r = await get(c, id, { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect((await r.arrayBuffer()).byteLength).toBe(0);
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("405 for %s", async (method) => {
    const c = await ctx();
    const id = await stored(c);
    const r = await get(c, id, { method });
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, HEAD");
  });

  it("404 for an id that does not exist", async () => {
    const c = await ctx();
    const r = await get(c, newCardId());
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["too short", "/card/abc.png"],
    ["21 characters", "/card/" + "a".repeat(21) + ".png"],
    ["23 characters", "/card/" + "a".repeat(23) + ".png"],
    ["bad characters", "/card/" + "a".repeat(20) + "+/.png"],
    ["wrong extension", "/card/" + "a".repeat(22) + ".gif"],
    ["jpeg spelled out", "/card/" + "a".repeat(22) + ".jpeg"],
    ["upper-case extension", "/card/" + "a".repeat(22) + ".PNG"],
    ["upper-case jpg", "/card/" + "a".repeat(22) + ".JPG"],
    ["no extension", "/card/" + "a".repeat(22)],
    ["a nested path", "/card/x/" + "a".repeat(22) + ".png"],
    ["a path traversal attempt", "/card/../" + "a".repeat(22) + ".png"],
    ["the bare prefix", "/card/"],
  ])("404 for a malformed path: %s, without touching D1", async (_n, path) => {
    const c = await ctx();
    c.db.resetCounters();
    const r = await get(c, "", { path });
    expect(r.status).toBe(404);
    expect(c.db.reads).toBe(0);
  });

  it("the 72 h window: valid until the last second, 404 from the 72nd hour on", async () => {
    const c = await ctx();
    const fresh = await stored(c, CARD_TTL_S - 1);
    const exactly = await stored(c, CARD_TTL_S);
    const older = await stored(c, CARD_TTL_S + 3600);
    expect((await get(c, fresh)).status).toBe(200);
    expect((await get(c, exactly)).status).toBe(404);
    expect((await get(c, older)).status).toBe(404);
  });

  it("a card in the future (clock skew) is still served", async () => {
    const c = await ctx();
    const id = await stored(c, -120);
    expect((await get(c, id)).status).toBe(200);
  });

  it("reads D1 once and keeps the edge copy: the second request does no D1 read", async () => {
    const c = await ctx();
    const cache = new MapCache();
    const id = await stored(c);
    c.db.resetCounters();
    expect((await get(c, id, { cache })).status).toBe(200);
    expect(c.db.reads).toBe(1);
    expect((await get(c, id, { cache })).status).toBe(200);
    expect((await get(c, id, { cache })).status).toBe(200);
    expect(c.db.reads).toBe(1);
    expect(cache.puts).toHaveLength(1);
  });

  it("cache hits return the same image and the client-facing headers", async () => {
    const c = await ctx();
    const cache = new MapCache();
    const bytes = png(640);
    const id = await stored(c, 0, bytes);
    await get(c, id, { cache });
    const hit = await get(c, id, { cache });
    expect(hit.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(hit.headers.get("content-type")).toBe("image/png");
    expect(hit.headers.get("content-length")).toBe("640");
    expect(eqBytes(new Uint8Array(await hit.arrayBuffer()), bytes)).toBe(true);
  });

  it("the edge copy lives for the time LEFT of the 72 h window, never longer", async () => {
    const c = await ctx();
    const cache = new MapCache();
    const young = await stored(c, 0);
    const old = await stored(c, CARD_TTL_S - 3600);
    const almost = await stored(c, CARD_TTL_S - 5);
    await get(c, young, { cache });
    await get(c, old, { cache });
    await get(c, almost, { cache });
    expect(cache.puts.map((p) => p.cacheControl)).toEqual(["public, max-age=86400", "public, max-age=3600", "public, max-age=5"]);
  });

  it("the cache key is the canonical URL: a query string does not create a second copy", async () => {
    const c = await ctx();
    const cache = new MapCache();
    const id = await stored(c);
    await get(c, id, { cache });
    c.db.resetCounters();
    const r = await get(c, id, { cache, path: `/card/${id}.png?utm=x&t=1` });
    expect(r.status).toBe(200);
    expect(c.db.reads).toBe(0);
  });

  it("an expired card is not put in the cache and a 404 is never cached", async () => {
    const c = await ctx();
    const cache = new MapCache();
    await get(c, await stored(c, CARD_TTL_S + 1), { cache });
    await get(c, newCardId(), { cache });
    expect(cache.puts).toHaveLength(0);
  });

  it("a broken cache read falls back to D1", async () => {
    const c = await ctx();
    const cache = new MapCache();
    cache.failMatch = true;
    const id = await stored(c);
    expect((await get(c, id, { cache })).status).toBe(200);
  });

  it("a broken cache write still serves the card", async () => {
    const c = await ctx();
    const cache = new MapCache();
    cache.failPut = true;
    const id = await stored(c);
    expect((await get(c, id, { cache })).status).toBe(200);
  });

  it("works without any cache API (local/unit environment)", async () => {
    const c = await ctx();
    const id = await stored(c);
    expect((await get(c, id)).status).toBe(200);
  });

  it("counts card:view for hits and misses but not for 404s", async () => {
    const c = await ctx();
    const cache = new MapCache();
    const id = await stored(c);
    await get(c, id, { cache });
    await get(c, id, { cache });
    await get(c, newCardId(), { cache });
    await get(c, await stored(c, CARD_TTL_S + 10), { cache });
    expect(pendingSum(c.db, DAY, "card:view")).toBe(2);
  });

  it("reads BLOBs returned as ArrayBuffer or as a number array (D1 driver variants)", async () => {
    const bytes = png(120);
    const variants: unknown[] = [bytes.buffer.slice(0), Array.from(bytes)];
    for (const png of variants) {
      const fake = {
        prepare: () => ({ bind: () => ({ first: async () => ({ png, created_at: NOW }) }) }),
      } as never;
      const r = await serveCard({ req: new Request(`https://example.test/card/${newCardId()}.png`), db: fake, now: NOW, nowMs: NOW * 1000 });
      expect(r.status).toBe(200);
      expect(eqBytes(new Uint8Array(await r.arrayBuffer()), bytes)).toBe(true);
    }
  });

  it("a row whose png is garbage (null) is a 404, not a crash", async () => {
    const fake = { prepare: () => ({ bind: () => ({ first: async () => ({ png: null, created_at: NOW }) }) }) } as never;
    const r = await serveCard({ req: new Request(`https://example.test/card/${newCardId()}.png`), db: fake, now: NOW, nowMs: NOW * 1000 });
    expect(r.status).toBe(404);
  });

  it("round trip: a card created through the API is served by its returned URL path", async () => {
    const c = await ctx();
    const bytes = png(900);
    const j = (await (await c.post(bytes)).json()) as { id: string; url: string };
    const r = await serveCard({ req: new Request(j.url), db: c.db, now: NOW + 11, nowMs: (NOW + 11) * 1000 });
    expect(r.status).toBe(200);
    expect(eqBytes(new Uint8Array(await r.arrayBuffer()), bytes)).toBe(true);
  });
});

describe("cron purge", () => {
  const add = (db: SqliteDb, id: string, at: number) =>
    db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, 'b', 1, x'00', ?)", id, at);
  const ids = (db: SqliteDb) => db.rows<{ id: string }>("SELECT id FROM cards ORDER BY id").map((r) => r.id);

  it("deletes cards older than 72 h and keeps the rest (boundary: exactly 72 h stays)", async () => {
    const db = new SqliteDb();
    add(db, "old1", NOW - CARD_TTL_S - 1);
    add(db, "old2", NOW - 10 * CARD_TTL_S);
    add(db, "edge", NOW - CARD_TTL_S);
    add(db, "new", NOW - 3600);
    await purgeExpiredCards(db, NOW);
    expect(ids(db)).toEqual(["edge", "new"]);
  });

  it("is idempotent and fine on an empty table", async () => {
    const db = new SqliteDb();
    await purgeExpiredCards(db, NOW);
    add(db, "a", NOW);
    await purgeExpiredCards(db, NOW);
    await purgeExpiredCards(db, NOW);
    expect(ids(db)).toEqual(["a"]);
  });

  it("one statement, using the created_at index (no full scan)", async () => {
    const db = new SqliteDb();
    await purgeExpiredCards(db, NOW);
    expect(db.sqls).toHaveLength(1);
  });

  it("a served card disappears from the API after the purge", async () => {
    const db = new SqliteDb();
    add(db, "a".repeat(22), NOW - CARD_TTL_S - 5);
    await purgeExpiredCards(db, NOW);
    const r = await serveCard({ req: new Request(`https://example.test/card/${"a".repeat(22)}.png`), db, now: NOW, nowMs: NOW * 1000 });
    expect(r.status).toBe(404);
  });
});

// Sanity: the degradation helper used above is the same one the route uses.
describe("test helper wiring", () => {
  it("getDegradation sees the seeded total", async () => {
    const db = new SqliteDb();
    db.setReq(DAY, 123);
    expect(await getDegradation(db, NOW)).toBe(0);
  });
});

// ---- JPEG cards (Telegram InlineQueryResultPhoto.photo_url accepts JPEG only) -----------------------------------------

describe("POST card: JPEG", () => {
  const jpeg = (size = 600) => makeJpeg(720, 405, size);

  it("201 with a .jpg url; the stored mime is image/jpeg and the bytes are exact", async () => {
    const c = await ctx();
    const bytes = jpeg(900);
    const r = await c.post(bytes, { contentType: "image/jpeg" });
    expect(r.status).toBe(201);
    const j = (await r.json()) as { id: string; url: string };
    expect(j.url).toBe(`https://example.test/card/${j.id}.jpg`);
    const row = c.db.rows<{ png: Uint8Array; mime: string | null }>("SELECT png, mime FROM cards")[0];
    expect(row.mime).toBe("image/jpeg");
    expect(eqBytes(row.png, bytes)).toBe(true);
  });

  it("the prepared message photo_url is the JPEG URL", async () => {
    const c = await ctx();
    const j = (await (await c.post(jpeg(), { contentType: "image/jpeg; charset=binary" })).json()) as { id: string };
    const res = c.calls[0].body.result as { photo_url: string; thumbnail_url: string };
    expect(res.photo_url).toBe(`https://example.test/card/${j.id}.jpg`);
    expect(res.thumbnail_url).toBe(res.photo_url);
  });

  it("a PNG still works: .png url and NULL mime", async () => {
    const c = await ctx();
    const j = (await (await c.post(png())).json()) as { id: string; url: string };
    expect(j.url.endsWith(".png")).toBe(true);
    expect(c.db.rows<{ mime: string | null }>("SELECT mime FROM cards")[0].mime).toBeNull();
  });

  it("exactly 64 KB is accepted, 64 KB + 1 is 413", async () => {
    const c = await ctx();
    expect((await c.post(jpeg(CARD_MAX_BYTES), { contentType: "image/jpeg" })).status).toBe(201);
    expect((await c.post(jpeg(CARD_MAX_BYTES + 1), { contentType: "image/jpeg" })).status).toBe(413);
  });

  const mutate = (f: (b: Uint8Array) => void): Uint8Array => {
    const b = jpeg();
    f(b);
    return b;
  };
  it.each([
    ["a PNG body declared as JPEG", png()],
    ["bad SOI", mutate((b) => (b[0] = 0))],
    ["missing EOI", mutate((b) => (b[b.length - 1] = 0))],
    ["width above 4096", makeJpeg(4097, 8)],
    ["height above 4096", makeJpeg(8, 5000)],
    ["zero width", makeJpeg(0, 8)],
    ["no frame header (SOS first)", Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 9, 9, 0xff, 0xd9])],
    ["too short", Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
  ])("400 invalid_jpeg for %s", async (_n, body) => {
    const c = await ctx();
    const r = await c.post(body, { contentType: "image/jpeg" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "invalid_jpeg" });
    expect(c.db.rows("SELECT * FROM cards")).toHaveLength(0);
    expect(c.calls).toHaveLength(0);
  });

  it("a JPEG body declared as PNG is rejected", async () => {
    const c = await ctx();
    const r = await c.post(jpeg(), { contentType: "image/png" });
    expect(r.status).toBe(400);
  });

  it("assertJpeg reads the SOF of a progressive file (SOF2) and skips DHT/DQT segments", () => {
    const b = makeJpeg(100, 50);
    const sofAt = b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xc0);
    const withDht = Uint8Array.from([...b.slice(0, sofAt), 0xff, 0xc4, 0x00, 0x05, 0, 0, 0, ...b.slice(sofAt)]);
    withDht[withDht.findIndex((v, i) => v === 0xff && withDht[i + 1] === 0xc0) + 1] = 0xc2;
    expect(() => assertJpeg(withDht)).not.toThrow();
  });

  it("an invalid JPEG does not consume the hourly quota", async () => {
    const c = await ctx();
    for (let i = 0; i < 12; i++) await c.post(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]), { contentType: "image/jpeg" });
    expect((await c.post(jpeg(), { contentType: "image/jpeg" })).status).toBe(201);
  });
});

describe("GET /card/<id>.jpg", () => {
  async function create(c: Ctx, kind: "jpg" | "png"): Promise<{ id: string; bytes: Uint8Array }> {
    const bytes = kind === "jpg" ? makeJpeg(720, 405, 800) : png(800);
    const r = await c.post(bytes, { contentType: kind === "jpg" ? "image/jpeg" : "image/png" });
    return { id: ((await r.json()) as { id: string }).id, bytes };
  }
  const get = (c: Ctx, path: string, cache?: MapCache, method = "GET") =>
    serveCard({ req: new Request(`https://example.test${path}`, { method }), db: c.db, now: NOW + 10, nowMs: (NOW + 10) * 1000, cache });

  it("serves a JPEG with image/jpeg and the exact bytes", async () => {
    const c = await ctx();
    const { id, bytes } = await create(c, "jpg");
    const r = await get(c, `/card/${id}.jpg`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("content-length")).toBe(String(bytes.length));
    expect(eqBytes(new Uint8Array(await r.arrayBuffer()), bytes)).toBe(true);
  });

  it("HEAD works for a JPEG", async () => {
    const c = await ctx();
    const { id } = await create(c, "jpg");
    const r = await get(c, `/card/${id}.jpg`, undefined, "HEAD");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
  });

  it("the extension must match the stored format: JPEG at .png and PNG at .jpg are 404", async () => {
    const c = await ctx();
    const a = await create(c, "jpg");
    const b = await create(c, "png");
    expect((await get(c, `/card/${a.id}.png`)).status).toBe(404);
    expect((await get(c, `/card/${b.id}.jpg`)).status).toBe(404);
    expect((await get(c, `/card/${b.id}.png`)).status).toBe(200);
  });

  it("a legacy row (mime NULL) is a PNG", async () => {
    const c = await ctx();
    const id = newCardId();
    c.db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, ?, ?, ?, ?)", id, BOT_ID, USER, png(), NOW);
    expect((await get(c, `/card/${id}.png`)).headers.get("content-type")).toBe("image/png");
  });

  it("the edge copy is keyed by the .jpg URL and keeps image/jpeg", async () => {
    const c = await ctx();
    const { id } = await create(c, "jpg");
    const cache = new MapCache();
    await get(c, `/card/${id}.jpg`, cache);
    expect([...cache.store.keys()]).toEqual([`https://example.test/card/${id}.jpg`]);
    c.db.resetCounters();
    const hit = await get(c, `/card/${id}.jpg`, cache);
    expect(c.db.reads).toBe(0);
    expect(hit.headers.get("content-type")).toBe("image/jpeg");
  });
});
