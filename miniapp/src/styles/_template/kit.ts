// TEMPLATE KIT: the smallest working implementation of every Kit component. Copy this folder to styles/<id>/ and
// replace markup/paint component by component (keep `data-ui`, `data-part`, ARIA state and the behaviours: the contract
// tests check them). Event logic comes from contract/helpers (onPress, radioGroup), so a new style is mostly markup.
// Selectors in pack.css use the data-ui / data-part / ARIA attributes only; add classes if you prefer them.

import { onPress, part, radioGroup, resultLen, ui } from "../../contract/helpers";
import type { Child, Kit, StyleId } from "../../contract/types";
import { clear, h, icon } from "../../ui/dom";
import { haptic } from "../../ui/tg";

const Button: Kit["Button"] = (o) => {
  const el = ui(h("button", { attrs: { type: "button", "aria-label": o.ariaLabel, title: o.title }, dataset: { variant: o.variant ?? "secondary", size: o.size ?? "normal", block: o.block ? "1" : "0" } }), "button");
  let label: HTMLElement | null = null;
  const setLabel = (t: string): void => {
    if (!label) el.appendChild((label = part(h("span"), "label")));
    label.textContent = t;
  };
  if (o.icon) el.appendChild(icon(o.icon, 18));
  if (o.label !== undefined) setLabel(o.label);
  onPress(el, o.onClick, { haptic: null });
  return { el, setLabel, setDisabled: (d) => void (el.disabled = d) };
};

const IconButton: Kit["IconButton"] = (o) => {
  const el = ui(h("button", { attrs: { type: "button", "aria-label": o.label }, dataset: { shape: o.shape ?? "plain" } }, icon(o.icon, o.size ?? 20)), "icon-button");
  const setPressed = (p: boolean): void => el.setAttribute("aria-pressed", String(p));
  if (o.pressed !== undefined) setPressed(o.pressed);
  onPress(el, o.onClick, { haptic: null });
  return { el, setPressed };
};

const Key: Kit["Key"] = (o) => {
  const el = ui(h("button", { attrs: { type: "button", "aria-label": o.ariaLabel ?? o.label }, dataset: { key: o.id, kind: o.kind }, text: o.label }), "key");
  onPress(el, o.onPress, { keepFocus: true, haptic: null });
  return { el };
};

const Chip: Kit["Chip"] = (o) => {
  const el = ui(h("button", { attrs: { type: "button", "aria-label": o.ariaLabel }, text: o.label }), "chip");
  const setPressed = (p: boolean): void => el.setAttribute("aria-pressed", String(p));
  if (o.pressed !== undefined) setPressed(o.pressed);
  onPress(el, o.onClick, { keepFocus: o.keepFocus, haptic: null });
  return { el, setLabel: (t) => void (el.textContent = t), setPressed };
};

const Display: Kit["Display"] = (o) => {
  const prev = part(h("div", { attrs: { "aria-hidden": "true" } }), "prev");
  const input = part(
    h("input", {
      attrs: { type: "text", inputmode: "none", autocomplete: "off", autocapitalize: "off", spellcheck: false, dir: "ltr", placeholder: o.placeholder, "aria-label": o.inputLabel, maxlength: 500 },
      on: { input: () => o.onInput(), keydown: (e) => { if (e.key === "Enter") { e.preventDefault(); o.onEnter(); } } },
    }),
    "input",
  );
  const result = part(h("div", { attrs: { role: "status", "aria-live": "polite", tabindex: 0 }, on: { click: () => o.onResultClick() } }), "result");
  result.dataset.kind = "none";
  result.dataset.len = "m";
  return {
    el: ui(h("div", null, prev, input, result), "display"),
    input,
    setPrev: (t) => void (prev.textContent = t),
    setResult: (t, kind) => {
      result.textContent = t;
      result.dataset.kind = kind;
      result.dataset.len = resultLen(t);
    },
  };
};

const Card: Kit["Card"] = (o, ...kids: Child[]) => ({ el: ui(h("div", { class: o.class, dataset: { tone: o.tone ?? "plain" } }, ...kids), "card") });

const ResultCard: Kit["ResultCard"] = (o) => {
  const variant = o.variant ?? "lines";
  const title = part(h("div"), "title");
  const mainLabel = part(h("div"), "main-label");
  const main = part(h("div"), "main");
  if (o.live) {
    main.setAttribute("role", "status");
    main.setAttribute("aria-live", "polite");
    main.tabIndex = 0;
  }
  if (o.onMainClick) main.addEventListener("click", () => o.onMainClick?.());
  const hero = part(h("div", null, mainLabel, main), "hero");
  const actions = part(h("div"), "actions");
  const cells = part(h("div", null, actions), "cells");
  const hint = part(h("div"), "hint");
  const note = part(h("div"), "note");
  const el = ui(h("div", { class: o.class, dataset: { variant } }, title, hero, cells, hint, note), "result-card");
  const update: ReturnType<Kit["ResultCard"]>["update"] = (d) => {
    title.textContent = d.title ?? "";
    mainLabel.textContent = d.mainLabel ?? "";
    clear(main);
    for (const line of d.main ?? []) main.appendChild(h("div", { class: "ltr", text: line }));
    for (const c of [...cells.querySelectorAll("[data-part=cell]")]) c.remove();
    for (const s of d.stats ?? []) cells.insertBefore(part(h("div", null, h("span", { text: s.label }), h("b", { class: "ltr", text: s.value })), "cell"), actions);
    cells.hidden = !(d.stats && d.stats.length) && !actions.firstChild;
    hint.textContent = d.hint ?? "";
    clear(note);
    if (d.note?.busy) note.append(Spinner({ label: d.note.text }).el, " ");
    if (d.note) note.append(d.note.text);
    note.dataset.warn = d.note?.warn ? "1" : "0";
    hero.hidden = !(d.mainLabel || (d.main && d.main.length));
  };
  update({});
  return { el, update, actions };
};

const Notice: Kit["Notice"] = (o) => {
  const title = h("strong");
  const text = part(h("span"), "text");
  const el = ui(h("div", null, title, text), "notice");
  const update = (n: typeof o): void => {
    el.dataset.kind = n.kind;
    el.setAttribute("role", n.kind === "error" ? "alert" : "status");
    title.textContent = n.title ?? "";
    text.textContent = n.text ? (n.title ? " — " : "") + n.text : "";
  };
  update(o);
  return { el, update };
};

const Toast: Kit["Toast"] = () => {
  const el = ui(h("div", { attrs: { role: "status", "aria-live": "polite" } }), "toast");
  return {
    el,
    set: (text, kind, visible) => {
      el.textContent = text;
      el.dataset.kind = kind;
      if (visible) el.dataset.show = "1";
      else delete el.dataset.show;
    },
  };
};

const ProBadge: Kit["ProBadge"] = (o) => ({ el: ui(h("span", { dataset: { tone: o.tone }, text: o.label }), "pro-badge") });

const Spinner: Kit["Spinner"] = (o) => ({ el: ui(h("span", { attrs: { role: "status", "aria-label": o.label }, text: "…" }), "spinner") });

const LockedOverlay: Kit["LockedOverlay"] = (o) => {
  const preview = part(h("div", { attrs: { "aria-hidden": "true" } }, o.preview), "preview");
  const action = Button({ label: o.actionLabel, variant: "primary", onClick: o.onAction });
  const lock = part(h("div", null, icon("lock", 26), h("div", { text: o.title }), part(h("div", { text: o.text }), "lock-text"), action.el), "lock");
  return { el: ui(h("div", null, preview, lock), "locked-overlay") };
};

const Text: Kit["Text"] = (o) => {
  const el = ui(h("div", { class: o.ltr ? "ltr" : undefined, dataset: { kind: o.kind, tone: o.tone ?? "", align: o.align ?? "" }, text: o.text ?? "" }), "text");
  return { el, setText: (t) => void (el.textContent = t) };
};

const Field: Kit["Field"] = (o) => {
  const ltr = o.ltr ?? true;
  const input = part(
    h("input", {
      attrs: { type: o.type ?? "text", inputmode: o.inputMode, dir: ltr ? "ltr" : undefined, autocomplete: "off", autocapitalize: "off", spellcheck: false, placeholder: o.placeholder, maxlength: o.maxLength, "aria-label": o.ariaLabel },
      on: { input: () => o.onInput?.(input.value), keydown: (e) => { if (e.key === "Enter") o.onEnter?.(); } },
    }),
    "input",
  );
  if (o.value !== undefined) input.value = o.value;
  const el = ui(h("label", { dataset: { size: o.size ?? "normal" } }, o.label ? part(h("span", { text: o.label }), "label") : null, input), "field");
  return {
    el,
    input,
    setValue: (v) => void (input.value = v),
    setInvalid: (bad, msg) => {
      if (bad) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
      input.title = bad ? (msg ?? "") : "";
    },
  };
};

const Select: Kit["Select"] = (o) => {
  const el = ui(h("button", { attrs: { type: "button", "aria-label": o.ariaLabel }, text: o.text }), "select");
  onPress(el, o.onClick, { haptic: null });
  return { el, setText: (t) => void (el.textContent = t) };
};

const Chooser: Kit["Chooser"] = (o) => {
  const grid = part(h("div", { attrs: { role: "radiogroup", "aria-label": o.label } }), "grid");
  const select = h("select", { attrs: { "aria-label": o.label } });
  const radios = new Map<(typeof o.options)[number][0], HTMLElement>();
  o.options.forEach(([v, text], i) => {
    const lang = o.langs?.[i];
    const b = h("button", { attrs: { type: "button", role: "radio", lang }, text });
    radios.set(v, b);
    grid.appendChild(b);
    select.appendChild(h("option", { attrs: { value: v, lang }, text }));
  });
  const group = radioGroup(radios, o.value, o.onPick, (v) => void (select.value = v));
  select.addEventListener("change", () => {
    const v = select.value as typeof o.value;
    haptic.select();
    group.set(v);
    o.onPick(v);
  });
  const el = ui(h("div", { dataset: o.roomy ? { roomy: "1" } : undefined }, grid, part(h("div", null, select), "select")), "chooser");
  return { el, setValue: (v) => group.set(v) };
};

const Segmented: Kit["Segmented"] = (o) => {
  const el = ui(h("div", { attrs: { role: "radiogroup", "aria-label": o.label } }), "segmented");
  const radios = new Map<(typeof o.options)[number][0], HTMLElement>();
  for (const [v, text] of o.options) {
    const b = h("button", { attrs: { type: "button", role: "radio" }, text });
    radios.set(v, b);
    el.appendChild(b);
  }
  const group = radioGroup(radios, o.value, o.onPick);
  return { el, setValue: (v) => group.set(v) };
};

const Toggle: Kit["Toggle"] = (o) => {
  const kind = o.kind ?? "switch";
  const input = h("input", { attrs: { type: "checkbox", role: kind === "switch" ? "switch" : undefined } });
  input.checked = o.checked;
  input.addEventListener("change", () => {
    haptic.select();
    o.onChange(input.checked);
  });
  const text = h("span", { text: o.label });
  return { el: ui(h("label", { dataset: { kind } }, ...(kind === "switch" ? [text, input] : [input, text])), "toggle"), input, setChecked: (c) => void (input.checked = c) };
};

const Slider: Kit["Slider"] = (o) => {
  const out = part(h("span", { text: String(o.value) }), "value");
  const input = h("input", { attrs: { type: "range", min: o.min, max: o.max, step: o.step, value: o.value, "aria-label": o.label } });
  input.addEventListener("input", () => {
    out.textContent = input.value;
    o.onInput?.(Number(input.value));
  });
  input.addEventListener("change", () => o.onChange(Number(input.value)));
  return {
    el: ui(h("div", null, h("div", null, o.label, out), input), "slider"),
    input,
    setValue: (v) => {
      input.value = String(v);
      out.textContent = String(v);
    },
  };
};

const Row: Kit["Row"] = (o, ...kids) => ({ el: ui(h("div", { class: ["set-row", o.class].filter(Boolean).join(" ") }, o.label !== undefined ? part(h("div", null, o.label), "label") : null, ...kids), "row") });

const Tabs: Kit["Tabs"] = (o) => {
  const buttons = new Map<string, HTMLElement>();
  const el = ui(h("nav", { attrs: { role: "tablist" } }), "tabs");
  for (const tab of o.tabs) {
    const b = h(
      "button",
      { dataset: { tab: tab.id }, attrs: { type: "button", role: "tab", "aria-label": tab.label, "aria-selected": "false" }, on: { click: () => o.onSelect(tab.id) } },
      icon(tab.icon, 20),
      part(h("span", { text: tab.label }), "label"),
      tab.badge ? part(h("span", { text: tab.badge }), "badge") : null,
    );
    buttons.set(tab.id, b);
    el.appendChild(b);
  }
  const setActive = (id: string): void => {
    for (const [k, b] of buttons) b.setAttribute("aria-selected", String(k === id));
  };
  setActive(o.active);
  return { el, setActive };
};

const Sheet: Kit["Sheet"] = (o) => {
  const body = part(h("div"), "body");
  const veil = part(h("div"), "veil");
  const closeButton = IconButton({ icon: "close", label: o.closeLabel, size: 20, onClick: () => undefined }).el;
  const panel = part(h("div", { attrs: { role: "dialog", "aria-modal": "true", "aria-label": o.title } }, h("div", null, h("b", { text: o.title }), closeButton), body), "panel");
  const el = ui(h("div", null, veil, panel), "sheet");
  return {
    el,
    body,
    veil,
    closeButton,
    setOpen: (open) => {
      if (open) el.dataset.open = "1";
      else delete el.dataset.open;
    },
  };
};

const Table: Kit["Table"] = (o) => {
  const tbody = h("tbody");
  const el = ui(h("div", null, h("table", { attrs: { dir: "ltr" } }, h("thead", null, h("tr", null, o.columns.map((c) => h("th", { text: c })))), tbody)), "table");
  const setRows = (rows: ReadonlyArray<ReadonlyArray<string>>): void => {
    clear(tbody);
    for (const r of rows) tbody.appendChild(h("tr", null, r.map((c, i) => h("td", { text: c, attrs: { "data-l": o.columns[i] ?? "" } }))));
  };
  setRows(o.rows ?? []);
  return { el, setRows };
};

const ListItem: Kit["ListItem"] = (o) => {
  const primary = part(h("span", { class: o.primaryLtr === false ? undefined : "ltr", text: o.primary }), "primary");
  const secondary = o.secondary ? part(h("span", { class: o.secondaryLtr ? "ltr" : undefined, text: o.secondary }), "secondary") : null;
  const el = ui(
    h(
      "button",
      { attrs: { type: "button", role: o.role, "aria-selected": o.role === "option" ? String(!!o.selected) : undefined, "aria-label": o.ariaLabel }, dataset: { layout: o.layout } },
      ...(o.layout === "stacked" ? [secondary, primary] : [primary, secondary]),
    ),
    "list-item",
  );
  onPress(el, o.onClick);
  return { el };
};

const StepList: Kit["StepList"] = (items) => ({ el: ui(h("ol", null, items.map((s) => h("li", null, h("b", { text: s.name }), h("div", null, s.body)))), "step-list") });

const PlotFrame: Kit["PlotFrame"] = (o) => {
  const canvas = h("canvas", { attrs: { role: "img", "aria-label": o.ariaLabel } });
  return { el: ui(h("div", null, canvas), "plot-frame"), canvas };
};

const StylePicker: Kit["StylePicker"] = (o) => {
  const el = ui(h("div", { attrs: { role: "radiogroup", "aria-label": o.label } }), "style-picker");
  const cards = new Map<StyleId, HTMLElement>();
  const live = new Map<StyleId, HTMLElement>();
  for (const opt of o.options) {
    const half = (scheme: "light" | "dark") => {
      const c = opt.swatch[scheme];
      return h("span", { dataset: { scheme }, style: { "--sw-bg": c.bg, "--sw-key": c.key, "--sw-accent": c.accent } }, h("i"), h("b"));
    };
    const card = h(
      "button",
      { attrs: { type: "button", role: "radio", "aria-checked": "false", "aria-disabled": opt.available ? undefined : "true", "aria-label": opt.name }, dataset: { styleId: opt.id } },
      h("span", { attrs: { "aria-hidden": "true" } }, half("light"), half("dark")),
      h("span", { text: opt.name }),
      opt.available ? null : h("small", { text: o.soonLabel }),
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
};

export const templateKit: Kit = {
  Button, IconButton, Key, Chip, Display, Card, ResultCard, Notice, Toast, ProBadge, LockedOverlay, Spinner, Text, Field, Select,
  Chooser, Segmented, Toggle, Slider, Row, Tabs, Sheet, Table, ListItem, StepList, PlotFrame, StylePicker,
};
