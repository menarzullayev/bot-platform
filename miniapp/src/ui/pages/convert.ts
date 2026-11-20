// Converter page: unit categories + currencies, searchable pickers, swap, live result and rate line.

import { Decimal } from "../../../../worker/src/calc/decimal";
import { availableCurrencies, categories, convert, defaultPair, itemsOf, searchItems, type Category } from "../../lib/convert";
import { formatResult, isolateLtr, parseNumber } from "../../lib/num";
import { isRtl } from "../../i18n";
import type { ResultCardHandle, SelectHandle } from "../../contract/types";
import { clear, h } from "../dom";
import { openPicker, toast } from "../overlays";
import { ensureRates } from "../session";
import { lsGet, lsSet, prefs, state, t } from "../state";
import { haptic } from "../tg";
import type { Page, PageCtx } from "./types";

interface Saved {
  cat: Category;
  from: string;
  to: string;
  value: string;
}

function currencyName(code: string): string | undefined {
  try {
    const loc = state.lang === "uz-latn" ? "uz" : state.lang === "uz-cyrl" ? "uz-Cyrl" : state.lang;
    return new Intl.DisplayNames([loc], { type: "currency" }).of(code) ?? undefined;
  } catch {
    return undefined;
  }
}

export function createConvertPage(ctx: PageCtx): Page {
  const el = h("section", { class: "page convert", attrs: { "aria-label": "converter" } });
  const saved = lsGet<Saved | null>("conv", null);
  let cat: Category = saved?.cat ?? "length";
  let [from, to] = saved ? [saved.from, saved.to] : defaultPair(cat);
  let value = saved?.value ?? "1";
  let outText = "";
  let result!: ResultCardHandle;
  let fromSel!: SelectHandle;
  let toSel!: SelectHandle;

  const persist = (): void => lsSet("conv", { cat, from, to, value } satisfies Saved);

  function normalizePair(): void {
    const items = cat === "currency" ? availableCurrencies(state.rates) : itemsOf(cat);
    if (!items.includes(from) || !items.includes(to)) [from, to] = defaultPair(cat);
  }

  function compute(): void {
    persist();
    fromSel.setText(label(from));
    toSel.setText(label(to));
    let note: { text: string; warn?: boolean; busy?: boolean } | null = null;
    let hint = "";
    if (cat === "currency") {
      if (state.ratesStatus === "loading" || state.ratesStatus === "idle") note = { text: t("conv_rates_loading"), busy: true };
      else if (!state.rates) note = { text: t("conv_rates_unavailable") };
      else {
        const date = new Date(state.rates.updatedAt * 1000).toISOString().slice(0, 10);
        note = { text: t(state.rates.stale ? "fx_stale" : "fx_updated", { date }), warn: state.rates.stale };
      }
    }
    let main = "—";
    const v = parseNumber(value);
    if (v) {
      const r = convert(cat, v, from, to, state.rates);
      if (!r.ok) {
        main = r.error === "no_rate" ? "—" : t(r.error === "units_mismatch" ? "err_units_mismatch" : "err_generic");
      } else {
        main = formatResult(r.value, prefs());
        const one = convert(cat, Decimal.ONE, from, to, state.rates);
        if (one.ok) {
          const line = t("conv_rate_line", { from, to, rate: formatResult(one.value, prefs()) });
          hint = isRtl(state.lang) ? isolateLtr(line) : line;
        }
      }
    }
    outText = main;
    result.update({ main: [main], hint, note });
  }

  const label = (code: string): string => code;

  function pick(which: "from" | "to"): void {
    openPicker({
      title: t(which === "from" ? "conv_from" : "conv_to"),
      placeholder: t("conv_search_ph"),
      selected: which === "from" ? from : to,
      items: (q) => {
        const found = searchItems(cat, q);
        return cat === "currency" && state.rates ? found.filter((c) => availableCurrencies(state.rates).includes(c)) : found;
      },
      label: (code) => (cat === "currency" ? { main: code, sub: currencyName(code) } : { main: code }),
      onPick: (code) => {
        if (which === "from") from = code;
        else to = code;
        compute();
      },
    });
  }

  function render(): void {
    clear(el);
    const kit = ctx.kit;
    const chips = kit.Chooser({
      options: categories().map((c) => [c, t(`cat_${c}` as "cat_length")] as const),
      value: cat,
      label: t("nav_convert"),
      onPick: (c) => {
        cat = c;
        [from, to] = defaultPair(c);
        if (c === "currency") void ensureRates().then(() => { normalizePair(); compute(); });
        render();
      },
    });
    const input = kit.Field({
      label: t("conv_value"),
      ariaLabel: t("conv_value"),
      size: "big",
      inputMode: "decimal",
      value,
      onInput: (v) => {
        value = v;
        compute();
      },
    });
    fromSel = kit.Select({ ariaLabel: t("conv_from"), text: label(from), onClick: () => pick("from") });
    toSel = kit.Select({ ariaLabel: t("conv_to"), text: label(to), onClick: () => pick("to") });
    const swap = kit.IconButton({
      icon: "swap",
      label: t("conv_swap"),
      shape: "round",
      onClick: () => {
        haptic.tap();
        [from, to] = [to, from];
        compute();
      },
    });
    result = kit.ResultCard({
      variant: "value",
      live: true,
      onMainClick: () => {
        if (outText && outText !== "—") void navigator.clipboard?.writeText(outText).then(() => toast(t("copied")), () => undefined);
      },
    });
    el.append(
      chips.el,
      kit.Card({ class: "conv-in" }, input.el).el,
      h(
        "div",
        { class: "pair" },
        h("div", { class: "pair-col" }, kit.Text({ kind: "label", text: t("conv_from") }).el, fromSel.el),
        swap.el,
        h("div", { class: "pair-col" }, kit.Text({ kind: "label", text: t("conv_to") }).el, toSel.el),
      ),
      result.el,
    );
    normalizePair();
    compute();
  }

  render();
  if (cat === "currency") void ensureRates().then(() => { normalizePair(); compute(); });
  return {
    el,
    render,
    onShow: () => {
      if (cat === "currency" && state.ratesStatus === "idle") void ensureRates().then(() => { normalizePair(); compute(); });
    },
  };
}
