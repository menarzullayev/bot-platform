import type { Db } from "../db";
import { SUBSCRIPTION_PERIOD_S } from "./config";
import { computePeriodEnd, getEntitlement, grantPeriod } from "./entitlement";
import { checkPaymentPayload } from "./payload";

/** The subset of Telegram's SuccessfulPayment that this module reads. */
export interface SuccessfulPaymentLike {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
  subscription_expiration_date?: number;
}

export type PaymentKind = "subscription_first" | "subscription_renewal" | "subscription";

export type PaymentOutcome =
  | { ok: true; granted: boolean; renewal: boolean; kind: PaymentKind; proUntil: number; chargeId: string }
  | { ok: false; reason: string; chargeId: string };

/**
 * Telegram's own expiry is authoritative (it is what Telegram bills against) but is sanity-checked:
 * it must lie in the future and at most two periods ahead. Anything else falls back to our own computation.
 */
export function resolvePeriodEnd(expiry: unknown, currentProUntil: number, now: number): number {
  if (
    typeof expiry === "number" &&
    Number.isInteger(expiry) &&
    expiry > now &&
    expiry <= now + 2 * SUBSCRIPTION_PERIOD_S
  ) {
    return expiry;
  }
  return computePeriodEnd(currentProUntil, now);
}

/** Validates a successful_payment and grants the period. Throws only on DB failure (caller must log the charge id). */
export async function processSuccessfulPayment(
  db: Db,
  a: { botId: string; fromId: number; sp: SuccessfulPaymentLike; now: number },
): Promise<PaymentOutcome> {
  const chargeId = typeof a.sp.telegram_payment_charge_id === "string" ? a.sp.telegram_payment_charge_id : "";
  if (!chargeId || chargeId.length > 256) return { ok: false, reason: "charge_id", chargeId };
  const check = checkPaymentPayload(
    { payload: a.sp.invoice_payload, currency: a.sp.currency, totalAmount: a.sp.total_amount },
    a.botId,
    a.fromId,
  );
  if (!check.ok) return { ok: false, reason: check.reason, chargeId };

  const cur = await getEntitlement(db, a.botId, a.fromId, a.now);
  const periodEnd = resolvePeriodEnd(a.sp.subscription_expiration_date, cur.proUntil, a.now);
  const renewal = a.sp.is_recurring === true && a.sp.is_first_recurring !== true;
  const kind: PaymentKind = a.sp.is_first_recurring ? "subscription_first" : a.sp.is_recurring ? "subscription_renewal" : "subscription";
  const g = await grantPeriod(db, {
    botId: a.botId,
    userId: a.fromId,
    chargeId,
    stars: a.sp.total_amount,
    periodEnd,
    payload: a.sp.invoice_payload,
    kind,
    now: a.now,
  });
  return { ok: true, granted: g.granted, renewal, kind, proUntil: g.proUntil, chargeId };
}
