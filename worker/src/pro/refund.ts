import { decryptToken } from "../crypto";
import { getBot, type Db } from "../db";
import type { Env } from "../env";
import { errInfo, log } from "../log";
import { getPayment, revokeByCharge } from "./entitlement";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const CHARGE_RE = /^[A-Za-z0-9_.:-]{1,256}$/;

/**
 * POST /admin/bots/:id/refund {user_id, charge_id}. Authentication (Bearer ADMIN_TOKEN) is done by handleAdmin.
 * Order: validate -> Telegram refundStarPayment -> only on success mark payments.refunded=1 and recompute pro_until.
 * The bot token is used only inside this function and never appears in a response or log.
 */
export async function handleRefund(
  req: Request,
  env: Env,
  botId: string,
  d: { db: Db; fetchFn: typeof fetch; now: () => number },
): Promise<Response> {
  let body: { user_id?: unknown; charge_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON kerak" }, 400);
  }
  const userId = body.user_id;
  const chargeId = body.charge_id;
  if (typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0) {
    return json({ error: "user_id: musbat butun son kerak" }, 400);
  }
  if (typeof chargeId !== "string" || !CHARGE_RE.test(chargeId)) return json({ error: "charge_id noto'g'ri" }, 400);

  const row = await getBot(d.db, botId);
  if (!row) return json({ error: "bot topilmadi" }, 404);

  const existing = await getPayment(d.db, chargeId);
  if (existing && (existing.bot_id !== botId || existing.user_id !== userId)) {
    return json({ error: "to'lov boshqa bot yoki foydalanuvchiga tegishli" }, 409);
  }
  if (existing && existing.refunded === 1) return json({ error: "allaqachon qaytarilgan" }, 409);

  const token = await decryptToken(env.TOKEN_KEY, row.token_enc);
  let tg: { ok?: boolean; description?: string };
  try {
    const res = await d.fetchFn(`https://api.telegram.org/bot${token}/refundStarPayment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, telegram_payment_charge_id: chargeId }),
    });
    tg = (await res.json()) as { ok?: boolean; description?: string };
  } catch (e) {
    log("error", "refund: Telegram call failed", { botId, chargeId, error: errInfo(e, token) });
    return json({ error: "Telegram'ga ulanib bo'lmadi" }, 502);
  }
  if (tg.ok !== true) {
    log("warn", "refund: Telegram rejected", { botId, chargeId, description: String(tg.description ?? "").slice(0, 200) });
    return json({ error: "refundStarPayment muvaffaqiyatsiz", description: String(tg.description ?? "").slice(0, 200) }, 502);
  }

  try {
    const r = await revokeByCharge(d.db, { botId, chargeId, now: d.now() });
    log("info", "refund: done", { botId, chargeId, userId, revoked: r.found });
    return json({ ok: true, refunded: true, revoked: r.found, pro_until: r.proUntil ?? null });
  } catch (e) {
    // Stars are already returned at Telegram; the operator must reconcile by hand.
    log("error", "refund: refunded at Telegram but DB update failed", { botId, chargeId, userId, error: errInfo(e, token) });
    return json({ error: "Telegram'da qaytarildi, lekin bazani yangilab bo'lmadi", refunded: true, revoked: false }, 500);
  }
}
