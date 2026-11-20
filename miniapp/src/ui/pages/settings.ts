// Settings page (never scrolls, down to 264x470): language, angle unit, decimals, theme, history sync and the Pro plan
// on the main screen; style picker and the adaptation axes (DEC-007) in the "Appearance" bottom sheet.
// Style/axis changes apply at once (main.ts listens to the state change).

import { LANG_LABELS, LANGS } from "../../../../worker/src/i18n/types";
import { effectiveStyle, listStyles } from "../../styles/registry";
import { clear, h } from "../dom";
import { buyPro, openSheet, toast } from "../overlays";
import { clearHistoryAll, refreshMe, saveSettings } from "../session";
import { persistPrefs, state, t, update, type ThemePref } from "../state";
import type { Page, PageCtx } from "./types";

export function createSettingsPage(ctx: PageCtx, onTheme: () => void): Page {
  const el = h("section", { class: "page settings", attrs: { "aria-label": "settings" } });

  async function save(patch: Parameters<typeof saveSettings>[0]): Promise<void> {
    const ok = await saveSettings(patch);
    toast(ok ? t("set_saved") : t("set_save_failed"), ok ? "ok" : "error");
  }

  // A style switch swaps the kit and destroys open sheets (stale markup); the page is re-rendered right after, and
  // then the appearance sheet is opened again so the user keeps tuning the look.
  let reopenUntil = 0;

  function openAppearance(): void {
    openSheet(t("set_appearance"), (body) => {
      const kit = ctx.kit;
      const seg = <T extends string>(label: string, options: ReadonlyArray<readonly [T, string]>, value: T, onPick: (v: T) => void): HTMLElement =>
        kit.Row({ label }, kit.Segmented({ options, value, label, onPick }).el).el;
      body.append(
        kit.Row(
          { label: t("set_style"), class: "style-row" },
          kit.StylePicker({
            label: t("set_style"),
            soonLabel: t("style_soon"),
            value: effectiveStyle(state.style),
            options: listStyles().map(({ meta, available }) => ({ id: meta.id, name: t(meta.nameKey), swatch: meta.swatch, available })),
            onPick: (id) => {
              reopenUntil = Date.now() + 5000;
              void save({ style: id });
            },
          }).el,
        ).el,
        seg(t("set_contrast"), [["normal", t("contrast_normal")], ["high", t("contrast_high")]] as const, state.contrast, (v) => void save({ contrast: v })),
        seg(t("set_density"), [["comfortable", t("density_comfortable")], ["compact", t("density_compact")]] as const, state.density, (v) => void save({ density: v })),
        seg(t("set_lite"), [["auto", t("lite_auto")], ["on", t("lite_on")], ["off", t("lite_off")]] as const, state.lite, (v) => void save({ lite: v })),
        seg(t("set_fs"), [["m", "A"], ["l", "A+"], ["xl", "A++"]] as const, state.fs, (v) => void save({ fs: v })),
      );
    });
  }

  function render(): void {
    clear(el);
    const kit = ctx.kit;

    const langs = kit.Row(
      { class: "lang", label: t("set_language") },
      kit.Chooser({
        options: LANGS.map((l) => [l, LANG_LABELS[l]] as const),
        value: state.lang,
        label: t("set_language"),
        langs: LANGS.map((l) => (l === "uz-latn" ? "uz-Latn" : l === "uz-cyrl" ? "uz-Cyrl" : l)),
        onPick: (l) => void save({ lang: l }).then(() => render()),
      }).el,
    );

    const themeOpts: ReadonlyArray<readonly [ThemePref, string]> = [
      ["auto", t("theme_auto")],
      ["light", t("theme_light")],
      ["dark", t("theme_dark")],
    ];

    const digits = kit.Slider({
      label: t("set_digits"),
      min: 0,
      max: 20,
      step: 1,
      value: state.digits,
      onChange: (v) => void save({ digits: v }),
    });

    const sync = kit.Toggle({ label: t("set_history"), checked: state.keepHistory, onChange: (c) => void save({ keepHistory: c }) });

    const plan = kit.Row(
      { class: "plan", label: t("set_plan") },
      h(
        "div",
        { class: "plan-line" },
        kit.ProBadge({ label: state.isPro ? t("pro_badge") : t("set_plan_free"), tone: state.isPro ? "pro" : "free" }).el,
        state.isPro ? kit.Text({ kind: "hint", text: t("set_plan_until", { date: new Date(state.proUntil * 1000).toISOString().slice(0, 10) }) }).el : null,
        state.isPro
          ? null
          : kit.Button({
              variant: "primary",
              size: "slim",
              label: t("pro_upgrade", { stars: state.proStars }),
              onClick: () =>
                void buyPro(async () => {
                  await refreshMe();
                  render();
                }),
            }).el,
      ),
    );

    const seg = <T extends string>(label: string, options: ReadonlyArray<readonly [T, string]>, value: T, onPick: (v: T) => void, cls?: string): HTMLElement =>
      kit.Row({ label, class: cls }, kit.Segmented({ options, value, label, onPick }).el).el;

    const styleName = ((): string => {
      const cur = listStyles().find(({ meta }) => meta.id === effectiveStyle(state.style));
      return cur ? t(cur.meta.nameKey) : "";
    })();

    el.append(
      kit.Card(
        { class: "set-card" },
        langs.el,
        // the two most used compact controls share one line
        h(
          "div",
          { class: "grid2 set-pair" },
          seg(t("set_angle"), [["deg", t("set_deg")], ["rad", t("set_rad")]] as const, state.angle, (v) => void save({ angle: v }), "angle"),
          kit.Row({ class: "digits" }, digits.el).el,
        ),
        seg(t("set_theme"), themeOpts, state.theme, (v) => {
          update({ theme: v });
          persistPrefs();
          onTheme();
        }),
        kit.Row(
          { class: "hist" },
          sync.el,
          kit.Text({ kind: "hint", text: t("set_history_hint") }).el,
          kit.Button({
            variant: "danger",
            size: "slim",
            icon: "trash",
            label: t("calc_clear_history"),
            ariaLabel: t("calc_clear_history"),
            title: t("calc_clear_history"),
            onClick: () => {
              clearHistoryAll();
              toast(t("history_cleared"));
            },
          }).el,
        ).el,
        plan.el,
        // style picker and the four adaptation axes live in a bottom sheet so this page never scrolls
        kit.Row(
          { class: "appearance" },
          kit.Button({
            variant: "secondary",
            block: true,
            icon: "settings",
            label: styleName ? `${t("set_appearance")} · ${styleName}` : t("set_appearance"),
            ariaLabel: t("set_appearance"),
            onClick: () => openAppearance(),
          }).el,
        ).el,
      ).el,
    );
    if (state.mode === "demo") el.appendChild(kit.Text({ kind: "hint", align: "center", text: t("set_demo_note") }).el);
    if (reopenUntil > Date.now()) {
      reopenUntil = 0;
      openAppearance();
    }
  }

  render();
  return { el, render };
}
