// Mini App entry: boot, theme/language/direction, tab navigation with lazy pages, server session.

import "./styles.css";
import { detectLang, isLang, isRtl } from "../../worker/src/i18n";
import { BOT_ID_RE, createApi } from "./lib/api";
import { clear, h, icon } from "./ui/dom";
import { createCalcPage } from "./ui/pages/calc";
import { createConvertPage } from "./ui/pages/convert";
import { createFinancePage } from "./ui/pages/finance";
import { createSettingsPage } from "./ui/pages/settings";
import type { Page } from "./ui/pages/types";
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

const pages = new Map<TabId, Page>();
let current: TabId = "calc";
let pagesEl!: HTMLElement;
let navEl!: HTMLElement;
let bannerEl!: HTMLElement;
let unback: (() => void) | null = null;

async function makePage(id: TabId): Promise<Page> {
  switch (id) {
    case "calc":
      return createCalcPage();
    case "convert":
      return createConvertPage();
    case "finance":
      return createFinancePage();
    case "settings":
      return createSettingsPage(applyTheme);
    case "graph":
      return (await import("./ui/pages/graph")).createGraphPage();
    case "solve":
      return (await import("./ui/pages/solve")).createSolvePage();
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
  paintNav();
  // BackButton returns to the calculator from any other tab
  unback?.();
  unback = id === "calc" ? null : pushBack(() => void show("calc"));
}

function paintNav(): void {
  for (const b of navEl.querySelectorAll<HTMLElement>("[data-tab]")) {
    const on = b.dataset.tab === current;
    b.setAttribute("aria-selected", String(on));
    b.classList.toggle("on", on);
  }
}

function buildNav(): void {
  clear(navEl);
  for (const tab of TABS) {
    navEl.appendChild(
      h(
        "button",
        {
          class: "tab",
          dataset: { tab: tab.id },
          attrs: { type: "button", role: "tab" },
          on: {
            click: () => {
              if (tab.id !== current) haptic.select();
              void show(tab.id);
            },
          },
        },
        icon(tab.icon, 22),
        h("span", { class: "tab-label", text: t(tab.label) }),
        tab.id === "solve" && !state.isPro ? h("span", { class: "tab-pro", text: t("pro_badge") }) : null,
      ),
    );
  }
  paintNav();
}

function paintBanner(): void {
  clear(bannerEl);
  if (state.authError) {
    bannerEl.hidden = false;
    bannerEl.dataset.kind = "error";
    bannerEl.append(h("strong", { text: t(state.authError) }));
  } else if (state.mode === "demo") {
    bannerEl.hidden = false;
    bannerEl.dataset.kind = "info";
    bannerEl.append(h("strong", { text: t("open_in_telegram") }), h("span", { text: " — " + t("open_in_telegram_hint") }));
  } else {
    bannerEl.hidden = true;
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

function rerenderAll(): void {
  buildNav();
  paintBanner();
  for (const p of pages.values()) p.render();
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
    botId,
    mode,
    // opened as a Mini App but without a bot id in the URL: nothing to authenticate against
    authError: inTelegram && !botId ? "err_auth" : null,
    api: botId ? createApi({ botId, initData: tg?.initData ?? "" }) : null,
  });
  return { langExplicit: isLang(stored.lang) };
}

async function main(): Promise<void> {
  initTelegram();
  const { langExplicit } = bootState();
  const app = document.getElementById("app");
  if (!app) return;
  clear(app);
  bannerEl = h("div", { class: "banner", attrs: { role: "status" } });
  pagesEl = h("main", { class: "pages" });
  navEl = h("nav", { class: "tabbar", attrs: { role: "tablist" } });
  app.append(bannerEl, pagesEl, navEl);
  applyTheme();
  buildNav();
  paintBanner();
  await show("calc");

  let wasPro = state.isPro;
  onChange((changed) => {
    if (changed.includes("lang") || changed.includes("theme")) applyTheme();
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
