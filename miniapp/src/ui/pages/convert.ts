// Converter page: unit categories + currencies, searchable pickers, swap, live result and rate line.

import { Decimal } from "../../../../worker/src/calc/decimal";
import { availableCurrencies, categories, convert, defaultPair, itemsOf, searchItems, type Category } from "../../lib/convert";
import { formatResult, isolateLtr, parseNumber } from "../../lib/num";
import { isRtl } from "../../i18n";
import { clear, h, icon } from "../dom";
import { ensureRates } from "../session";
import { lsGet, lsSet, prefs, state, t } from "../state";
import { haptic } from "../tg";
import { chooser, openPicker, toast } from "../widgets";
import type { Page } from "./types";

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

export function createConvertPage(): Page {
  const el = h("section", { class: "page convert", attrs: { "aria-label": "converter" } });
  const saved = lsGet<Saved | null>("conv", null);
  let cat: Category = saved?.cat ?? "length";
  let [from, to] = saved ? [saved.from, saved.to] : defaultPair(cat);
  let value = saved?.value ?? "1";
  let outEl!: HTMLElement;
  let rateEl!: HTMLElement;
  let noteEl!: HTMLElement;
  let fromBtn!: HTMLButtonElement;
  let toBtn!: HTMLButtonElement;
  let inputEl!: HTMLInputElement;

  const persist = (): void => lsSet("conv", { cat, from, to, value } satisfies Saved);

  function normalizePair(): void {
    const items = cat === "currency" ? availableCurrencies(state.rates) : itemsOf(cat);
    if (!items.includes(from) || !items.includes(to)) [from, to] = defaultPair(cat);
  }

  function compute(): void {
    persist();
    fromBtn.textContent = label(from);
    toBtn.textContent = label(to);
    noteEl.textContent = "";
    rateEl.textContent = "";
    if (cat === "currency") {
      if (state.ratesStatus === "loading" || state.ratesStatus === "idle") noteEl.textContent = t("conv_rates_loading");
      else if (!state.rates) noteEl.textContent = t("conv_rates_unavailable");
      else {
        const date = new Date(state.rates.updatedAt * 1000).toISOString().slice(0, 10);
        noteEl.textContent = t(state.rates.stale ? "fx_stale" : "fx_updated", { date });
        noteEl.classList.toggle("warn", state.rates.stale);
      }
    }
    const v = parseNumber(value);
    if (!v) {
      outEl.textContent = "—";
      return;
    }
    const r = convert(cat, v, from, to, state.rates);
    if (!r.ok) {
      outEl.textContent = r.error === "no_rate" ? "—" : t(r.error === "units_mismatch" ? "err_units_mismatch" : "err_generic");
      return;
    }
    outEl.textContent = formatResult(r.value, prefs());
    const one = convert(cat, Decimal.ONE, from, to, state.rates);
    if (one.ok) {
      const line = t("conv_rate_line", { from, to, rate: formatResult(one.value, prefs()) });
      rateEl.textContent = isRtl(state.lang) ? isolateLtr(line) : line;
    }
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
    const chips = chooser(
      categories().map((c) => [c, t(`cat_${c}` as "cat_length")] as const),
      cat,
      (c) => {
        cat = c;
        [from, to] = defaultPair(c);
        if (c === "currency") void ensureRates().then(() => { normalizePair(); compute(); });
        render();
      },
      t("nav_convert"),
    );
    inputEl = h("input", {
      class: "field big ltr",
      attrs: { type: "text", inputmode: "decimal", autocomplete: "off", dir: "ltr", "aria-label": t("conv_value") },
      on: {
        input: () => {
          value = inputEl.value;
          compute();
        },
      },
    });
    inputEl.value = value;
    fromBtn = h("button", { class: "select ltr", attrs: { type: "button", "aria-label": t("conv_from") }, on: { click: () => pick("from") } });
    toBtn = h("button", { class: "select ltr", attrs: { type: "button", "aria-label": t("conv_to") }, on: { click: () => pick("to") } });
    const swap = h(
      "button",
      {
        class: "icon-btn round",
        attrs: { type: "button", "aria-label": t("conv_swap") },
        on: {
          click: () => {
            haptic.tap();
            [from, to] = [to, from];
            compute();
          },
        },
      },
      icon("swap", 20),
    );
    outEl = h("div", {
      class: "conv-out ltr",
      attrs: { role: "status", "aria-live": "polite", tabindex: 0 },
      on: {
        click: () => {
          const text = outEl.textContent ?? "";
          if (text && text !== "—") void navigator.clipboard?.writeText(text).then(() => toast(t("copied")), () => undefined);
        },
      },
    });
    rateEl = h("div", { class: "hint ltr" });
    noteEl = h("div", { class: "hint note" });
    el.append(
      chips,
      h("label", { class: "card conv-in" }, h("span", { class: "lbl", text: t("conv_value") }), inputEl),
      h("div", { class: "pair" }, h("div", { class: "pair-col" }, h("div", { class: "lbl", text: t("conv_from") }), fromBtn), swap, h("div", { class: "pair-col" }, h("div", { class: "lbl", text: t("conv_to") }), toBtn)),
      h("div", { class: "card out" }, outEl, rateEl, noteEl),
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
