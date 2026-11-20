// Share cards (DEC-014): the Mini App draws a PNG on a canvas, POSTs it here, we keep it in D1 for 72 h, serve it at
// /card/<id>.png and (best effort) register a Telegram "prepared inline message" so the Mini App can call
// shareMessage(prepared_id). No image work happens on the server (Workers CPU limit): bytes in, bytes out.

import { globalFetch } from "../http";
import type { Db } from "../db";
import { secondsUntilReset, type DegradeLevel } from "../degrade";
import type { AppConfig } from "../env";
import { errInfo, log } from "../log";
import { count, PLATFORM_BOT, type WaitUntil } from "../metrics";
import { RateLimiter } from "../ratelimit";
import { HttpError, json } from "./http";

export const CARD_MAX_BYTES = 64 * 1024;
export const CARD_TTL_S = 72 * 3600;
export const CARD_RATE = { capacity: 10, windowMs: 3_600_000 } as const;
export const CARD_PATH_RE = /^\/card\/([A-Za-z0-9_-]{22})\.png$/;
export const CAPTION_MAX = 256;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const MAX_DIM = 4096;

const limiters = new WeakMap<object, RateLimiter>();
function limiterFor(db: object): RateLimiter {
  let l = limiters.get(db);
  if (!l) {
    l = new RateLimiter(CARD_RATE);
    limiters.set(db, l);
  }
  return l;
}

/** Throws HttpError 400 unless `b` is a structurally sound PNG: signature, IHDR first, sane size, IEND last. */
export function assertPng(b: Uint8Array): void {
  const bad = (why: string): never => {
    throw new HttpError(400, "invalid_png", why);
  };
  if (b.length < 8 + 25 + IEND.length) return bad("too short");
  for (let i = 0; i < PNG_MAGIC.length; i++) if (b[i] !== PNG_MAGIC[i]) return bad("bad signature");
  // first chunk: length(4)=13, type "IHDR", width(4), height(4)
  if (!(b[8] === 0 && b[9] === 0 && b[10] === 0 && b[11] === 13 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) {
    return bad("IHDR missing");
  }
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(16);
  const h = dv.getUint32(20);
  if (w < 1 || h < 1 || w > MAX_DIM || h > MAX_DIM) return bad("bad dimensions");
  for (let i = 0; i < IEND.length; i++) if (b[b.length - IEND.length + i] !== IEND[i]) return bad("IEND missing");
}

/** Reads at most `max` body bytes; 413 when the declared or actual size is larger. */
export async function readBytes(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, "payload_too_large");
  if (!req.body) throw new HttpError(400, "invalid_png", "empty body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

const B64URL = (b: Uint8Array): string => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** 16 random bytes, base64url: 22 characters. */
export function newCardId(): string {
  return B64URL(crypto.getRandomValues(new Uint8Array(16)));
}

/** Optional caption from the percent-encoded `x-card-caption` header; plain text, length-capped, control chars dropped. */
export function readCaption(req: Request): string | undefined {
  const raw = req.headers.get("x-card-caption");
  if (!raw) return undefined;
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return s ? [...s].slice(0, CAPTION_MAX).join("") : undefined;
}

export interface PreparedResult {
  id: string | null;
  expiresAt: number | null;
}

/**
 * Bot API 10.4 savePreparedInlineMessage (https://core.telegram.org/bots/api#savepreparedinlinemessage):
 * user_id, result (InlineQueryResult), allow_user_chats / allow_bot_chats / allow_group_chats / allow_channel_chats.
 * Best effort: any failure returns {id: null} and the card is still usable through its URL.
 */
export async function savePrepared(a: {
  fetchFn: typeof fetch;
  token: string;
  botId: string;
  userId: number;
  cardId: string;
  url: string;
  caption?: string;
}): Promise<PreparedResult> {
  const none: PreparedResult = { id: null, expiresAt: null };
  const result: Record<string, unknown> = { type: "photo", id: a.cardId, photo_url: a.url, thumbnail_url: a.url };
  if (a.caption) result.caption = a.caption;
  try {
    const res = await a.fetchFn(`https://api.telegram.org/bot${a.token}/savePreparedInlineMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: a.userId,
        result,
        allow_user_chats: true,
        allow_bot_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    let data: { ok?: boolean; result?: { id?: unknown; expiration_date?: unknown }; description?: unknown } | null;
    try {
      data = (await res.json()) as typeof data;
    } catch {
      data = null;
    }
    const r = data?.result;
    if (!res.ok || !data?.ok || !r || typeof r.id !== "string" || r.id === "") {
      log("warn", "cards: savePreparedInlineMessage rejected", {
        botId: a.botId,
        status: res.status,
        description: typeof data?.description === "string" ? data.description.slice(0, 200) : undefined,
      });
      return none;
    }
    return { id: r.id, expiresAt: Number.isSafeInteger(r.expiration_date) ? (r.expiration_date as number) : null };
  } catch (e) {
    log("warn", "cards: savePreparedInlineMessage request failed", { botId: a.botId, error: errInfo(e, a.token) });
    return none;
  }
}

export interface CardPostArgs {
  req: Request;
  db: Db;
  botId: string;
  userId: number;
  token: string;
  config: Pick<AppConfig, "publicBaseUrl">;
  level: DegradeLevel;
  now: number;
  nowMs: number;
  fetchFn?: typeof fetch;
  ctx?: WaitUntil;
}

/** POST /api/app/:botId/card (already authenticated by the caller). */
export async function createCard(a: CardPostArgs): Promise<Response> {
  if (a.level >= 1) {
    throw new HttpError(503, "degraded", "card creation is off in light mode", {
      "retry-after": String(secondsUntilReset(a.now)),
    });
  }
  const ct = a.req.headers.get("content-type") ?? "";
  if (!/^image\/png\s*(?:;|$)/i.test(ct)) throw new HttpError(415, "unsupported_media_type", "content-type must be image/png");
  const bytes = await readBytes(a.req, CARD_MAX_BYTES);
  assertPng(bytes);
  if (limiterFor(a.db).limited(`${a.botId}:${a.userId}`, a.nowMs)) {
    throw new HttpError(429, "rate_limited", "10 cards per hour", { "retry-after": "360" });
  }
  const id = newCardId();
  // D1 wants an ArrayBuffer for BLOB parameters; copy so the buffer covers exactly the PNG bytes.
  const blob = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await a.db
    .prepare("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, a.botId, a.userId, blob, a.now)
    .run();
  count(a.db, a.botId, "card:create", 1, { nowMs: a.nowMs, ctx: a.ctx });
  const base = a.config.publicBaseUrl ?? new URL(a.req.url).origin;
  const url = `${base}/card/${id}.png`;
  const prepared = await savePrepared({
    fetchFn: a.fetchFn ?? globalFetch,
    token: a.token,
    botId: a.botId,
    userId: a.userId,
    cardId: id,
    url,
    caption: readCaption(a.req),
  });
  return json(
    { id, url, prepared_id: prepared.id, prepared_expires_at: prepared.expiresAt, expires_at: a.now + CARD_TTL_S },
    201,
  );
}

// ---- GET /card/<id>.png -----------------------------------------------------------------------------------------

export interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

/** The Workers edge cache (caches.default); absent outside Workers (unit tests inject their own). */
function edgeCache(): CacheLike | undefined {
  return (globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default;
}

const notFound = (): Response =>
  new Response("not found", { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });

function toBytes(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v) && v.every((x) => Number.isInteger(x))) return Uint8Array.from(v as number[]);
  return null;
}

export interface CardGetArgs {
  req: Request;
  db: Db;
  now: number;
  nowMs: number;
  cache?: CacheLike;
  ctx?: WaitUntil;
}

/** Public (no token): the id is 128 random bits. Edge-cached so repeated fetches do not read D1. */
export async function serveCard(a: CardGetArgs): Promise<Response> {
  if (a.req.method !== "GET" && a.req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const url = new URL(a.req.url);
  const m = CARD_PATH_RE.exec(url.pathname);
  if (!m) return notFound();
  const head = a.req.method === "HEAD";
  const headers = (len: number): Record<string, string> => ({
    "content-type": "image/png",
    "cache-control": "public, max-age=86400, immutable",
    "x-content-type-options": "nosniff",
    "content-length": String(len),
  });
  const cache = a.cache ?? edgeCache();
  const key = new Request(`${url.origin}/card/${m[1]}.png`, { method: "GET" });

  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        const body = new Uint8Array(await hit.arrayBuffer());
        count(a.db, PLATFORM_BOT, "card:view", 1, { nowMs: a.nowMs, ctx: a.ctx });
        return new Response(head ? null : body, { status: 200, headers: headers(body.length) });
      }
    } catch (e) {
      log("warn", "cards: cache read failed", { error: errInfo(e) });
    }
  }

  const row = await a.db.prepare("SELECT png, created_at FROM cards WHERE id = ?").bind(m[1]).first<{ png: unknown; created_at: number }>();
  const bytes = row ? toBytes(row.png) : null;
  const remaining = row ? Number(row.created_at) + CARD_TTL_S - a.now : 0;
  if (!row || !bytes || !(remaining > 0)) return notFound();
  count(a.db, PLATFORM_BOT, "card:view", 1, { nowMs: a.nowMs, ctx: a.ctx });

  if (cache) {
    // The edge copy must not outlive the 72 h window: its TTL is the time left, not the 24 h the client may cache.
    const put = cache
      .put(key, new Response(bytes, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${Math.min(remaining, 86400)}` } }))
      .catch((e: unknown) => log("warn", "cards: cache write failed", { error: errInfo(e) }));
    if (a.ctx) a.ctx.waitUntil(put);
    else await put;
  }
  return new Response(head ? null : bytes, { status: 200, headers: headers(bytes.length) });
}

/** Cron: removes cards older than the TTL. */
export async function purgeExpiredCards(db: Db, now: number): Promise<void> {
  await db.prepare("DELETE FROM cards WHERE created_at < ?").bind(now - CARD_TTL_S).run();
}
