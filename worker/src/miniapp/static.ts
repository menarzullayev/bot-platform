// Serves the Mini App single-page app (built into ./public/app by `npm run build:app`) through the ASSETS binding.
// The Worker runs first for /app and /app/* (wrangler.toml run_worker_first) so that every response carries the
// security headers below and unknown client-side routes fall back to index.html (SPA).

import type { Env } from "../env";

/**
 * Content-Security-Policy decisions:
 * - script-src: only our own bundle and Telegram's SDK (https://telegram.org/js/telegram-web-app.js). No inline script.
 * - style-src 'self' WITHOUT 'unsafe-inline': our CSS is an external file and DOM styling goes through CSSOM
 *   (element.style.x = ..., setProperty), which CSP does not restrict. Cost: the SDK's optional <style> injection
 *   (custom styles pushed by Telegram Web) is blocked; that is cosmetic only.
 * - connect-src 'self': the app talks to its own origin only (same-origin API).
 * - frame-ancestors: Telegram Web embeds Mini Apps in an iframe. The exact embedding origins are not listed in the
 *   Mini Apps documentation (unconfirmed); the whole telegram.org family is allowed, everything else is denied.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors https://telegram.org https://*.telegram.org",
].join("; ");

const HASHED = /-[A-Z0-9]{8}\.(?:js|css)$/;
const HAS_EXT = /\.[A-Za-z0-9]{1,8}$/;
const INDEX = "/app/index.html";

export function applySecurityHeaders(h: Headers): void {
  h.set("content-security-policy", CSP);
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "no-referrer");
  h.set("permissions-policy", "geolocation=(), camera=(), microphone=(), payment=()");
}

/** Which built file answers this request path, or null for 404 (a missing file with an extension never gets index.html). */
export function assetPathFor(pathname: string): string | null {
  if (pathname === "/app" || pathname === "/app/") return INDEX;
  if (!pathname.startsWith("/app/")) return null;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (HAS_EXT.test(last)) return pathname;
  return INDEX; // client-side route
}

export async function serveApp(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  if (!env.ASSETS) return new Response("app not available", { status: 503 });
  const url = new URL(req.url);
  const path = assetPathFor(url.pathname);
  if (!path) return new Response("not found", { status: 404 });

  const target = new URL(path, url);
  const res = await env.ASSETS.fetch(new Request(target, { method: req.method, headers: req.headers }));
  const headers = new Headers(res.headers);
  applySecurityHeaders(headers);
  if (res.status === 404 || res.status >= 500) {
    headers.set("cache-control", "no-store");
    // index.html itself missing means the build step did not run
    if (res.status === 404 && path === INDEX) return new Response("app not built", { status: 503, headers });
    return new Response(res.body, { status: res.status, headers });
  }
  headers.set("cache-control", HASHED.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
