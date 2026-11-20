import { parseProConfig } from "../../pro";

export interface CalcConfig {
  /** Stars charged per 30-day Pro period. */
  proStars: number;
  /** Path of the Mini App on PUBLIC_BASE_URL (starts with "/"). */
  miniAppPath: string;
  /** Optional support contact shown under /privacy and /terms: "@username", an https URL or an e-mail. */
  supportContact?: string;
}

export const DEFAULT_MINI_APP_PATH = "/app/";

const PATH_RE = /^\/[A-Za-z0-9_\-./]*$/;
const CONTACT_RE = /^(@[A-Za-z0-9_]{4,32}|https:\/\/[^\s<>"]{3,200}|[^\s@<>"]{1,64}@[^\s@<>"]{1,100}\.[A-Za-z]{2,})$/;

/** Validates the raw bot config; throws Error with a user-facing message. */
export function parseCalcConfig(raw: unknown): CalcConfig {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new Error("config: obyekt bo'lishi kerak");
  }
  const c = (raw ?? {}) as { proStars?: unknown; miniAppPath?: unknown; supportContact?: unknown };
  const { proStars } = parseProConfig(c);

  let miniAppPath = DEFAULT_MINI_APP_PATH;
  if (c.miniAppPath !== undefined && c.miniAppPath !== null) {
    const p = c.miniAppPath;
    if (typeof p !== "string" || p.length > 100 || !PATH_RE.test(p) || p.startsWith("//") || p.includes("..")) {
      throw new Error("miniAppPath: '/' bilan boshlanuvchi yo'l bo'lishi kerak (masalan /app/)");
    }
    miniAppPath = p;
  }

  const out: CalcConfig = { proStars, miniAppPath };
  if (c.supportContact !== undefined && c.supportContact !== null) {
    const s = c.supportContact;
    if (typeof s !== "string" || !CONTACT_RE.test(s.trim())) {
      throw new Error("supportContact: @username, https havola yoki e-mail bo'lishi kerak");
    }
    out.supportContact = s.trim();
  }
  return out;
}
