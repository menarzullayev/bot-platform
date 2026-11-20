import { MAX_PRO_STARS, STARS_CURRENCY } from "./config";

const PAYLOAD_RE = /^pro:([A-Za-z0-9_-]{1,32}):(\d{1,15}):v1$/;

/** Invoice payload (Bot API: 1-128 bytes). Bot ids never contain a colon (see ID_RE in admin.ts). */
export function buildPayload(botId: string, userId: number): string {
  return `pro:${botId}:${userId}:v1`;
}

export function parsePayload(payload: unknown): { botId: string; userId: number } | null {
  if (typeof payload !== "string") return null;
  const m = PAYLOAD_RE.exec(payload);
  if (!m) return null;
  const userId = Number(m[2]);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  return { botId: m[1], userId };
}

export type CheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Pure, DB-less validation used for pre_checkout_query (must answer within 10 s) and re-used
 * for successful_payment. The amount is NOT compared with the current price on purpose:
 * an invoice link created before a price change must still be payable.
 */
export function checkPaymentPayload(
  p: { payload: unknown; currency: unknown; totalAmount: unknown },
  botId: string,
  fromId: number,
): CheckResult {
  if (p.currency !== STARS_CURRENCY) return { ok: false, reason: "currency" };
  if (
    typeof p.totalAmount !== "number" ||
    !Number.isInteger(p.totalAmount) ||
    p.totalAmount < 1 ||
    p.totalAmount > MAX_PRO_STARS
  ) {
    return { ok: false, reason: "amount" };
  }
  const parsed = parsePayload(p.payload);
  if (!parsed) return { ok: false, reason: "payload_shape" };
  if (parsed.botId !== botId) return { ok: false, reason: "bot_mismatch" };
  if (parsed.userId !== fromId) return { ok: false, reason: "user_mismatch" };
  return { ok: true };
}
