// @ts-nocheck: Mini App sources use DOM types; the worker tsconfig has no DOM lib (see dom-src.ts)
// Share cards (DEC-011, DEC-013, DEC-014): the share flow (canvas -> JPEG quality loop -> upload -> Telegram), the API client
// call, and the drawShareCard of every pack against a recording 2D context (nothing leaves the canvas, text is readable).

import { describe, expect, it } from "vitest";
import { loadSrc } from "./dom-src";
import { ratio } from "./style-gate";

const S = await loadSrc("lib/share.ts");
const A = await loadSrc("lib/api.ts");
const M = await loadSrc("contract/model.ts");
const KIT = await loadSrc("styles/share-kit.ts");
const STR = await loadSrc("strings.ts");
const DRAW = {
  tactile: (await loadSrc("styles/tactile/share.ts")).drawTactileShareCard,
  glass: (await loadSrc("styles/glass/share.ts")).drawGlassShareCard,
  fintech: (await loadSrc("styles/fintech/share.ts")).drawFintechShareCard,
  techno: (await loadSrc("styles/techno/share.ts")).drawTechnoShareCard,
};
const TOKENS = {
  tactile: (await loadSrc("styles/tactile/tokens.ts")).tactileTokens,
  glass: (await loadSrc("styles/glass/tokens.ts")).glassTokens,
  fintech: (await loadSrc("styles/fintech/tokens.ts")).fintechTokens,
  techno: (await loadSrc("styles/techno/tokens.ts")).technoTokens,
};
const GLASS = await loadSrc("styles/glass/tokens.ts");
const IDS = ["tactile", "glass", "fintech", "techno"] as const;

const DATA = { kind: "calc", title: "Hisoblash", main: "84", sub: "12*(3+4)", footer: "2026-11-21" };

// ---------------------------------------------------------------------------------------------------------------------
// a recording 2D context: every drawing call is a no-op, texts are kept with the state they were drawn in

class RecCtx {
  font = "10px sans-serif";
  fillStyle = "#000";
  strokeStyle = "#000";
  lineWidth = 1;
  lineCap = "butt";
  textAlign = "left";
  textBaseline = "alphabetic";
  direction = "ltr";
  shadowColor = "";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  texts: any[] = [];
  fills = 0;
  rects: any[] = [];
  saves = 0;
  restores = 0;
  save() {
    this.saves++;
  }
  restore() {
    this.restores++;
  }
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arcTo() {}
  clip() {}
  stroke() {}
  strokeRect() {}
  translate() {}
  scale() {}
  fill() {
    this.fills++;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, fill: this.fillStyle });
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  measureText(t: string) {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: [...t].length * px * 0.56 };
  }
  fillText(text: string, x: number, y: number) {
    const w = this.measureText(text).width;
    const left = this.textAlign === "right" ? x - w : this.textAlign === "center" ? x - w / 2 : x;
    this.texts.push({ text, x, y, left, right: left + w, font: this.font, direction: this.direction, color: this.fillStyle, align: this.textAlign });
  }
}

const paint = (id: string, data = DATA, dark = false, high = false) => {
  const ctx = new RecCtx();
  const tk = S.shareTokens(TOKENS[id], { dark, high });
  DRAW[id](ctx, data, M.SHARE_SIZE, tk, dark);
  return ctx;
};

describe("share kit: text fitting, wrapping, direction", () => {
  const ctx = () => new RecCtx();

  it("drawText shrinks the font until the text fits, never below min, then adds an ellipsis", () => {
    const c = ctx();
    const r = KIT.drawText(c, "1234567890123456", { x: 0, y: 0, maxW: 200, size: 100, min: 30, color: "#000" });
    expect(r.px).toBeLessThan(100);
    expect(r.px).toBeGreaterThanOrEqual(30);
    const tiny = KIT.drawText(c, "x".repeat(200), { x: 0, y: 0, maxW: 100, size: 40, min: 30, color: "#000" });
    expect(tiny.px).toBe(30);
    expect(c.texts.at(-1).text.endsWith("…")).toBe(true);
    expect(c.texts.at(-1).right).toBeLessThanOrEqual(100);
  });

  it("wrapLines breaks on spaces, inside long words, and ends the last line with an ellipsis", () => {
    const c = ctx();
    c.font = "20px x";
    expect(KIT.wrapLines(c, "aa bb cc", 1000, 2)).toEqual(["aa bb cc"]);
    const lines = KIT.wrapLines(c, "12345678901234567890123456789012345678901234567890", 200, 3);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(c.measureText(l).width).toBeLessThanOrEqual(200);
    const cut = KIT.wrapLines(c, "word ".repeat(60), 200, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith("…")).toBe(true);
  });

  it("main is always drawn left-to-right; Arabic captions are shaped right-to-left", () => {
    const c = ctx();
    KIT.drawText(c, "١٢٣٫٤٥", { x: 0, y: 0, maxW: 300, size: 40, color: "#000", dir: "ltr" });
    KIT.drawText(c, "حاسبة", { x: 0, y: 0, maxW: 300, size: 20, color: "#000", dir: "auto" });
    KIT.drawText(c, "Calc", { x: 0, y: 0, maxW: 300, size: 20, color: "#000", dir: "auto" });
    expect(c.texts.map((t) => t.direction)).toEqual(["ltr", "rtl", "ltr"]);
    expect(KIT.isRtlText("حاسبة")).toBe(true);
    expect(KIT.isRtlText("Hisoblash")).toBe(false);
    // Arabic-Indic digits and an expression written with them are neutral: they must not flip the line
    expect(KIT.isRtlText("٢٠٢٦-١١-٢١")).toBe(false);
    expect(KIT.isRtlText("١٢×(٣+٤) =")).toBe(false);
  });

  it("digits of Arabic script keep their logical order: left-to-right text with them is wrapped in an LRO..PDF override", () => {
    const c = ctx();
    KIT.drawText(c, "١٢×(٣+٤)", { x: 0, y: 0, maxW: 300, size: 20, color: "#000", dir: "auto" });
    KIT.drawText(c, "12*(3+4)", { x: 0, y: 0, maxW: 300, size: 20, color: "#000", dir: "auto" });
    KIT.drawText(c, "حاسبة ١٢", { x: 0, y: 0, maxW: 300, size: 20, color: "#000", dir: "auto" });
    expect(c.texts[0].text).toBe("‭١٢×(٣+٤)‬");
    expect(c.texts[1].text).toBe("12*(3+4)");
    expect(c.texts[2].text).toBe("حاسبة ١٢"); // real right-to-left text is left to the engine
  });

  it("the mark is the prototype's mark: two bars and the bolt, drawn between save and restore", () => {
    const c = ctx();
    KIT.drawMark(c, 10, 10, 72, { plate: "#ab3409", bars: "#fff", bolt: "#fff" });
    expect(c.saves).toBe(c.restores);
    expect(c.fills).toBeGreaterThanOrEqual(4); // plate, two bars, bolt
  });
});

describe.each(IDS)("%s: drawShareCard", (id) => {
  const kinds = [
    { ...DATA },
    { kind: "convert", title: "Konverter", main: "62.1371", sub: "100 km → mi", footer: "1 km = 0.6214 mi" },
    { kind: "loan", title: "Moliya", main: "2 496,21", sub: "Oylik to‘lov", footer: "Jami: 59 909,04 · Foiz: 9 909,04" },
  ];

  it.each([false, true])("paints without errors (dark=%s) and draws every field, the brand and the handle", (dark) => {
    for (const d of kinds) {
      const c = paint(id, d, dark);
      const all = c.texts.map((t) => t.text);
      expect(all).toContain(d.main);
      expect(all.some((t) => t.includes(d.title))).toBe(true);
      expect(all.some((t) => t.includes(d.sub))).toBe(true);
      expect(all.some((t) => t.includes(d.footer))).toBe(true);
      expect(all).toContain(KIT.BOT_HANDLE);
      expect(all.some((t) => t.toLowerCase() === "tezcalc")).toBe(true);
      expect(c.saves).toBe(c.restores);
    }
  });

  it("covers the whole canvas first (JPEG has no alpha)", () => {
    const c = paint(id);
    expect(c.rects[0]).toMatchObject({ x: 0, y: 0, w: 720, h: 405 });
  });

  it("uses the system font stack only, with the result in the first, large, bold line", () => {
    const c = paint(id);
    for (const t of c.texts) expect(t.font).toMatch(/system-ui|ui-monospace/);
    const main = c.texts.find((t) => t.text === DATA.main);
    expect(main.direction).toBe("ltr");
    expect(Number(/(\d+)px/.exec(main.font)[1])).toBeGreaterThanOrEqual(64);
  });

  it("keeps every text inside the canvas, also for long and right-to-left input", () => {
    const long = { kind: "calc", title: "حاسبة بسيطة وسريعة جدًا للجميع", main: "123456789012345678901234567890.123456789", sub: "((12+34)*(56-78))/(90+12)^3 + sin(30) + log(1000) + sqrt(144) + 7!", footer: "x".repeat(120) };
    for (const d of [long, { ...long, main: "١٢٣٫٤٥٦" }]) {
      const c = paint(id, d, true);
      for (const t of c.texts) {
        expect(t.left, t.text).toBeGreaterThanOrEqual(0);
        expect(t.right, t.text).toBeLessThanOrEqual(M.SHARE_SIZE.w);
        expect(t.y).toBeGreaterThan(0);
        expect(t.y).toBeLessThan(M.SHARE_SIZE.h);
      }
    }
  });

  it("the Arabic title is shaped right-to-left, the result and the handle stay left-to-right", () => {
    const c = paint(id, { ...DATA, title: "حاسبة", main: "٨٤" });
    expect(c.texts.find((t) => t.text.includes("حاسبة")).direction).toBe("rtl");
    expect(c.texts.find((t) => t.text.includes("٨٤")).direction).toBe("ltr");
    expect(c.texts.find((t) => t.text === KIT.BOT_HANDLE).direction).toBe("ltr");
  });

  it("an empty footer and sub are fine", () => {
    expect(() => paint(id, { ...DATA, sub: "", footer: "" })).not.toThrow();
  });

  it("every text colour reaches AA (4.5:1) on the surface it sits on, in both schemes and with high contrast (7:1)", () => {
    for (const high of [false, true])
      for (const dark of [false, true]) {
        const tk = S.shareTokens(TOKENS[id], { dark, high });
        const min = high ? 7 : 4.5;
        // the surface the text is painted on: glass/techno draw their panel in `surface`, glass pills in `soft`
        const base = tk.surface;
        const pairs = [
          [tk.ink, id === "fintech" ? tk.bg : base],
          [tk.ink2, id === "fintech" ? tk.bg : base],
          [tk.accent, id === "fintech" ? tk.bg : base],
          [tk.onAccent, tk.accent],
        ];
        if (id === "glass") pairs.push([tk.accent, tk.soft]);
        for (const [fg, bg] of pairs) expect(ratio(fg, bg), `${id} dark=${dark} high=${high} ${fg} on ${bg}`).toBeGreaterThanOrEqual(high ? min : fg === tk.onAccent ? 4.5 : min);
      }
  });
});

describe("glass card: text over the worst spot of the mesh", () => {
  const blend = (fg: string, a: number, bg: string): string => {
    const f = parseInt(fg.slice(1), 16);
    const b = parseInt(bg.slice(1), 16);
    const ch = (s: number) => Math.round(((f >> s) & 255) * a + ((b >> s) & 255) * (1 - a));
    return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
  };
  it.each([false, true])("ink, ink2 and accent read on the scrim over every mesh stop (dark=%s)", (dark) => {
    const rec = dark ? GLASS.glassRecipe.dark : GLASS.glassRecipe.light;
    const tk = dark ? TOKENS.glass.dark : TOKENS.glass.light;
    for (const m of rec.mesh) {
      const surface = blend(rec.scrim, rec.alpha.surface, m);
      expect(ratio(tk.ink, surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tk.ink2, surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tk.accent, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// the share flow

/** A canvas whose JPEG size depends on the quality, recording every toBlob call. */
function stubCanvas(sizeOf: (q: number) => number, type = "image/jpeg") {
  const ctx = new RecCtx();
  const calls: Array<{ type?: string; q?: number }> = [];
  const canvas = {
    width: 0,
    height: 0,
    ctxArgs: null as any,
    ctx,
    calls,
    getContext(id: string, opts: any) {
      this.ctxArgs = [id, opts];
      return ctx;
    },
    toBlob(cb: (b: Blob | null) => void, t?: string, q?: number) {
      calls.push({ type: t, q });
      cb(new Blob([new Uint8Array(sizeOf(q ?? 1))], { type }));
    },
  };
  return canvas;
}

const drawn: any[] = [];
const PACK = {
  tokens: TOKENS.fintech,
  drawShareCard: (ctx: any, data: any, size: any, tk: any, dark: boolean) => drawn.push({ data, size, tk, dark }),
};

function deps(over: Record<string, any> = {}) {
  const cards: any[] = [];
  const links: string[] = [];
  const msgs: string[] = [];
  const canvas = stubCanvas((q) => Math.round(q * 100_000));
  const d = {
    makeCanvas: () => canvas,
    api: { card: async (blob: Blob, caption: string) => (cards.push({ blob, caption }), { id: "i", url: "https://x.test/card/i.jpg", prepared_id: "prep-1", prepared_expires_at: 1, expires_at: 2 }) },
    pack: PACK,
    scheme: () => ({ dark: false, high: false }),
    signedIn: true,
    degraded: 0,
    shareMessage: async (id: string) => (msgs.push(id), true),
    openLink: (u: string) => (links.push(u), true),
    ...over,
  };
  return { d, cards, links, msgs, canvas };
}

describe("renderCardJpeg", () => {
  it("draws on a 720x405 canvas with an opaque 2D context and the scheme's tokens", async () => {
    drawn.length = 0;
    const { canvas } = deps();
    await S.renderCardJpeg(DATA, PACK, { dark: true, high: true }, () => canvas);
    expect([canvas.width, canvas.height]).toEqual([720, 405]);
    expect(canvas.ctxArgs).toEqual(["2d", { alpha: false }]);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].size).toEqual({ w: 720, h: 405 });
    expect(drawn[0].dark).toBe(true);
    expect(drawn[0].tk).toBe(TOKENS.fintech.contrastHigh.dark);
    expect(drawn[0].data).toBe(DATA);
  });

  it("asks for image/jpeg and lowers the quality until the file is at most 60 KB", async () => {
    const { canvas } = deps(); // size = q * 100000 bytes; 60 KB = 61440
    const blob = await S.renderCardJpeg(DATA, PACK, { dark: false, high: false }, () => canvas);
    expect(canvas.calls.every((c) => c.type === "image/jpeg")).toBe(true);
    expect(canvas.calls.map((c) => c.q)).toEqual([0.92, 0.85, 0.78, 0.7, 0.62, 0.55]);
    expect(blob.size).toBe(55000);
    expect(blob.size).toBeLessThanOrEqual(S.CARD_TARGET_BYTES);
  });

  it("stops at the first quality when the card is already small", async () => {
    const canvas = stubCanvas(() => 20_000);
    await S.renderCardJpeg(DATA, PACK, { dark: false, high: false }, () => canvas);
    expect(canvas.calls).toHaveLength(1);
  });

  it("fails when no quality is small enough, when toBlob gives nothing or a PNG, or the style cannot paint", async () => {
    const scheme = { dark: false, high: false };
    await expect(S.renderCardJpeg(DATA, PACK, scheme, () => stubCanvas(() => 500_000))).rejects.toThrow(/too large/);
    const nothing = stubCanvas(() => 1);
    nothing.toBlob = (cb: any) => cb(null);
    await expect(S.renderCardJpeg(DATA, PACK, scheme, () => nothing)).rejects.toThrow();
    await expect(S.renderCardJpeg(DATA, PACK, scheme, () => stubCanvas(() => 1000, "image/png"))).rejects.toThrow(/JPEG/);
    await expect(S.renderCardJpeg(DATA, { tokens: TOKENS.fintech }, scheme, () => stubCanvas(() => 1))).rejects.toThrow();
    const noCtx = stubCanvas(() => 1);
    noCtx.getContext = () => null;
    await expect(S.renderCardJpeg(DATA, PACK, scheme, () => noCtx)).rejects.toThrow();
  });

  it("every real pack renders into a stub canvas through the same path", async () => {
    for (const id of IDS) {
      const canvas = stubCanvas(() => 30_000);
      const blob = await S.renderCardJpeg(DATA, { tokens: TOKENS[id], drawShareCard: DRAW[id] }, { dark: id === "techno", high: false }, () => canvas);
      expect(blob.type).toBe("image/jpeg");
      expect(canvas.ctx.texts.length).toBeGreaterThan(4);
    }
  });
});

describe("shareCard: Telegram paths", () => {
  it("prepared_id present: uploads the JPEG with the caption and opens the share picker (no link)", async () => {
    const { d, cards, links, msgs } = deps();
    const r = await S.shareCard(DATA, d);
    expect(r).toEqual({ ok: true, via: "message", sent: true });
    expect(cards).toHaveLength(1);
    expect(cards[0].blob.type).toBe("image/jpeg");
    expect(cards[0].caption).toBe("12*(3+4) = 84");
    expect(msgs).toEqual(["prep-1"]);
    expect(links).toEqual([]);
  });

  it("the picker dismissed is still ok (sent: false)", async () => {
    const { d } = deps({ shareMessage: async () => false });
    expect(await S.shareCard(DATA, d)).toEqual({ ok: true, via: "message", sent: false });
  });

  it("prepared_id null: falls back to t.me/share/url with the encoded card URL", async () => {
    const { d, links, msgs } = deps({ api: { card: async () => ({ id: "i", url: "https://x.test/card/a b.jpg", prepared_id: null, prepared_expires_at: null, expires_at: 0 }) } });
    const r = await S.shareCard(DATA, d);
    expect(r).toEqual({ ok: true, via: "link" });
    expect(msgs).toEqual([]);
    expect(links).toEqual(["https://t.me/share/url?url=" + encodeURIComponent("https://x.test/card/a b.jpg")]);
  });

  it("shareMessage unsupported (old client) falls back to the link", async () => {
    const { d, links } = deps({ shareMessage: async () => Promise.reject(new Error("old")) });
    expect(await S.shareCard(DATA, d)).toEqual({ ok: true, via: "link" });
    expect(links).toHaveLength(1);
  });

  it("neither shareMessage nor a link possible: unavailable", async () => {
    const { d } = deps({ shareMessage: async () => Promise.reject(new Error("old")), openLink: () => false });
    expect(await S.shareCard(DATA, d)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("shareCard: demo mode, light mode, no card style", () => {
  it.each([
    ["demo mode (not signed in)", { signedIn: false }],
    ["no api", { api: null }],
    ["light mode level 1", { degraded: 1 }],
    ["light mode level 2", { degraded: 2 }],
    ["a pack without drawShareCard", { pack: { tokens: TOKENS.fintech } }],
    ["no pack yet", { pack: null }],
  ])("%s: nothing is drawn or uploaded", async (_n, over) => {
    const { d, cards, canvas, links } = deps(over);
    expect(S.canShare(d)).toBe(false);
    expect(await S.shareCard(DATA, d)).toEqual({ ok: false, reason: "unavailable" });
    expect(cards).toEqual([]);
    expect(canvas.calls).toEqual([]);
    expect(links).toEqual([]);
  });

  it("canShare is true only for signed in + api + level 0 + a painting pack", () => {
    expect(S.canShare(deps().d)).toBe(true);
  });
});

describe("shareCard: errors", () => {
  const E = (status: number, code: string) => ({ card: async () => Promise.reject(new A.ApiError(status, code)) });
  it.each([
    [503, "degraded", "light"],
    [503, "http_503", "server"],
    [429, "rate_limited", "rate"],
    [401, "auth_expired", "auth"],
    [403, "forbidden", "auth"],
    [404, "not_found", "auth"],
    [413, "payload_too_large", "server"],
    [415, "unsupported_media_type", "server"],
    [500, "http_500", "server"],
  ])("HTTP %s %s -> %s", async (status, code, reason) => {
    const { d, msgs, links } = deps({ api: E(status, code) });
    expect(await S.shareCard(DATA, d)).toEqual({ ok: false, reason });
    expect(msgs).toEqual([]);
    expect(links).toEqual([]);
  });

  it("a network failure is `network`", async () => {
    const { d } = deps({ api: { card: async () => Promise.reject(new TypeError("Failed to fetch")) } });
    expect(await S.shareCard(DATA, d)).toEqual({ ok: false, reason: "network" });
  });

  it("a card that cannot be rendered never reaches the server", async () => {
    const { d, cards } = deps({ makeCanvas: () => stubCanvas(() => 900_000) });
    expect(await S.shareCard(DATA, d)).toEqual({ ok: false, reason: "render" });
    expect(cards).toEqual([]);
  });

  it("a second tap while the first is running is ignored (busy), and the flag is released afterwards", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow = deps({ api: { card: async () => (await gate, { id: "i", url: "u", prepared_id: "p", prepared_expires_at: null, expires_at: 0 }) } });
    const first = S.shareCard(DATA, slow.d);
    await Promise.resolve();
    expect(await S.shareCard(DATA, deps().d)).toEqual({ ok: false, reason: "busy" });
    release();
    expect((await first).ok).toBe(true);
    expect((await S.shareCard(DATA, deps().d)).ok).toBe(true);
  });

  it("failKey has a message for every failure the user should hear about, in all 7 languages", () => {
    const reasons = ["light", "rate", "server", "network", "render", "auth"];
    for (const r of reasons) {
      const key = S.failKey(r);
      expect(key, r).toBeTruthy();
      for (const lang of ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"]) expect(STR.MS[lang][key], `${lang}.${key}`).toBeTruthy();
    }
    expect(S.failKey("unavailable")).toBeNull();
    expect(S.failKey("busy")).toBeNull();
  });
});

describe("share helpers", () => {
  it("shareTokens picks light/dark and the high-contrast sets", () => {
    const t = TOKENS.techno;
    expect(S.shareTokens(t, { dark: false, high: false })).toBe(t.light);
    expect(S.shareTokens(t, { dark: true, high: false })).toBe(t.dark);
    expect(S.shareTokens(t, { dark: false, high: true })).toBe(t.contrastHigh.light);
    expect(S.shareTokens(t, { dark: true, high: true })).toBe(t.contrastHigh.dark);
  });

  it("captionOf is `sub = main`, capped, and just the value when there is no context", () => {
    expect(S.captionOf(DATA)).toBe("12*(3+4) = 84");
    expect(S.captionOf({ ...DATA, sub: "" })).toBe("84");
    expect([...S.captionOf({ ...DATA, sub: "x".repeat(500) })]).toHaveLength(S.CAPTION_LIMIT);
  });
});

describe("api.card", () => {
  const mk = (res: Response) => {
    const seen: any[] = [];
    const api = A.createApi({ botId: "tezcalc", initData: "query_id=1&hash=ab", fetchFn: async (url: string, init: any) => (seen.push({ url, init }), res) });
    return { api, seen };
  };
  const OK = { id: "i", url: "u", prepared_id: "p", prepared_expires_at: 1, expires_at: 2 };

  it("POSTs the JPEG bytes with tma auth, image/jpeg and the percent-encoded caption", async () => {
    const { api, seen } = mk(new Response(JSON.stringify(OK), { status: 201 }));
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    expect(await api.card(blob, "ўзбекча 12*3 = 36")).toEqual(OK);
    expect(seen[0].url).toBe("/api/app/tezcalc/card");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.body).toBe(blob);
    expect(seen[0].init.headers.authorization).toBe("tma query_id=1&hash=ab");
    expect(seen[0].init.headers["content-type"]).toBe("image/jpeg");
    expect(decodeURIComponent(seen[0].init.headers["x-card-caption"])).toBe("ўзбекча 12*3 = 36");
    expect(seen[0].init.headers["x-card-caption"]).toMatch(/^[\x20-\x7e]+$/);
  });

  it("sends no caption header when the caption is empty", async () => {
    const { api, seen } = mk(new Response(JSON.stringify(OK), { status: 201 }));
    await api.card(new Blob([new Uint8Array(3)]), "");
    expect("x-card-caption" in seen[0].init.headers).toBe(false);
  });

  it("turns an error answer into an ApiError with status and code", async () => {
    const { api } = mk(new Response(JSON.stringify({ error: "degraded" }), { status: 503 }));
    await expect(api.card(new Blob([new Uint8Array(3)]), "")).rejects.toMatchObject({ status: 503, code: "degraded" });
  });
});

describe("strings of the share feature", () => {
  const keys = ["share", "share_sent", "share_light_title", "share_light_text", "share_err_light", "share_err_rate", "share_err_server", "share_err_render"];
  it.each(keys)("%s exists in all 7 languages and differs from the other scripts", (k) => {
    const langs = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"];
    for (const l of langs) expect(STR.MS[l][k], `${l}.${k}`).toBeTruthy();
    expect(STR.MS.ar[k]).toMatch(/[؀-ۿ]/);
    expect(STR.MS.ru[k]).toMatch(/[Ѐ-ӿ]/);
    expect(STR.MS["uz-cyrl"][k]).toMatch(/[Ѐ-ӿ]/);
  });
});
