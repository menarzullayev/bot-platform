// The Worker serves the built site through ASSETS with the same lookup rules as production (html_handling = "none").
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import worker from "../../src/index";
import type { Env } from "../../src/env";
import { SITE_CSP } from "../../src/site";
import { TEST_KEY } from "../helpers";
import { ADMIN_TOKEN, FakeCtx, SqliteDb } from "../p5-helpers";
import { BASE, buildToTmp, type Built } from "./helpers";

let b: Built;
beforeAll(async () => {
  b = await buildToTmp();
}, 60_000);
afterAll(() => b.cleanup());

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", svg: "image/svg+xml", txt: "text/plain", xml: "application/xml", jpg: "image/jpeg", png: "image/png",
};

/** ASSETS fake backed by the real build output: exact file match only, like html_handling = "none". */
function assets(dir: string) {
  const requested: string[] = [];
  const fetcher = {
    async fetch(input: Request | string | URL): Promise<Response> {
      const req = input instanceof Request ? input : new Request(String(input));
      const path = decodeURIComponent(new URL(req.url).pathname);
      requested.push(path);
      try {
        const file = join(dir, path);
        if (!statSync(file).isFile()) throw new Error("dir");
        const ext = path.slice(path.lastIndexOf(".") + 1);
        return new Response(readFileSync(file), { status: 200, headers: { "content-type": TYPES[ext] ?? "application/octet-stream" } });
      } catch {
        return new Response("nope", { status: 404 });
      }
    },
  };
  return { fetcher: fetcher as unknown as Fetcher, requested };
}

function get(path: string, init?: RequestInit) {
  const a = assets(b.dir);
  const env = {
    DB: new SqliteDb() as unknown as D1Database,
    TOKEN_KEY: TEST_KEY,
    ADMIN_TOKEN,
    PUBLIC_BASE_URL: BASE,
    APP_ENV: "production",
    INITDATA_MAX_AGE_S: "3600",
    ASSETS: a.fetcher,
  } as Env;
  return worker.fetch(new Request(BASE + path, init), env, new FakeCtx() as unknown as ExecutionContext).then((r) => ({ r, requested: a.requested }));
}

describe("landing and legal pages through the Worker", () => {
  it.each([
    ["/", 'lang="uz-Latn"', "Yozing. Javob tayyor."],
    ["/ru/", 'lang="ru"', "Напишите. Ответ готов."],
    ["/en/", 'lang="en"', "Type it. Get the answer."],
    ["/uz-cyrl/", 'lang="uz-Cyrl"', "Ёзинг"],
    ["/privacy", 'lang="uz-Latn"', "Maxfiylik siyosati"],
    ["/terms", 'lang="uz-Latn"', "<article"],
    ["/support", 'lang="uz-Latn"', "@menarzullayev"],
    ["/ar/terms", 'dir="rtl"', "شروط الاستخدام"],
    ["/ar/", 'dir="rtl"', "اكتب"],
    ["/tr/privacy", 'lang="tr"', "Gizlilik politikası"],
    ["/es/support", 'lang="es"', "@menarzullayev"],
  ])("GET %s -> 200 html", async (path, a, text) => {
    const { r } = await get(path);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    const body = await r.text();
    expect(body).toContain(a);
    expect(body).toContain(text);
  });

  it("extension-less legal URLs resolve on the second lookup (/x, then /x.html)", async () => {
    const { requested } = await get("/ru/privacy");
    expect(requested).toEqual(["/ru/privacy", "/ru/privacy.html"]);
  });

  it("a trailing slash on a language root works, and /ru without slash too", async () => {
    expect((await get("/ru")).r.status).toBe(200);
    expect((await get("/ru/")).r.status).toBe(200);
  });

  it("every page response carries the strict site CSP and the other security headers; html is revalidated", async () => {
    for (const p of ["/", "/ru/", "/privacy", "/ar/terms", "/site/" + b.result.cssName, "/robots.txt", "/sitemap.xml", "/favicon.svg"]) {
      const { r } = await get(p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get("content-security-policy"), p).toBe(SITE_CSP);
      expect(r.headers.get("x-content-type-options"), p).toBe("nosniff");
    }
    expect((await get("/")).r.headers.get("cache-control")).toBe("no-cache");
  });

  it("hashed css and js are served with the right content types", async () => {
    expect((await get("/site/" + b.result.cssName)).r.headers.get("content-type")).toBe("text/css");
    expect((await get("/site/" + b.result.appName)).r.headers.get("content-type")).toBe("text/javascript");
    expect((await get("/site/" + b.result.bootName)).r.headers.get("content-type")).toBe("text/javascript");
  });

  it("the CSS file referenced by the landing page exists on the Worker", async () => {
    const html = await (await get("/en/")).r.text();
    const css = /href="(\/site\/site-[A-Z0-9]+\.css)"/.exec(html)![1];
    expect((await get(css)).r.status).toBe(200);
  });

  it("unknown path: browsers get the friendly 404 page with status 404, others the plain text", async () => {
    const h = await get("/no/such/page", { headers: { accept: "text/html,application/xhtml+xml" } });
    expect(h.r.status).toBe(404);
    expect(h.r.headers.get("content-type")).toContain("text/html");
    expect(await h.r.text()).toContain("<h1>404</h1>");
    expect(h.r.headers.get("content-security-policy")).toBe(SITE_CSP);
    const p = await get("/no/such/page", { headers: { accept: "*/*" } });
    expect(p.r.status).toBe(404);
    expect(await p.r.text()).toBe("not found");
  });

  it("the Mini App and API paths are not shadowed by the landing", async () => {
    const { requested } = await get("/health");
    expect(requested).toEqual([]);
  });
});
