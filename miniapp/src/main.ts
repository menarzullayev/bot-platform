// Mini App entry: boot, style + axes, theme/language/direction, tab navigation with lazy pages, server session.
// The visual style is a lazily loaded pack (styles/registry.ts); this file only wires core behaviour to the active kit.

import "./core.css";
import { detectLang, isLang, isRtl } from "../../worker/src/i18n";
import { applyAxes } from "./contract/axes";
import { DEFAULT_STYLE, isStyleId, parseAxes } from "./contract/model";
import type { TabsHandle } from "./contract/types";
import { BOT_ID_RE, createApi } from "./lib/api";
import { applyStyle, currentKit, loadStyle, onStyleChange } from "./styles/registry";
import { clear, h } from "./ui/dom";
import { createCalcPage } from "./ui/pages/calc";
import { createConvertPage } from "./ui/pages/convert";
import { createFinancePage } from "./ui/pages/finance";
import { createSettingsPage } from "./ui/pages/settings";
import type { Page, PageCtx } from "./ui/pages/types";
import { refreshMe } from "./ui/session";
import { lsGet, onChange, state, t, update, type StoredPrefs } from "./ui/state";
import { inTelegram, initTelegram, onTelegramEvent, pushBack, syncChrome, tg, haptic } from "./ui/tg";

type TabId = "calc" | "convert" | "graph" | "solve" | "finance" | "settings";
const TABS: ReadonlyArray<{ id: TabId; icon: string; label: "nav_calc" | "nav_convert" | "nav_graph" | "nav_solve" | "nav_finance" | "nav_settings" }> = [
  { id: "calc", icon: "calc", label: "nav_calc" },
  { id: "convert", icon: "convert", label: "nav_convert" },
  { id: "graph", icon: "graph", label: "nav_graph" },
  { id: "solve", icon: "solve", label: "nav_solve" },
  { id: "finance", icon: "finance", label: "nav_finance" },
  { id: "settings", icon: "settings", label: "nav_settings" },
];

/** Pages read `ctx.kit` while rendering, so after a style switch a re-render picks up the new kit. */
const ctx: PageCtx = {
  get kit() {
    return currentKit();
  },
};

const pages = new Map<TabId, Page>();
let current: TabId = "calc";
let pagesEl!: HTMLElement;
let navSlot!: HTMLElement;
let bannerSlot!: HTMLElement;
let tabs: TabsHandle | null = null;
let shellReady = false;
let unback: (() => void) | null = null;

async function makePage(id: TabId): Promise<Page> {
  switch (id) {
    case "calc":
      return createCalcPage(ctx);
    case "convert":
      return createConvertPage(ctx);
    case "finance":
      return createFinancePage(ctx);
    case "settings":
      return createSettingsPage(ctx, applyTheme);
    case "graph":
      return (await import("./ui/pages/graph")).createGraphPage(ctx);
    case "solve":
      return (await import("./ui/pages/solve")).createSolvePage(ctx);
  }
}

async function show(id: TabId): Promise<void> {
  let page = pages.get(id);
  if (!page) {
    page = await makePage(id);
    page.el.hidden = true;
    pages.set(id, page);
    pagesEl.appendChild(page.el);
  }
  const prev = pages.get(current);
  if (prev && current !== id) {
    prev.el.hidden = true;
    prev.onHide?.();
  }
  current = id;
  page.el.hidden = false;
  page.onShow?.();
  tabs?.setActive(current);
  // BackButton returns to the calculator from any other tab
  unback?.();
  unback = id === "calc" ? null : pushBack(() => void show("calc"));
}

function buildNav(): void {
  clear(navSlot);
  tabs = ctx.kit.Tabs({
    active: current,
    tabs: TABS.map((tab) => ({ id: tab.id, icon: tab.icon, label: t(tab.label), badge: tab.id === "solve" && !state.isPro ? t("pro_badge") : undefined })),
    onSelect: (id) => {
      if (id !== current) haptic.select();
      void show(id as TabId);
    },
  });
  navSlot.appendChild(tabs.el);
}

function paintBanner(): void {
  clear(bannerSlot);
  if (state.authError) {
    bannerSlot.hidden = false;
    bannerSlot.appendChild(ctx.kit.Notice({ kind: "error", title: t(state.authError) }).el);
  } else if (state.mode === "demo") {
    bannerSlot.hidden = false;
    bannerSlot.appendChild(ctx.kit.Notice({ kind: "info", title: t("open_in_telegram"), text: t("open_in_telegram_hint") }).el);
  } else {
    bannerSlot.hidden = true;
  }
}

/** Language, direction and theme attributes of <html>; Telegram chrome colour follows the page background. */
function applyTheme(): void {
  const root = document.documentElement;
  if (state.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", state.theme);
  root.lang = state.lang === "uz-latn" ? "uz-Latn" : state.lang === "uz-cyrl" ? "uz-Cyrl" : state.lang;
  root.dir = isRtl(state.lang) ? "rtl" : "ltr";
  window.requestAnimationFrame(() => {
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (/^#[0-9a-f]{6}$/i.test(bg)) syncChrome(bg);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute("content", bg);
  });
}

function applyCurrentAxes(): void {
  applyAxes({ contrast: state.contrast, density: state.density, lite: state.lite, fs: state.fs });
}

function rerenderAll(): void {
  buildNav();
  paintBanner();
  for (const p of pages.values()) p.render();
}

let styleSeq = 0;
/** Loads and applies the style the user chose (falls back to the default pack while it is not available). */
async function activateStyle(): Promise<void> {
  const my = ++styleSeq;
  const pack = await loadStyle(state.style);
  if (my !== styleSeq) return;
  await applyStyle(pack);
}

function bootState(): { langExplicit: boolean } {
  const stored = lsGet<StoredPrefs>("prefs", {});
  const tgLang = tg?.initDataUnsafe?.user?.language_code;
  const lang = isLang(stored.lang) ? stored.lang : detectLang(tgLang ?? navigator.language, "uz-latn");
  const q = new URLSearchParams(location.search);
  const rawBot = q.get("b") ?? q.get("bot");
  const botId = rawBot && BOT_ID_RE.test(rawBot) ? rawBot : null;
  const mode = inTelegram && botId ? "telegram" : "demo";
  update({
    lang,
    angle: stored.angle === "rad" ? "rad" : "deg",
    digits: Number.isInteger(stored.digits) && (stored.digits as number) >= 0 && (stored.digits as number) <= 20 ? (stored.digits as number) : 12,
    keepHistory: stored.keepHistory === true,
    theme: stored.theme === "light" || stored.theme === "dark" ? stored.theme : "auto",
    style: isStyleId(stored.style) ? stored.style : DEFAULT_STYLE,
    ...parseAxes(stored),
    botId,
    mode,
    // opened as a Mini App but without a bot id in the URL: nothing to authenticate against
    authError: inTelegram && !botId ? "err_auth" : null,
    api: botId ? createApi({ botId, initData: tg?.initData ?? "" }) : null,
  });
  return { langExplicit: isLang(stored.lang) };
}

/** Shown when not even the fallback style could be loaded (offline with an empty cache). */
function showBootError(app: HTMLElement): void {
  clear(app);
  app.appendChild(
    h(
      "div",
      { class: "boot" },
      h("div", { text: t("err_network") }),
      h("button", { attrs: { type: "button" }, text: t("retry"), on: { click: () => location.reload() } }),
    ),
  );
}

async function main(): Promise<void> {
  initTelegram();
  const { langExplicit } = bootState();
  const app = document.getElementById("app");
  if (!app) return;
  applyCurrentAxes();
  applyTheme();
  onStyleChange(() => {
    applyTheme();
    if (shellReady) rerenderAll();
  });
  try {
    await activateStyle();
  } catch {
    showBootError(app);
    return;
  }
  clear(app);
  app.removeAttribute("aria-busy");
  bannerSlot = h("div", { class: "slot-banner" });
  pagesEl = h("main", { class: "pages" });
  navSlot = h("div", { class: "slot-nav" });
  app.append(bannerSlot, pagesEl, navSlot);
  buildNav();
  paintBanner();
  shellReady = true;
  await show("calc");

  let wasPro = state.isPro;
  onChange((changed) => {
    if (changed.includes("lang") || changed.includes("theme")) applyTheme();
    if (changed.includes("contrast") || changed.includes("density") || changed.includes("lite") || changed.includes("fs")) {
      applyCurrentAxes();
      applyTheme();
    }
    if (changed.includes("style")) void activateStyle();
    if (changed.includes("lang") || (changed.includes("isPro") && state.isPro !== wasPro) || changed.includes("authError")) {
      wasPro = state.isPro;
      rerenderAll();
    }
  });
  onTelegramEvent("themeChanged", applyTheme);
  onTelegramEvent("safeAreaChanged", () => undefined);

  if (state.mode === "telegram") {
    await refreshMe(!langExplicit);
    onTelegramEvent("activated", () => void refreshMe());
  }
  // the first server answer can change language / pro lock / banner: onChange already re-rendered what is needed
  paintBanner();
}

void main();
