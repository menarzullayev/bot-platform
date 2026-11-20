// Settings page: language (7), angle unit, decimals, history sync, theme and the Pro plan.

import { LANG_LABELS, LANGS } from "../../../../worker/src/i18n/types";
import { clear, h } from "../dom";
import { clearHistoryAll, refreshMe, saveSettings } from "../session";
import { persistPrefs, state, t, update, type ThemePref } from "../state";
import { haptic } from "../tg";
import { buyPro, segmented, toast } from "../widgets";
import type { Page } from "./types";

export function createSettingsPage(onTheme: () => void): Page {
  const el = h("section", { class: "page settings", attrs: { "aria-label": "settings" } });

  async function save(patch: Parameters<typeof saveSettings>[0]): Promise<void> {
    const ok = await saveSettings(patch);
    toast(ok ? t("set_saved") : t("set_save_failed"), ok ? "ok" : "error");
  }

  function render(): void {
    clear(el);
    const langs = h(
      "div",
      { class: "card lang-list", attrs: { role: "radiogroup", "aria-label": t("set_language") } },
      h("div", { class: "lbl", text: t("set_language") }),
      LANGS.map((l) =>
        h("button", {
          class: "lang-item" + (l === state.lang ? " on" : ""),
          attrs: { type: "button", role: "radio", "aria-checked": l === state.lang, lang: l === "uz-latn" ? "uz-Latn" : l === "uz-cyrl" ? "uz-Cyrl" : l },
          text: LANG_LABELS[l],
          on: {
            click: () => {
              haptic.select();
              void save({ lang: l }).then(() => render());
            },
          },
        }),
      ),
    );

    const digits = h("input", {
      class: "range",
      attrs: { type: "range", min: 0, max: 20, step: 1, value: state.digits, "aria-label": t("set_digits") },
    });
    const digitsOut = h("span", { class: "range-val", text: String(state.digits) });
    digits.addEventListener("input", () => {
      digitsOut.textContent = digits.value;
    });
    digits.addEventListener("change", () => void save({ digits: Number(digits.value) }));

    const sync = h("input", { attrs: { type: "checkbox", id: "sync-hist", role: "switch" } });
    sync.checked = state.keepHistory;
    sync.addEventListener("change", () => {
      haptic.select();
      void save({ keepHistory: sync.checked });
    });

    const themeOpts: ReadonlyArray<readonly [ThemePref, string]> = [
      ["auto", t("theme_auto")],
      ["light", t("theme_light")],
      ["dark", t("theme_dark")],
    ];

    const plan = h(
      "div",
      { class: "card plan" },
      h("div", { class: "lbl", text: t("set_plan") }),
      h("div", { class: "plan-line" }, h("span", { class: "badge" + (state.isPro ? " pro" : ""), text: state.isPro ? t("pro_badge") : t("set_plan_free") }), state.isPro ? h("span", { class: "hint", text: t("set_plan_until", { date: new Date(state.proUntil * 1000).toISOString().slice(0, 10) }) }) : null),
      state.isPro
        ? null
        : h("button", { class: "btn primary", attrs: { type: "button" }, text: t("pro_upgrade", { stars: state.proStars }), on: { click: () => void buyPro(async () => { await refreshMe(); render(); }) } }),
    );

    el.append(
      langs,
      h("div", { class: "card" }, h("div", { class: "lbl", text: t("set_angle") }), segmented([["deg", t("set_deg")], ["rad", t("set_rad")]] as const, state.angle, (v) => void save({ angle: v }), t("set_angle"))),
      h("div", { class: "card" }, h("div", { class: "lbl" }, t("set_digits"), digitsOut), digits),
      h(
        "div",
        { class: "card" },
        h("label", { class: "switch-row", attrs: { for: "sync-hist" } }, h("span", { text: t("set_history") }), sync),
        h("div", { class: "hint", text: t("set_history_hint") }),
        h("button", { class: "btn danger", attrs: { type: "button" }, text: t("calc_clear_history"), on: { click: () => { clearHistoryAll(); toast(t("history_cleared")); } } }),
      ),
      h("div", { class: "card" }, h("div", { class: "lbl", text: t("set_theme") }), segmented(themeOpts, state.theme, (v) => { update({ theme: v }); persistPrefs(); onTheme(); }, t("set_theme"))),
      plan,
    );
    if (state.mode === "demo") el.appendChild(h("div", { class: "hint center", text: t("set_demo_note") }));
  }

  render();
  return { el, render };
}
