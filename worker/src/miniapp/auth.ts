// Telegram Mini App initData verification (official algorithm, core.telegram.org/bots/webapps
// "Validating data received via the Mini App"):
//   data_check_string = all received fields except `hash`, sorted alphabetically, "key=value" joined with "\n"
//   secret_key        = HMAC_SHA256(key = "WebAppData", message = bot_token)
//   hash              = hex(HMAC_SHA256(key = secret_key, message = data_check_string))
// The bot token is only ever used as HMAC input here; it is never returned, logged or put in an error.

import { timingSafeEqual } from "../crypto";

export const MAX_INITDATA_LEN = 4096;
/** How far in the future auth_date may lie (clock skew between Telegram and this isolate), seconds. */
export const MAX_FUTURE_SKEW_S = 60;

export type InitDataFailure = "malformed" | "bad_hash" | "expired" | "future" | "bad_user";

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export type InitDataResult = { ok: true; user: TgUser; authDate: number } | { ok: false; reason: InitDataFailure };

const enc = new TextEncoder();
const HEX64 = /^[0-9a-f]{64}$/;

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** The exact string Telegram signs: every field except `hash`, sorted by key, "key=value" per line. */
export function buildDataCheckString(fields: Map<string, string>): string {
  return [...fields.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function parseFields(initData: string): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const [k, v] of new URLSearchParams(initData)) {
    if (out.has(k)) return null; // duplicated key: ambiguous, reject
    out.set(k, v);
  }
  return out;
}

function parseUser(raw: string | undefined): TgUser | null {
  if (raw === undefined || raw.length > 2048) return null;
  let u: unknown;
  try {
    u = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof u !== "object" || u === null || Array.isArray(u)) return null;
  const o = u as Record<string, unknown>;
  if (typeof o.id !== "number" || !Number.isSafeInteger(o.id) || o.id <= 0) return null;
  if (typeof o.first_name !== "string" || o.first_name.length > 256) return null;
  const user: TgUser = { id: o.id, first_name: o.first_name };
  for (const key of ["last_name", "username", "language_code"] as const) {
    const v = o[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > 256) return null;
    user[key] = v;
  }
  if (o.is_premium !== undefined) {
    if (typeof o.is_premium !== "boolean") return null;
    user.is_premium = o.is_premium;
  }
  return user;
}

/**
 * Verifies Telegram's HMAC and the freshness of auth_date, then validates the `user` JSON.
 * `now` is Unix seconds. Never throws for bad input (only a failing WebCrypto would throw).
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  opts: { now: number; maxAgeS: number },
): Promise<InitDataResult> {
  if (typeof initData !== "string" || initData.length === 0 || initData.length > MAX_INITDATA_LEN) {
    return { ok: false, reason: "malformed" };
  }
  const fields = parseFields(initData);
  if (!fields) return { ok: false, reason: "malformed" };
  const given = fields.get("hash");
  if (given === undefined || !HEX64.test(given)) return { ok: false, reason: "malformed" };

  const secret = await hmacSha256(enc.encode("WebAppData"), enc.encode(botToken));
  const expected = toHex(await hmacSha256(secret, enc.encode(buildDataCheckString(fields))));
  if (!timingSafeEqual(expected, given)) return { ok: false, reason: "bad_hash" };

  const rawDate = fields.get("auth_date");
  if (rawDate === undefined || !/^\d{1,12}$/.test(rawDate)) return { ok: false, reason: "malformed" };
  const authDate = Number(rawDate);
  if (opts.now - authDate > opts.maxAgeS) return { ok: false, reason: "expired" };
  if (authDate - opts.now > MAX_FUTURE_SKEW_S) return { ok: false, reason: "future" };

  const user = parseUser(fields.get("user"));
  if (!user) return { ok: false, reason: "bad_user" };
  return { ok: true, user, authDate };
}

/** `Authorization: tma <initData>` -> initData, or null. */
export function parseAuthHeader(value: string | null): string | null {
  if (!value) return null;
  const m = /^tma +(\S.*)$/i.exec(value.trim());
  return m ? m[1] : null;
}
