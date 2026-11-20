// Glass kit: same markup contract as every kit (data-ui / data-part hooks, ARIA state, helpers from contract/helpers);
// the shisha look (mesh fon, scrim + frosted surfaces, gradient keys) is painted entirely by pack.css. Surfaces are
// plain elements with classes: the scrim is a background layer of the surface itself, so no extra DOM is needed.

import { onPress, part, radioGroup, resultLen, ui } from "../../contract/helpers";
import type {
  ButtonOptions, CardOptions, Child, ChipOptions, ChooserOptions, DisplayOptions, FieldOptions, IconButtonOptions, Kit, KeyOptions,
  ListItemOptions, LockedOverlayOptions, NoticeOptions, ResultCardOptions, ResultData, RowOptions, SegmentedOptions, SelectOptions,
  SheetOptions, SliderOptions, SpinnerOptions, StepItem, StyleId, StylePickerOptions, TableOptions, TabsOptions, TextOptions, ToggleOptions,
} from "../../contract/types";
import { clear, h, icon } from "../../ui/dom";
import { haptic } from "../../ui/tg";

const cls = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

function Button(o: ButtonOptions) {
  const el = ui(
    h("button", {
      class: cls("btn", o.variant === "primary" && "primary", o.variant === "danger" && "danger", o.size === "slim" && "slim", o.block && "wide"),
      attrs: { type: "button", "aria-label": o.ariaLabel, title: o.title },
      dataset: { variant: o.variant ?? "secondary", size: o.size ?? "normal" },
    }),
    "button",
  );
  let label: HTMLElement | null = null;
  const setLabel = (text: string): void => {
    if (!label) {
      label = part(h("span"), "label");
      el.appendChild(label);
    }
    label.textContent = text;
  };
  if (o.icon) el.appendChild(icon(o.icon, o.size === "slim" ? 16 : 18));
  if (o.label !== undefined) setLabel(o.label);
  onPress(el, o.onClick, { haptic: null });
  return { el, setLabel, setDisabled: (d: boolean) => void (el.disabled = d) };
}

function IconButton(o: IconButtonOptions) {
  const el = ui(
    h("button", { class: cls("icon-btn", o.shape === "round" && "round"), attrs: { type: "button", "aria-label": o.label } }, icon(o.icon, o.size ?? 20)),
    "icon-button",
  );
  const setPressed = (p: boolean): void => {
    el.setAttribute("aria-pressed", String(p));
  };
  if (o.pressed !== undefined) setPressed(o.pressed);
  onPress(el, o.onClick, { haptic: null });
  return { el, setPressed };
}

function Key(o: KeyOptions) {
  const el = ui(
    h("button", {
      class: `key k-${o.kind} k-${o.id}`,
      attrs: { type: "button", "aria-label": o.ariaLabel ?? o.label },
      dataset: { key: o.id, kind: o.kind },
      text: o.label,
    }),
    "key",
  );
  onPress(el, o.onPress, { keepFocus: true, haptic: null });
  return { el };
}

function Chip(o: ChipOptions) {
  const el = ui(h("button", { class: "chip", attrs: { type: "button", "aria-label": o.ariaLabel }, text: o.label }), "chip");
  const setPressed = (p: boolean): void => {
    el.setAttribute("aria-pressed", String(p));
  };
  if (o.pressed !== undefined) setPressed(o.pressed);
  onPress(el, o.onClick, { keepFocus: o.keepFocus, haptic: null });
  return { el, setLabel: (t: string) => void (el.textContent = t), setPressed };
}

function Display(o: DisplayOptions) {
  const prev = part(h("div", { class: "prev ltr", attrs: { "aria-hidden": "true" } }), "prev");
  const input = part(
    h("input", {
      class: "expr ltr",
      attrs: {
        type: "text",
        inputmode: "none",
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: false,
        enterkeyhint: "done",
        dir: "ltr",
        placeholder: o.placeholder,
        "aria-label": o.inputLabel,
        maxlength: 500,
      },
      on: {
        input: () => o.onInput(),
        keydown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            o.onEnter();
          }
        },
      },
    }),
    "input",
  );
  const result = part(h("div", { class: "result ltr", attrs: { role: "status", "aria-live": "polite", tabindex: 0 }, on: { click: () => o.onResultClick() } }), "result");
  result.dataset.kind = "none";
  result.dataset.len = "m";
  const el = ui(h("div", { class: "display" }, prev, input, result), "display");
  return {
    el,
    input,
    setPrev: (text: string) => void (prev.textContent = text),
    setResult: (text: string, kind: "none" | "preview" | "final" | "error") => {
      result.textContent = text;
      result.dataset.kind = kind;
      result.dataset.len = resultLen(text);
    },
  };
}

function Card(o: CardOptions, ...children: Child[]) {
  const tone = o.tone ?? "plain";
  const el = ui(h("div", { class: cls("card", tone === "error" && "err", o.class), dataset: { tone } }, ...children), "card");
  return { el };
}

function ResultCard(o: ResultCardOptions) {
  const variant = o.variant ?? "lines";
  const title = part(h("div", { class: "lbl" }), "title");
  const mainLabel = part(h("span", { class: "row-l" }), "main-label");
  const main = part(h("div", { class: variant === "hero" ? "hero-v ltr" : variant === "value" ? "conv-out ltr" : "res-lines" }), "main");
  if (o.live) {
    main.setAttribute("role", "status");
    main.setAttribute("aria-live", "polite");
    main.tabIndex = 0;
  }
  if (o.onMainClick) main.addEventListener("click", () => o.onMainClick?.());
  const hero = part(h("div", { class: "hero" }, mainLabel, main), "hero");
  const cells = part(h("div", { class: "cells" }), "cells");
  const actions = part(h("div", { class: "actions" }), "actions");
  const hint = part(h("div", { class: "hint ltr" }), "hint");
  const note = part(h("div", { class: "hint note" }), "note");
  const el = ui(h("div", { class: cls("card", "rc", o.class), dataset: { variant } }, title, hero, cells, hint, note), "result-card");
  // the actions slot lives inside the cells grid (a button takes one cell) and stays after the stat cells
  cells.appendChild(actions);
  const update = (d: ResultData): void => {
    title.textContent = d.title ?? "";
    mainLabel.textContent = d.mainLabel ?? "";
    clear(main);
    for (const line of d.main ?? []) main.appendChild(variant === "lines" ? h("div", { class: "res-line ltr", text: line }) : document.createTextNode(line));
    for (const c of [...cells.querySelectorAll(".cell")]) c.remove();
    for (const s of d.stats ?? []) cells.insertBefore(h("div", { class: "cell" }, h("span", { class: "row-l", text: s.label }), h("span", { class: "row-v ltr", text: s.value })), actions);
    cells.hidden = !(d.stats && d.stats.length) && !actions.firstChild;
    hint.textContent = d.hint ?? "";
    clear(note);
    if (d.note?.busy) note.append(Spinner({ label: d.note.text }).el, " ");
    if (d.note) note.append(d.note.text);
    note.classList.toggle("warn", !!d.note?.warn);
    hero.hidden = !(d.mainLabel || (d.main && d.main.length));
  };
  update({});
  return { el, update, actions };
}

function Notice(o: NoticeOptions) {
  const strong = h("strong");
  const text = part(h("span"), "text");
  const el = ui(h("div", { class: "notice" }, strong, text), "notice");
  const update = (n: NoticeOptions): void => {
    el.dataset.kind = n.kind;
    el.setAttribute("role", n.kind === "error" ? "alert" : "status");
    strong.textContent = n.title ?? "";
    text.textContent = n.text ? (n.title ? " — " : "") + n.text : "";
  };
  update(o);
  return { el, update };
}

function Toast() {
  const el = ui(h("div", { class: "toast", attrs: { role: "status", "aria-live": "polite" } }), "toast");
  return {
    el,
    set: (text: string, kind: "ok" | "error", visible: boolean) => {
      el.textContent = text;
      el.dataset.kind = kind;
      if (visible) el.dataset.show = "1";
      else delete el.dataset.show;
    },
  };
}

const ProBadge = (o: { label: string; tone: "pro" | "free" }) => ({ el: ui(h("span", { class: cls("badge", o.tone === "pro" && "pro"), dataset: { tone: o.tone }, text: o.label }), "pro-badge") });

function LockedOverlay(o: LockedOverlayOptions) {
  const preview = part(h("div", { class: "teaser-blur", attrs: { "aria-hidden": "true" } }, o.preview), "preview");
  const action = Button({ label: o.actionLabel, variant: "primary", onClick: o.onAction });
  const lock = part(
    h(
      "div",
      { class: "pro-lock" },
      h("div", { class: "pro-lock-icon" }, icon("lock", 26)),
      h("div", { class: "pro-lock-title", text: o.title }),
      part(h("div", { class: "pro-lock-text", text: o.text }), "lock-text"),
      action.el,
    ),
    "lock",
  );
  return { el: ui(h("div", { class: "teaser" }, preview, lock), "locked-overlay") };
}

const Spinner = (o: SpinnerOptions) => ({ el: ui(h("span", { class: "spinner", attrs: { role: "status", "aria-label": o.label } }, h("i")), "spinner") });

function Text(o: TextOptions) {
  const el = ui(h("div", { class: cls(o.kind === "label" ? "lbl" : o.kind === "hint" ? "hint" : "empty", o.tone === "warn" && "warn", o.align === "center" && "center", o.ltr && "ltr"), dataset: { kind: o.kind }, text: o.text ?? "" }), "text");
  return { el, setText: (t: string) => void (el.textContent = t) };
}

function Field(o: FieldOptions) {
  const ltr = o.ltr ?? true;
  const input = part(
    h("input", {
      class: cls("field", o.size === "big" && "big", ltr && "ltr"),
      attrs: {
        type: o.type ?? "text",
        inputmode: o.inputMode,
        dir: ltr ? "ltr" : undefined,
        autocomplete: "off",
        autocapitalize: "off",
        spellcheck: false,
        placeholder: o.placeholder,
        maxlength: o.maxLength,
        "aria-label": o.ariaLabel,
      },
      on: {
        input: () => o.onInput?.(input.value),
        keydown: (e) => {
          if (e.key === "Enter") o.onEnter?.();
        },
      },
    }),
    "input",
  );
  if (o.value !== undefined) input.value = o.value;
  const el = ui(h("label", { class: "fld", dataset: { size: o.size ?? "normal" } }, o.label ? part(h("span", { class: "lbl", text: o.label }), "label") : null, input), "field");
  return {
    el,
    input,
    setValue: (v: string) => void (input.value = v),
    setInvalid: (invalid: boolean, message?: string) => {
      if (invalid) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
      input.title = invalid ? (message ?? "") : "";
    },
  };
}

function Select(o: SelectOptions) {
  const el = ui(h("button", { class: "select ltr", attrs: { type: "button", "aria-label": o.ariaLabel }, text: o.text }), "select");
  onPress(el, o.onClick, { haptic: null });
  return { el, setText: (t: string) => void (el.textContent = t) };
}

function Chooser<T extends string>(o: ChooserOptions<T>) {
  const grid = part(h("div", { class: "choose-grid", attrs: { role: "radiogroup", "aria-label": o.label } }), "grid");
  const select = h("select", { class: "choose-select", attrs: { "aria-label": o.label } });
  const chips = new Map<T, HTMLElement>();
  o.options.forEach(([v, text], i) => {
    const lang = o.langs?.[i];
    const b = h("button", { class: "chip", attrs: { type: "button", role: "radio", lang }, text });
    chips.set(v, b);
    grid.appendChild(b);
    select.appendChild(h("option", { attrs: { value: v, lang }, text }));
  });
  const group = radioGroup(chips, o.value, o.onPick, (v) => void (select.value = v));
  select.addEventListener("change", () => {
    const v = select.value as T;
    haptic.select();
    group.set(v);
    o.onPick(v);
  });
  const el = ui(h("div", { class: cls("choose", o.roomy && "lo"), dataset: o.roomy ? { roomy: "1" } : undefined }, grid, part(h("div", { class: "choose-sel" }, select), "select")), "chooser");
  return { el, setValue: (v: T) => group.set(v) };
}

function Segmented<T extends string>(o: SegmentedOptions<T>) {
  const el = ui(h("div", { class: "seg", attrs: { role: "radiogroup", "aria-label": o.label } }), "segmented");
  const buttons = new Map<T, HTMLElement>();
  for (const [v, text] of o.options) {
    const b = h("button", { class: "seg-btn", attrs: { type: "button", role: "radio" }, text });
    buttons.set(v, b);
    el.appendChild(b);
  }
  const group = radioGroup(buttons, o.value, o.onPick);
  return { el, setValue: (v: T) => group.set(v) };
}

function Toggle(o: ToggleOptions) {
  const kind = o.kind ?? "switch";
  const input = h("input", { attrs: { type: "checkbox", role: kind === "switch" ? "switch" : undefined } });
  input.checked = o.checked;
  input.addEventListener("change", () => {
    haptic.select();
    o.onChange(input.checked);
  });
  const text = h("span", { text: o.label });
  const el = ui(h("label", { class: kind === "switch" ? "switch-row" : "check", dataset: { kind } }, ...(kind === "switch" ? [text, input] : [input, text])), "toggle");
  return { el, input, setChecked: (c: boolean) => void (input.checked = c) };
}

function Slider(o: SliderOptions) {
  const out = part(h("span", { class: "range-val", text: String(o.value) }), "value");
  const input = h("input", { class: "range", attrs: { type: "range", min: o.min, max: o.max, step: o.step, value: o.value, "aria-label": o.label } });
  input.addEventListener("input", () => {
    out.textContent = input.value;
    o.onInput?.(Number(input.value));
  });
  input.addEventListener("change", () => o.onChange(Number(input.value)));
  const el = ui(h("div", { class: "slider" }, h("div", { class: "lbl" }, o.label, out), input), "slider");
  return {
    el,
    input,
    setValue: (v: number) => {
      input.value = String(v);
      out.textContent = String(v);
    },
  };
}

function Row(o: RowOptions, ...children: Child[]) {
  const el = ui(h("div", { class: cls("set-row", o.class) }, o.label !== undefined ? part(h("div", { class: "lbl" }, o.label), "label") : null, ...children), "row");
  return { el };
}

function Tabs(o: TabsOptions) {
  const buttons = new Map<string, HTMLElement>();
  const el = ui(h("nav", { class: "tabbar", attrs: { role: "tablist" } }), "tabs");
  for (const tab of o.tabs) {
    const b = h(
      "button",
      { class: "tab", dataset: { tab: tab.id }, attrs: { type: "button", role: "tab", "aria-label": tab.label, "aria-selected": "false" }, on: { click: () => o.onSelect(tab.id) } },
      icon(tab.icon, 20),
      part(h("span", { class: "tab-label", text: tab.label }), "label"),
      tab.badge ? part(h("span", { class: "tab-pro", text: tab.badge }), "badge") : null,
    );
    buttons.set(tab.id, b);
    el.appendChild(b);
  }
  const setActive = (id: string): void => {
    for (const [k, b] of buttons) b.setAttribute("aria-selected", String(k === id));
  };
  setActive(o.active);
  return { el, setActive };
}

function Sheet(o: SheetOptions) {
  const body = part(h("div", { class: "sheet-body" }), "body");
  const veil = part(h("div", { class: "veil" }), "veil");
  const closeButton = IconButton({ icon: "close", label: o.closeLabel, size: 20, onClick: () => undefined }).el;
  const panel = part(
    h("div", { class: "sheet", attrs: { role: "dialog", "aria-modal": "true", "aria-label": o.title } }, h("div", { class: "sheet-head" }, h("div", { class: "sheet-title", text: o.title }), closeButton), body),
    "panel",
  );
  const el = ui(h("div", { class: "sheet-root" }, veil, panel), "sheet");
  return {
    el,
    body,
    veil,
    closeButton,
    setOpen: (open: boolean) => {
      if (open) el.dataset.open = "1";
      else delete el.dataset.open;
    },
  };
}

function Table(o: TableOptions) {
  const tbody = h("tbody");
  const table = h("table", { class: "tbl ltr", attrs: { dir: "ltr" } }, h("thead", null, h("tr", null, o.columns.map((c) => h("th", { text: c })))), tbody);
  const el = ui(h("div", { class: "tbl-wrap" }, table), "table");
  const setRows = (rows: ReadonlyArray<ReadonlyArray<string>>): void => {
    clear(tbody);
    for (const r of rows) tbody.appendChild(h("tr", null, r.map((cell, i) => h("td", { text: cell, attrs: { "data-l": o.columns[i] ?? "" } }))));
  };
  setRows(o.rows ?? []);
  return { el, setRows };
}

function ListItem(o: ListItemOptions) {
  const pLtr = o.primaryLtr ?? true;
  const sLtr = o.secondaryLtr ?? false;
  const primary = part(h("span", { class: cls(o.layout === "split" ? "pick-main" : "hist-res", pLtr && "ltr"), text: o.primary }), "primary");
  const secondary = o.secondary ? part(h("span", { class: cls(o.layout === "split" ? "pick-sub" : "hist-expr", sLtr && "ltr"), text: o.secondary }), "secondary") : null;
  const el = ui(
    h(
      "button",
      {
        class: cls(o.layout === "split" ? "pick-item" : "hist-item", o.selected && "sel"),
        attrs: { type: "button", role: o.role, "aria-selected": o.role === "option" ? String(!!o.selected) : undefined, "aria-label": o.ariaLabel },
        dataset: { layout: o.layout },
      },
      ...(o.layout === "stacked" ? [secondary, primary] : [primary, secondary]),
    ),
    "list-item",
  );
  onPress(el, o.onClick);
  return { el };
}

function StepList(items: ReadonlyArray<StepItem>) {
  return { el: ui(h("ol", { class: "step-list" }, items.map((s) => h("li", null, h("div", { class: "step-name", text: s.name }), h("div", { class: "step-body" }, s.body)))), "step-list") };
}

function PlotFrame(o: { ariaLabel: string }) {
  const canvas = h("canvas", { class: "plot", attrs: { role: "img", "aria-label": o.ariaLabel } });
  return { el: ui(h("div", { class: "plot-wrap" }, canvas), "plot-frame"), canvas };
}

function StylePicker(o: StylePickerOptions) {
  const el = ui(h("div", { class: "style-picker", attrs: { role: "radiogroup", "aria-label": o.label } }), "style-picker");
  const cards = new Map<StyleId, HTMLElement>();
  const live = new Map<StyleId, HTMLElement>();
  for (const opt of o.options) {
    const half = (scheme: "light" | "dark") => {
      const c = opt.swatch[scheme];
      return h(
        "span",
        { class: "sw-half", dataset: { scheme }, style: { "--sw-bg": c.bg, "--sw-key": c.key, "--sw-accent": c.accent } },
        h("i", { class: "sw-key" }),
        h("i", { class: "sw-dot" }),
      );
    };
    const card = h(
      "button",
      {
        class: "style-card",
        attrs: { type: "button", role: "radio", "aria-checked": "false", "aria-disabled": opt.available ? undefined : "true", "aria-label": opt.name },
        dataset: { styleId: opt.id, available: opt.available ? "1" : "0" },
      },
      h("span", { class: "sw", attrs: { "aria-hidden": "true" } }, half("light"), half("dark")),
      h("span", { class: "style-text" }, h("span", { class: "style-name", text: opt.name }), opt.available ? null : h("span", { class: "style-soon", text: o.soonLabel })),
    );
    cards.set(opt.id, card);
    el.appendChild(card);
    if (opt.available) live.set(opt.id, card);
  }
  const group = radioGroup(live, o.value, o.onPick);
  const setValue = (id: StyleId): void => {
    group.set(id);
    for (const [k, c] of cards) if (!live.has(k)) c.setAttribute("aria-checked", "false");
  };
  setValue(o.value);
  return { el, setValue };
}

export const glassKit: Kit = {
  Button, IconButton, Key, Chip, Display, Card, ResultCard, Notice, Toast, ProBadge, LockedOverlay, Spinner, Text, Field, Select,
  Chooser, Segmented, Toggle, Slider, Row, Tabs, Sheet, Table, ListItem, StepList, PlotFrame, StylePicker,
};
