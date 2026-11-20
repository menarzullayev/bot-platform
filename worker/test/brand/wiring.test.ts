import { describe, expect, it } from "vitest";
import { INLINE_THUMB_SIZE, INVOICE_PHOTO, inlineThumb, invoicePhoto } from "../../src/pro";
import { BOT_TOKEN, NOW as APP_NOW, apiRequest, initDataFor, setup } from "../miniapp/util";
import { handleAppApi } from "../../src/miniapp/api";
import { callback, harness, inline, seedRates } from "../templates/calc/util";

const BASE = "https://calc.test";

describe("brand URL helpers", () => {
  it("builds the documented Bot API parameter names", () => {
    expect(invoicePhoto(BASE)).toEqual({ photo_url: `${BASE}/brand/stars-pro.jpg`, photo_width: 640, photo_height: 360 });
    expect(inlineThumb(BASE, "loan")).toEqual({
      thumbnail_url: `${BASE}/brand/thumb-loan.jpg`,
      thumbnail_width: 128,
      thumbnail_height: 128,
    });
    expect(INVOICE_PHOTO.width).toBe(640);
    expect(INLINE_THUMB_SIZE).toBe(128);
  });
  it("is empty without PUBLIC_BASE_URL and tolerates a trailing slash", () => {
    expect(invoicePhoto(null)).toEqual({});
    expect(invoicePhoto(undefined)).toEqual({});
    expect(inlineThumb("", "calc")).toEqual({});
    expect(invoicePhoto(`${BASE}/`).photo_url).toBe(`${BASE}/brand/stars-pro.jpg`);
  });
});

describe("bot /pro buy button", () => {
  it("passes the Stars photo to createInvoiceLink", async () => {
    const h = harness();
    await h.send(callback("pro:buy"));
    const c = h.sent("createInvoiceLink")[0].payload;
    expect(c.photo_url).toBe(`${BASE}/brand/stars-pro.jpg`);
    expect(c.photo_width).toBe(640);
    expect(c.photo_height).toBe(360);
  });
  it("drops the photo fields when PUBLIC_BASE_URL is missing, without an error", async () => {
    const h = harness({ appConfig: { publicBaseUrl: null } });
    await h.send(callback("pro:buy"));
    const c = h.sent("createInvoiceLink")[0].payload;
    expect("photo_url" in c).toBe(false);
    expect("photo_width" in c).toBe(false);
    expect("photo_height" in c).toBe(false);
  });
});

describe("Mini App POST /invoice", () => {
  it("sends photo_url/photo_width/photo_height", async () => {
    const { db, env } = await setup();
    const sent: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true, result: "https://t.me/$x" }), { status: 200 });
    }) as unknown as typeof fetch;
    const deps = { db, fetchFn, nowMs: () => (APP_NOW + 10) * 1000, now: () => APP_NOW + 10 };
    const initData = initDataFor(BOT_TOKEN, { id: 4242 }, APP_NOW);
    const r = await handleAppApi(apiRequest("invoice", { method: "POST", initData }), env, deps as never);
    expect(r.status).toBe(200);
    expect(sent[0]).toMatchObject({
      photo_url: "https://example.test/brand/stars-pro.jpg",
      photo_width: 640,
      photo_height: 360,
    });
  });
});

interface Article {
  id: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

async function results(h: ReturnType<typeof harness>, q: string): Promise<Article[]> {
  h.calls.length = 0;
  await h.send(inline(q));
  return h.sent("answerInlineQuery")[0].payload.results as Article[];
}

describe("inline thumbnails", () => {
  it("calculation -> thumb-calc, size 128", async () => {
    const r = await results(harness(), "2+2");
    expect(r.length).toBeGreaterThan(0);
    for (const a of r) {
      expect(a.thumbnail_url).toBe(`${BASE}/brand/thumb-calc.jpg`);
      expect(a.thumbnail_width).toBe(128);
      expect(a.thumbnail_height).toBe(128);
    }
  });
  it("conversion -> thumb-convert", async () => {
    const h = harness();
    seedRates(h.db);
    const r = await results(h, "100 km in mi");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.thumbnail_url === `${BASE}/brand/thumb-convert.jpg`)).toBe(true);
  });
  it("error -> thumb-error", async () => {
    const r = await results(harness(), "1/0");
    expect(r).toHaveLength(1);
    expect(r[0].thumbnail_url).toBe(`${BASE}/brand/thumb-error.jpg`);
  });
  it("no thumbnail fields without PUBLIC_BASE_URL", async () => {
    const h = harness({ appConfig: { publicBaseUrl: null } });
    for (const q of ["2+2", "1/0"]) {
      for (const a of await results(h, q)) {
        expect("thumbnail_url" in a).toBe(false);
        expect("thumbnail_width" in a).toBe(false);
        expect("thumbnail_height" in a).toBe(false);
      }
    }
  });
});
