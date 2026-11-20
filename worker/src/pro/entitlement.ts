import type { Db } from "../db";
import { SUBSCRIPTION_PERIOD_S } from "./config";

export interface Entitlement {
  isPro: boolean;
  /** Unix seconds; 0 when the user never had Pro. */
  proUntil: number;
}

export interface PaymentRow {
  charge_id: string;
  bot_id: string;
  user_id: number;
  stars: number;
  kind: string | null;
  period_end: number | null;
  created_at: number;
  refunded: number;
}

export interface GrantInput {
  botId: string;
  userId: number;
  chargeId: string;
  stars: number;
  periodEnd: number;
  payload: string;
  kind: string;
  now: number;
}

interface UserRow {
  pro_until: number | null;
  lang: string | null;
}

const SELECT_USER = "SELECT pro_until, lang FROM users WHERE bot_id = ? AND user_id = ?";

export async function getEntitlement(db: Db, botId: string, userId: number, now: number): Promise<Entitlement> {
  const row = await db.prepare(SELECT_USER).bind(botId, userId).first<UserRow>();
  const proUntil = row?.pro_until ?? 0;
  return { isPro: proUntil > now, proUntil };
}

/** Stored language preference (users.lang) or null. */
export async function getUserLang(db: Db, botId: string, userId: number): Promise<string | null> {
  const row = await db.prepare(SELECT_USER).bind(botId, userId).first<UserRow>();
  return row?.lang ?? null;
}

/** Period end for a payment without a Telegram expiration date: extend from the end, or from now if lapsed. */
export function computePeriodEnd(currentProUntil: number, now: number): number {
  return Math.max(currentProUntil, now) + SUBSCRIPTION_PERIOD_S;
}

/**
 * pro_until is always derived: MAX(period_end) over the user's non-refunded payments.
 * Deriving (instead of incrementing) is what makes grants idempotent and refunds exact.
 */
async function recompute(db: Db, botId: string, userId: number, now: number): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET pro_until = COALESCE((SELECT MAX(period_end) FROM payments WHERE bot_id = ? AND user_id = ? AND refunded = 0), 0), updated_at = ? WHERE bot_id = ? AND user_id = ?",
    )
    .bind(botId, userId, now, botId, userId)
    .run();
}

async function ensureUser(db: Db, botId: string, userId: number, now: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO users (bot_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(botId, userId, now, now)
    .run();
}

export function getPayment(db: Db, chargeId: string): Promise<PaymentRow | null> {
  return db
    .prepare(
      "SELECT charge_id, bot_id, user_id, stars, kind, period_end, created_at, refunded FROM payments WHERE charge_id = ?",
    )
    .bind(chargeId)
    .first<PaymentRow>();
}

/**
 * Idempotent: charge_id is the primary key, so replaying the same charge never extends twice.
 * Returns granted=false for a duplicate (or a charge_id already owned by another bot/user).
 */
export async function grantPeriod(db: Db, g: GrantInput): Promise<{ granted: boolean; proUntil: number }> {
  await ensureUser(db, g.botId, g.userId, g.now);
  const existing = await getPayment(db, g.chargeId);
  let granted = existing === null;
  if (granted) {
    const r = (await db
      .prepare(
        "INSERT OR IGNORE INTO payments (charge_id, bot_id, user_id, payload, stars, kind, period_end, created_at, refunded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
      )
      .bind(g.chargeId, g.botId, g.userId, g.payload, g.stars, g.kind, g.periodEnd, g.now)
      .run()) as { meta?: { changes?: number } } | undefined;
    if (r?.meta?.changes === 0) granted = false; // lost a race with a concurrent identical update
  }
  await recompute(db, g.botId, g.userId, g.now);
  const e = await getEntitlement(db, g.botId, g.userId, g.now);
  return { granted, proUntil: e.proUntil };
}

/** Marks the charge refunded (scoped to botId) and recomputes pro_until. found=false when this bot has no such charge. */
export async function revokeByCharge(
  db: Db,
  a: { botId: string; chargeId: string; now: number },
): Promise<{ found: boolean; userId?: number; proUntil?: number }> {
  const p = await getPayment(db, a.chargeId);
  if (!p || p.bot_id !== a.botId) return { found: false };
  await db.prepare("UPDATE payments SET refunded = 1 WHERE charge_id = ? AND bot_id = ?").bind(a.chargeId, a.botId).run();
  await ensureUser(db, a.botId, p.user_id, a.now);
  await recompute(db, a.botId, p.user_id, a.now);
  const e = await getEntitlement(db, a.botId, p.user_id, a.now);
  return { found: true, userId: p.user_id, proUntil: e.proUntil };
}

export async function lastPayments(db: Db, botId: string, userId: number, limit = 3): Promise<PaymentRow[]> {
  const r = await db
    .prepare(
      "SELECT charge_id, bot_id, user_id, stars, kind, period_end, created_at, refunded FROM payments WHERE bot_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
    )
    .bind(botId, userId, limit)
    .all<PaymentRow>();
  return r.results;
}
