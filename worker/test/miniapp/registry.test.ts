// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// Style registry: availability and fallback, lazy loading, applying a pack (html attribute, one stylesheet element),
// notifications, and cleanup of DOM that belongs to the previous kit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSrc } from "./dom-src";

// pack.css?url is an esbuild-plugin feature of the production build; vite cannot serve it here (see contract.test.ts)
vi.mock("../../../miniapp/src/styles/fintech/pack.css?url", () => ({ default: "/app/pack-fintech.css" }));
vi.mock("../../../miniapp/src/styles/_template/pack.css?url", () => ({ default: "/app/pack-template.css" }));

let reg: any;
let fintech: any;
let template: any;

const links = (): HTMLLinkElement[] => [...document.querySelectorAll("#style-pack")] as HTMLLinkElement[];
/** Applies a pack and fires the load event of its stylesheet (happy-dom does not fetch stylesheets). */
async function applyLoaded(pack: any): Promise<void> {
  const p = reg.applyStyle(pack);
  links().at(-1)?.dispatchEvent(new Event("load"));
  await p;
}

beforeEach(async () => {
  // happy-dom does not fetch stylesheets; with this setting a <link> reports "load" instead of throwing
  window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  vi.resetModules();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-style");
  reg = await loadSrc("styles/registry.ts");
  fintech = (await loadSrc("styles/fintech/index.ts")).default;
  template = (await loadSrc("styles/_template/index.ts")).default;
  // pin the availability this file tests, whatever other styles exist later
  // (every registered id except fintech, so a style added later does not change what this file asserts)
  for (const id of reg.STYLE_IDS) if (id !== "fintech") reg.setStyleLoader(id, null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("style registry: ids, availability, fallback", () => {
  it("lists the four shipped styles first (new styles are appended), the default is tactile and the fallback is fintech", () => {
    expect([...reg.STYLE_IDS].slice(0, 4)).toEqual(["tactile", "glass", "fintech", "techno"]);
    expect(reg.DEFAULT_STYLE).toBe("tactile");
    expect(reg.FALLBACK_STYLE).toBe("fintech");
  });

  it("listStyles reports availability per style (picker shows the unavailable ones with a badge)", () => {
    const list = reg.listStyles();
    expect(list.map((s: any) => s.meta.id)).toEqual([...reg.STYLE_IDS]);
    expect(Object.fromEntries(list.map((s: any) => [s.meta.id, s.available]))).toEqual(Object.fromEntries([...reg.STYLE_IDS].map((id: string) => [id, id === "fintech"])));
    for (const s of list) expect(s.meta.swatch.light.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(reg.isAvailable("fintech")).toBe(true);
    expect(reg.isAvailable("tactile")).toBe(false);
  });

  it("the real registry (before this file pins availability) ships a loader for each of the four shipped styles", async () => {
    vi.resetModules();
    const real = await loadSrc("styles/registry.ts");
    for (const id of ["tactile", "glass", "fintech", "techno"]) expect(real.isAvailable(id), id).toBe(true);
  });

  it("effectiveStyle maps an unavailable preference to the fallback", () => {
    expect(reg.effectiveStyle("tactile")).toBe("fintech");
    expect(reg.effectiveStyle("fintech")).toBe("fintech");
    reg.setStyleLoader("glass", async () => ({ default: template }));
    expect(reg.effectiveStyle("glass")).toBe("glass");
  });

  it("loadStyle loads a pack lazily and caches it", async () => {
    const a = await reg.loadStyle("fintech");
    const b = await reg.loadStyle("fintech");
    expect(a.meta.id).toBe("fintech");
    expect(a).toBe(b);
    expect(Object.keys(a.kit)).toContain("Button");
  });

  it("an unavailable style (tactile before it exists) loads the fallback so the app still works", async () => {
    const p = await reg.loadStyle("tactile");
    expect(p.meta.id).toBe("fintech");
  });

  it("an installed loader makes a style available and is used", async () => {
    const loader = vi.fn(async () => ({ default: template }));
    reg.setStyleLoader("techno", loader);
    expect(reg.isAvailable("techno")).toBe(true);
    expect((await reg.loadStyle("techno")).kit).toBe(template.kit);
    await reg.loadStyle("techno");
    expect(loader).toHaveBeenCalledTimes(1); // cached
    reg.setStyleLoader("techno", null);
    expect(reg.isAvailable("techno")).toBe(false);
  });

  it("a loader that fails (offline chunk) falls back to fintech instead of breaking the app", async () => {
    reg.setStyleLoader("glass", () => Promise.reject(new Error("chunk failed")));
    const p = await reg.loadStyle("glass");
    expect(p.meta.id).toBe("fintech");
  });

  it("only when the fallback itself cannot load does loadStyle reject", async () => {
    reg.setStyleLoader("fintech", () => Promise.reject(new Error("no fallback")));
    await expect(reg.loadStyle("fintech")).rejects.toThrow("no fallback");
    await expect(reg.loadStyle("tactile")).rejects.toThrow();
  });
});

describe("style registry: applyStyle", () => {
  it("there is no kit before a style is applied", () => {
    expect(reg.currentPack()).toBeNull();
    expect(() => reg.currentKit()).toThrow();
  });

  it("sets data-style and installs exactly one #style-pack stylesheet link", async () => {
    await applyLoaded(fintech);
    expect(document.documentElement.getAttribute("data-style")).toBe("fintech");
    expect(links().length).toBe(1);
    expect(links()[0].tagName).toBe("LINK");
    expect(links()[0].getAttribute("rel")).toBe("stylesheet");
    expect(links()[0].getAttribute("href")).toBe("/app/pack-fintech.css");
    expect(reg.currentPack()).toBe(fintech);
    expect(reg.currentKit()).toBe(fintech.kit);
  });

  it("never injects an inline <style> (CSP style-src 'self')", async () => {
    await applyLoaded(fintech);
    expect(document.querySelectorAll("style").length).toBe(0);
  });

  it("switching styles replaces the stylesheet, updates data-style and notifies with the previous pack", async () => {
    const seen: any[] = [];
    reg.onStyleChange((pack: any, prev: any) => seen.push([pack.meta.id, prev?.meta.id ?? null]));
    await applyLoaded(fintech);
    const first = links()[0];
    await applyLoaded(template); // template carries the placeholder id "techno"
    expect(links().length).toBe(1);
    expect(links()[0]).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(links()[0].getAttribute("href")).toBe("/app/pack-template.css");
    expect(document.documentElement.getAttribute("data-style")).toBe("techno");
    expect(seen).toEqual([["fintech", null], ["techno", "fintech"]]);
    expect(reg.currentKit()).toBe(template.kit);
  });

  it("applying the active pack again is a no-op", async () => {
    const fn = vi.fn();
    reg.onStyleChange(fn);
    await applyLoaded(fintech);
    await reg.applyStyle(fintech);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(links().length).toBe(1);
  });

  it("an unsubscribed listener is not called; a throwing listener does not block the change", async () => {
    const off = vi.fn();
    const ok = vi.fn();
    reg.onStyleChange(off)();
    reg.onStyleChange(() => {
      throw new Error("listener bug");
    });
    reg.onStyleChange(ok);
    await applyLoaded(fintech);
    expect(off).not.toHaveBeenCalled();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(reg.currentPack()).toBe(fintech);
  });

  it("a later apply supersedes one whose stylesheet is still loading (the stale link is dropped)", async () => {
    await applyLoaded(fintech);
    const pa = reg.applyStyle(template); // loading ...
    const stale = links().at(-1) as HTMLLinkElement;
    const pb = reg.applyStyle(fintech.kit ? { ...fintech, cssHref: "/app/pack-other.css", meta: { ...fintech.meta } } : fintech);
    const winner = links().at(-1) as HTMLLinkElement;
    winner.dispatchEvent(new Event("load"));
    await pb;
    stale.dispatchEvent(new Event("load"));
    await pa;
    expect(links().length).toBe(1);
    expect(links()[0].getAttribute("href")).toBe("/app/pack-other.css");
    expect(stale.isConnected).toBe(false);
    expect(reg.currentPack().cssHref).toBe("/app/pack-other.css");
  });

  it("does not hang when the stylesheet never answers: the page is shown after the wait limit", async () => {
    vi.useFakeTimers();
    // a stylesheet that never reports anything: the registry must not register-and-wait forever
    vi.spyOn(HTMLLinkElement.prototype, "addEventListener").mockImplementation(() => undefined);
    const done = vi.fn();
    const p = reg.applyStyle(fintech).then(done);
    await vi.advanceTimersByTimeAsync(3000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(done).toHaveBeenCalled();
    expect(reg.currentPack()).toBe(fintech);
  });

  it("a stylesheet load error still lets the app continue", async () => {
    const p = reg.applyStyle(fintech);
    links().at(-1)?.dispatchEvent(new Event("error"));
    await p;
    expect(reg.currentPack()).toBe(fintech);
  });
});

describe("style switch cleans up DOM owned by the previous kit", () => {
  it("open sheets and the toast are removed when the kit changes, and a new sheet uses the new kit", async () => {
    await applyLoaded(fintech);
    const overlays = await loadSrc("ui/overlays.ts");
    overlays.toast("Saved");
    const sheet = overlays.openSheet("History", (body: HTMLElement) => body.append("hello"));
    expect(document.querySelectorAll('[data-ui="sheet"]').length).toBe(1);
    expect(document.querySelectorAll('[data-ui="toast"]').length).toBe(1);
    expect(sheet.body.textContent).toBe("hello");
    await applyLoaded(template);
    expect(document.querySelectorAll('[data-ui="sheet"]').length).toBe(0);
    expect(document.querySelectorAll('[data-ui="toast"]').length).toBe(0);
    // the new kit's markup has no fintech classes
    overlays.toast("Again");
    const toast = document.querySelector('[data-ui="toast"]') as HTMLElement;
    expect(toast.textContent).toBe("Again");
    expect(toast.classList.contains("toast")).toBe(false);
  });

  it("a sheet closes through its close button, the veil and Escape, and removes itself", async () => {
    vi.useFakeTimers();
    await (async () => {
      const p = reg.applyStyle(fintech);
      links().at(-1)?.dispatchEvent(new Event("load"));
      await p;
    })();
    const overlays = await loadSrc("ui/overlays.ts");
    const onClose = vi.fn();
    for (const how of ["button", "veil", "escape"]) {
      const s = overlays.openSheet("T", () => undefined, onClose);
      const root = document.querySelector('[data-ui="sheet"]') as HTMLElement;
      await vi.advanceTimersByTimeAsync(50);
      expect(root.hasAttribute("data-open"), how).toBe(true);
      if (how === "button") (root.querySelector("button") as HTMLElement).click();
      else if (how === "veil") (root.querySelector('[data-part="veil"]') as HTMLElement).click();
      else root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(root.hasAttribute("data-open"), how).toBe(false);
      await vi.advanceTimersByTimeAsync(300);
      expect(root.isConnected, how).toBe(false);
      s.close(); // closing twice is harmless
    }
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
