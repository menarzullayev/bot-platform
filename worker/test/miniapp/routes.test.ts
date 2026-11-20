import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import type { Env } from "../../src/env";
import { CSP, assetPathFor } from "../../src/miniapp/static";
import { setup } from "./util";

const INDEX_HTML = '<!doctype html><html><body><div id="app"></div><script type="module" src="/app/main-ABCDEFG1.js"></script></body></html>';

function fakeAssets(files: Record<string, { body: string; type: string }>): Fetcher {
  const requested: string[] = [];
  const f = {
    requested,
    async fetch(input: Request | string | URL): Promise<Response> {
      const req = input instanceof Request ? input : new Request(String(input));
      const path = new URL(req.url).pathname;
      requested.push(path);
      const file = files[path];
      if (!file) return new Response("Not Found", { status: 404 });
      return new Response(req.method === "HEAD" ? null : file.body, { status: 200, headers: { "content-type": file.type, etag: '"v1"' } });
    },
  };
  return f as unknown as Fetcher;
}

async function envWith(assets?: Fetcher): Promise<Env> {
  const { env } = await setup();
  return assets ? { ...env, ASSETS: assets } : env;
}

const FILES = {
  "/app/index.html": { body: INDEX_HTML, type: "text/html; charset=utf-8" },
  "/app/main-ABCDEFG1.js": { body: "console.log(1)", type: "text/javascript" },
  "/app/main-ZXCV5678.css": { body: "body{}", type: "text/css" },
  "/app/chunk-QWERTY12.js": { body: "export{}", type: "text/javascript" },
  "/app/favicon.svg": { body: "<svg/>", type: "image/svg+xml" },
};

const get = (env: Env, path: string, init?: RequestInit): Promise<Response> => worker.fetch(new Request("https://example.test" + path, init), env);

describe("static serving of the Mini App", () => {
  it("serves index.html for /app and /app/ with security headers and no-cache", async () => {
    const env = await envWith(fakeAssets(FILES));
    for (const p of ["/app", "/app/"]) {
      const r = await get(env, p);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe(INDEX_HTML);
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(r.headers.get("content-security-policy")).toBe(CSP);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("permissions-policy")).toContain("camera=()");
      expect(r.headers.get("content-type")).toContain("text/html");
    }
  });

  it("falls back to index.html for client-side routes (SPA) but only for paths without an extension", async () => {
    const assets = fakeAssets(FILES);
    const env = await envWith(assets);
    for (const p of ["/app/settings", "/app/graph/", "/app/a/b/c"]) {
      const r = await get(env, p);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe(INDEX_HTML);
    }
    const missing = await get(env, "/app/missing.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(missing.headers.get("content-security-policy")).toBe(CSP);
  });

  it("serves hashed bundles with a one year immutable cache", async () => {
    const env = await envWith(fakeAssets(FILES));
    for (const p of ["/app/main-ABCDEFG1.js", "/app/main-ZXCV5678.css", "/app/chunk-QWERTY12.js"]) {
      const r = await get(env, p);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(r.headers.get("content-security-policy")).toBe(CSP);
    }
    const fav = await get(env, "/app/favicon.svg");
    expect(fav.headers.get("cache-control")).toBe("no-cache");
  });

  it("supports HEAD and rejects other methods with 405", async () => {
    const env = await envWith(fakeAssets(FILES));
    const head = await get(env, "/app/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-security-policy")).toBe(CSP);
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = await get(env, "/app/", { method });
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("GET, HEAD");
    }
  });

  it("503 when the ASSETS binding is absent or the build did not run", async () => {
    expect((await get(await envWith(), "/app/")).status).toBe(503);
    const env = await envWith(fakeAssets({}));
    const r = await get(env, "/app/");
    expect(r.status).toBe(503);
    expect(await r.text()).toBe("app not built");
  });

  it("does not capture neighbouring paths", async () => {
    const env = await envWith(fakeAssets(FILES));
    expect((await get(env, "/application")).status).toBe(404);
    expect((await get(env, "/appx/index.html")).status).toBe(404);
    // dot segments are normalised by URL before routing, so /app/../admin/ is /admin/
    const trav = await get(env, "/app/../admin/bots");
    expect(trav.status).toBe(401);
  });

  it("does not disturb the existing routes", async () => {
    const env = await envWith(fakeAssets(FILES));
    expect(await (await get(env, "/health")).text()).toBe("ok");
    expect((await get(env, "/admin/bots")).status).toBe(401);
    expect((await get(env, "/nothing")).status).toBe(404);
  });

  it("forwards only the asset path to the binding (never the query string)", async () => {
    const assets = fakeAssets(FILES) as unknown as { requested: string[] };
    const env = await envWith(assets as unknown as Fetcher);
    await get(env, "/app/?b=tezcalc&x=1");
    expect(assets.requested).toEqual(["/app/index.html"]);
  });
});

describe("/api/app/* routing", () => {
  it("reaches the Mini App API", async () => {
    const env = await envWith(fakeAssets(FILES));
    const r = await get(env, "/api/app/tezcalc/me");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "unauthorized" });
    expect((await get(env, "/api/app/tezcalc/zzz")).status).toBe(404);
  });
});

describe("Content-Security-Policy", () => {
  const directive = (name: string): string[] => (CSP.split("; ").find((d) => d.startsWith(name + " ")) ?? "").split(" ").slice(1);

  it("allows scripts only from self and Telegram, no inline or eval", () => {
    expect(directive("script-src")).toEqual(["'self'", "https://telegram.org"]);
  });
  it("has no unsafe-inline anywhere and no unsafe-eval", () => {
    expect(CSP).not.toContain("unsafe-inline");
    expect(CSP).not.toContain("unsafe-eval");
  });
  it("restricts connections, images, objects and forms", () => {
    expect(directive("connect-src")).toEqual(["'self'"]);
    expect(directive("img-src")).toEqual(["'self'", "data:"]);
    expect(directive("object-src")).toEqual(["'none'"]);
    expect(directive("form-action")).toEqual(["'none'"]);
    expect(directive("base-uri")).toEqual(["'self'"]);
    expect(directive("default-src")).toEqual(["'self'"]);
  });
  it("lets only the telegram.org family embed the app", () => {
    expect(directive("frame-ancestors")).toEqual(["https://telegram.org", "https://*.telegram.org"]);
  });
});

describe("assetPathFor", () => {
  it.each([
    ["/app", "/app/index.html"],
    ["/app/", "/app/index.html"],
    ["/app/solve", "/app/index.html"],
    ["/app/x/y/", "/app/index.html"],
    ["/app/main-AAAAAAAA.js", "/app/main-AAAAAAAA.js"],
    ["/app/a/b.png", "/app/a/b.png"],
    ["/other", null],
    ["/", null],
  ])("%s -> %s", (p, want) => expect(assetPathFor(p)).toBe(want));
});
