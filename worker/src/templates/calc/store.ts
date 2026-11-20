// D1 access of the calc template: per-user settings (`users`) and calculation history (`history`).
// Budget rule: one read per update (getUserState); writes only when something actually changed.

import type { AngleMode } from "../../calc";
import type { Db } from "../../db";
import { isLang, type Lang } from "../../i18n";
import { PRO_LIMITS } from "../../pro";
import { STYLE_IDS, pickEnum, type StyleId } from "./style";

export const DIGIT_CHOICES = [6, 12, 20] as const;
export type Digits = (typeof DIGIT_CHOICES)[number];

export interface UserState {
  /** False when the user has no row yet (defaults are in effect). */
  exists: boolean;
  lang: Lang | null;
  angle: AngleMode;
  digits: Digits;
  keepHistory: boolean;
  /** Unix seconds; 0 = never Pro. */
  proUntil: number;
  /** null = never chosen (Tactile applies). */
  style: StyleId | null;
}

export const DEFAULT_STATE: UserState = {
  exists: false,
  lang: null,
  angle: "deg",
  digits: 12,
  keepHistory: false,
  proUntil: 0,
  style: null,
};

interface UserRow {
  lang: string | null;
  angle: string | null;
  digits: number | null;
  pro_until: number | null;
  keep_history: number | null;
  style: string | null;
}

export const isDigits = (n: unknown): n is Digits => (DIGIT_CHOICES as readonly unknown[]).includes(n);

export async function getUserState(db: Db, botId: string, userId: number): Promise<UserState> {
  const row = await db
    .prepare("SELECT lang, angle, digits, pro_until, keep_history, style FROM users WHERE bot_id = ? AND user_id = ?")
    .bind(botId, userId)
    .first<UserRow>();
  if (!row) return { ...DEFAULT_STATE };
  return {
    exists: true,
    lang: isLang(row.lang) ? row.lang : null,
    angle: row.angle === "rad" ? "rad" : "deg",
    digits: isDigits(Number(row.digits)) ? (Number(row.digits) as Digits) : 12,
    keepHistory: row.keep_history === 1,
    proUntil: Number(row.pro_until ?? 0),
    style: pickEnum(STYLE_IDS, row.style),
  };
}

export type UserField = "lang" | "angle" | "digits" | "keep_history" | "style";
const FIELDS: readonly UserField[] = ["lang", "angle", "digits", "keep_history", "style"];

/** Upserts exactly one settings column (whitelisted name, bound value); pro_until is never touched. */
export async function setUserField(
  db: Db,
  botId: string,
  userId: number,
  field: UserField,
  value: string | number,
  now: number,
): Promise<void> {
  if (!FIELDS.includes(field)) throw new Error("bad field");
  await db
    .prepare(
      `INSERT INTO users (bot_id, user_id, ${field}, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ` +
        `ON CONFLICT (bot_id, user_id) DO UPDATE SET ${field} = excluded.${field}, updated_at = excluded.updated_at`,
    )
    .bind(botId, userId, value, now, now)
    .run();
}

export interface HistoryRow {
  expr: string;
  result: string;
  ts: number;
}

/** Rows kept per user (the Pro limit); older ones are pruned. */
export const HISTORY_KEEP = PRO_LIMITS.proHistory;
const PRUNE_EVERY = 25;
let inserts = 0;

export async function addHistory(db: Db, botId: string, userId: number, expr: string, result: string, ts: number): Promise<void> {
  await db
    .prepare("INSERT INTO history (bot_id, user_id, expr, result, ts) VALUES (?, ?, ?, ?, ?)")
    .bind(botId, userId, expr.slice(0, 500), result.slice(0, 200), ts)
    .run();
  // Pruning costs a write, so it runs on every PRUNE_EVERY-th insert of this isolate only.
  if (++inserts % PRUNE_EVERY === 0) {
    await db
      .prepare(
        "DELETE FROM history WHERE bot_id = ? AND user_id = ? AND id NOT IN (SELECT id FROM history WHERE bot_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?)",
      )
      .bind(botId, userId, botId, userId, HISTORY_KEEP)
      .run();
  }
}

export async function listHistory(db: Db, botId: string, userId: number, limit: number): Promise<HistoryRow[]> {
  const r = await db
    .prepare("SELECT expr, result, ts FROM history WHERE bot_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?")
    .bind(botId, userId, limit)
    .all<HistoryRow>();
  return r.results ?? [];
}

export async function clearHistory(db: Db, botId: string, userId: number): Promise<void> {
  await db.prepare("DELETE FROM history WHERE bot_id = ? AND user_id = ?").bind(botId, userId).run();
}

/**
 * /deleteme: wipes history, settings and the platform user row. The `users` row itself and `payments` stay
 * (pro_until is derived from payments and must survive; payment records are needed for refunds and accounting).
 */
export async function deleteUserData(db: Db, botId: string, userId: number, now: number): Promise<void> {
  await clearHistory(db, botId, userId);
  await db
    .prepare("UPDATE users SET lang = NULL, angle = 'deg', digits = 12, keep_history = 0, style = NULL, contrast = NULL, density = NULL, lite = NULL, fs = NULL, updated_at = ? WHERE bot_id = ? AND user_id = ?")
    .bind(now, botId, userId)
    .run();
  await db.prepare("DELETE FROM bot_users WHERE bot_id = ? AND user_id = ?").bind(botId, userId).run();
}

/** Test hook. */
export function resetInsertCounter(): void {
  inserts = 0;
}
