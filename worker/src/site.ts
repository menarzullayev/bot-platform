// Static site (landing, /privacy, /terms, /support, /site/*, /brand/*) served from the ASSETS binding.
// The Mini App (/app) keeps its own handler and CSP in miniapp/static.ts; everything else gets this stricter,
// script-free-of-third-parties policy.

import type { Env } from "./env";

export const SITE_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const HAS_EXT = /\.[A-Za-z0-9]{1,8}$/;
const SUSPICIOUS = /%(?:2e|2f|5c|00)|\|\0/i;

/**
 * Files tried for a request path (assets use html_handling = "none", so extension-less pages are mapped here):
 * "/" -> /index.html; "/privacy" -> /privacy, /privacy.html, /privacy/index.html; "/site/a.css" -> itself.
 */
export function siteCandidates(pathname: string): string[] {
  if (pathname.endsWith("/")) return [pathname + "index.html"];
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (HAS_EXT.test(last)) return [pathname];
  return [pathname, pathname + ".html", pathname + "/index.html"];
}

export function applySiteHeaders(h: Headers, isHtml: boolean): void {
  h.set("content-security-policy", SITE_CSP);
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "no-referrer");
  h.set("permissions-policy", "geolocation=(), camera=(), microphone=(), payment=()");
  if (isHtml) h.set("cache-control", "no-cache");
  else if (!h.has("cache-control")) h.set("cache-control", "public, max-age=3600");
}

const notFound = (): Response =>
  new Response("not found", {
    status: 404,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": SITE_CSP },
  });

/** GET/HEAD of any path the Worker does not own: asset if present, otherwise 404. */
export async function serveSite(req: Request, env: Env): Promise<Response> {
  if ((req.method !== "GET" && req.method !== "HEAD") || !env.ASSETS) return notFound();
  const url = new URL(req.url);
  if (SUSPICIOUS.test(url.pathname)) return notFound();
  for (const c of siteCandidates(url.pathname)) {
    const res = await env.ASSETS.fetch(new Request(new URL(c, url), { method: req.method, headers: req.headers }));
    if (res.status === 404) continue;
    const headers = new Headers(res.headers);
    applySiteHeaders(headers, (headers.get("content-type") ?? "").toLowerCase().startsWith("text/html"));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  // friendly HTML 404 page when the visitor is a browser (the file is built by site/build.mjs; plain text otherwise)
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    const res = await env.ASSETS.fetch(new Request(new URL("/404.html", url), { method: req.method }));
    if (res.status === 200) {
      const headers = new Headers(res.headers);
      applySiteHeaders(headers, true);
      headers.set("cache-control", "no-store");
      return new Response(res.body, { status: 404, headers });
    }
  }
  return notFound();
}
