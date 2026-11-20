// Sharing a result as a picture card (DEC-011, DEC-013, DEC-014): draw it on a canvas in the user's style, shrink the JPEG
// until it is <= 60 KB, upload it, then hand Telegram the prepared message (shareMessage) or, when Telegram could not
// prepare one, a t.me/share link to the card URL. Everything environmental (canvas, API, Telegram, theme) is injected so
// the whole flow runs in tests with stubs; ui/share.ts wires the real ones.

import { SHARE_SIZE, type ShareData, type ShareSize, type StyleTokens, type TokenSet } from "../contract/model";
import type { MsKey } from "../strings";
import { ApiError, type Api } from "./api";

/** Ask the canvas for JPEGs until one is at most this big (the server accepts 64 KB; the margin covers the caption). */
export const CARD_TARGET_BYTES = 60 * 1024;
/** Quality ladder of toBlob('image/jpeg', q). */
export const JPEG_QUALITIES: readonly number[] = [0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4, 0.32, 0.25];
export const CAPTION_LIMIT = 200;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d", opts?: { alpha: boolean }): CanvasRenderingContext2D | null;
  toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number): void;
}

export interface Scheme {
  dark: boolean;
  /** contrast axis = high */
  high: boolean;
}

export interface SharePack {
  tokens: StyleTokens;
  drawShareCard?(ctx: CanvasRenderingContext2D, data: ShareData, size: ShareSize, tokens: TokenSet, dark: boolean): void;
}

/** The token set the card is painted with: the scheme being shown, high contrast included. */
export function shareTokens(tokens: StyleTokens, s: Scheme): TokenSet {
  const group = s.high ? tokens.contrastHigh : tokens;
  return s.dark ? group.dark : group.light;
}

/** Plain-text caption sent with the card (shown under the picture when it is shared as a photo). */
export function captionOf(d: ShareData): string {
  const text = d.sub ? `${d.sub} = ${d.main}` : d.main;
  return [...text].slice(0, CAPTION_LIMIT).join("");
}

export type ShareFail = "unavailable" | "busy" | "light" | "rate" | "server" | "network" | "render" | "auth";

export type ShareOutcome = { ok: true; via: "message"; sent: boolean } | { ok: true; via: "link" } | { ok: false; reason: ShareFail };

export interface ShareDeps {
  makeCanvas(): CanvasLike;
  api: Pick<Api, "card"> | null;
  pack: SharePack | null;
  scheme(): Scheme;
  /** Opened as a real Mini App (signed initData) and not in an authentication-error state. */
  signedIn: boolean;
  /** DEC-013 level from /me (>= 1: card creation is off). */
  degraded: number;
  shareMessage(preparedId: string): Promise<boolean>;
  /** Opens a t.me link in Telegram; false when impossible. */
  openLink(url: string): boolean;
}

/** The button is offered only when a card can really be made and sent: Telegram, signed in, not in light mode, pack paints cards. */
export function canShare(d: Pick<ShareDeps, "api" | "pack" | "signedIn" | "degraded">): boolean {
  return d.signedIn && d.api !== null && d.degraded < 1 && typeof d.pack?.drawShareCard === "function";
}

function toBlob(c: CanvasLike, q: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), "image/jpeg", q);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Paints the card (720x405, devicePixelRatio 1) and encodes it as JPEG, lowering the quality until it fits
 * CARD_TARGET_BYTES. Throws when the style cannot paint, the engine cannot encode JPEG (it would hand back a PNG) or no
 * quality is small enough.
 */
export async function renderCardJpeg(data: ShareData, pack: SharePack, scheme: Scheme, makeCanvas: () => CanvasLike): Promise<Blob> {
  const draw = pack.drawShareCard;
  if (!draw) throw new Error("style has no share card");
  const canvas = makeCanvas();
  canvas.width = SHARE_SIZE.w;
  canvas.height = SHARE_SIZE.h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no 2d context");
  draw(ctx, data, SHARE_SIZE, shareTokens(pack.tokens, scheme), scheme.dark);
  for (const q of JPEG_QUALITIES) {
    const blob = await toBlob(canvas, q);
    if (!blob) throw new Error("toBlob failed");
    if (blob.type !== "image/jpeg") throw new Error("engine cannot encode JPEG");
    if (blob.size <= CARD_TARGET_BYTES) return blob;
  }
  throw new Error("card too large");
}

/** Maps an API failure to the user-facing reason. */
export function failFromError(e: unknown): ShareFail {
  if (e instanceof ApiError) {
    if (e.status === 503 && e.code === "degraded") return "light";
    if (e.status === 429) return "rate";
    if (e.status === 401 || e.status === 403 || e.status === 404) return "auth";
    return "server";
  }
  return "network";
}

let busy = false;

export async function shareCard(data: ShareData, d: ShareDeps): Promise<ShareOutcome> {
  if (!canShare(d) || !d.pack || !d.api) return { ok: false, reason: "unavailable" };
  if (busy) return { ok: false, reason: "busy" };
  busy = true;
  try {
    let blob: Blob;
    try {
      blob = await renderCardJpeg(data, d.pack, d.scheme(), d.makeCanvas);
    } catch {
      return { ok: false, reason: "render" };
    }
    let card;
    try {
      card = await d.api.card(blob, captionOf(data));
    } catch (e) {
      return { ok: false, reason: failFromError(e) };
    }
    if (card.prepared_id) {
      try {
        return { ok: true, via: "message", sent: await d.shareMessage(card.prepared_id) };
      } catch {
        /* an old client: the link below works everywhere */
      }
    }
    if (d.openLink("https://t.me/share/url?url=" + encodeURIComponent(card.url))) return { ok: true, via: "link" };
    return { ok: false, reason: "unavailable" };
  } finally {
    busy = false;
  }
}

/** The toast text of a failed share (null: nothing to tell the user). */
export function failKey(reason: ShareFail): MsKey | null {
  switch (reason) {
    case "light":
      return "share_err_light";
    case "rate":
      return "share_err_rate";
    case "server":
      return "share_err_server";
    case "network":
      return "err_network";
    case "render":
      return "share_err_render";
    case "auth":
      return "err_auth";
    default:
      return null;
  }
}
