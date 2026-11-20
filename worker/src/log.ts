import type { LogLevel } from "./env";

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const SECRET_KEY = /token|secret|authorization|key/i;
// Telegram bot token shape: 6-12 digits, colon, 30+ url-safe chars.
const BOT_TOKEN = /\d{6,12}:[A-Za-z0-9_-]{30,}/g;
const MASK = "[redacted]";
const MAX_DEPTH = 5;

let current: LogLevel = "info";
let sink: ((level: LogLevel, line: string) => void) | null = null;

export function setLogLevel(level: LogLevel): void {
  current = level;
}

/** Test hook: capture log lines instead of writing to the console. */
export function setLogSink(fn: ((level: LogLevel, line: string) => void) | null): void {
  sink = fn;
}

/** Recursively masks values stored under secret-looking keys and bot tokens inside strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(BOT_TOKEN, MASK);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? MASK : redact(v, depth + 1);
  }
  return out;
}

export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] > ORDER[current]) return;
  const safe = redact(fields) as Record<string, unknown>;
  const line = JSON.stringify({ ...safe, level, msg: redact(msg) });
  if (sink) return sink(level, line);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Error -> loggable object; strips the exact bot token if it leaked into a message. */
export function errInfo(e: unknown, token?: string): { name: string; message: string } {
  const err = e instanceof Error ? e : new Error(String(e));
  let message = err.message;
  if (token) message = message.split(token).join(MASK);
  return { name: err.name, message };
}
