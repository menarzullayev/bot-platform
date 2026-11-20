// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// Techno (HUD) pack: Kit contract (every component, roles / ARIA, radio behaviour), the four adaptation axes, the effect
// switches (lite, high contrast, reduced motion), RTL safety of the uppercase tracking, and the WCAG gate over its tokens.
// Self-contained on purpose (the shared PACKS / TOKEN_PACKS lists belong to other agents); it uses the same helpers.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_NAMES, TOKEN_VARS } from "../../../miniapp/src/contract/model";
import { STYLE_META } from "../../../miniapp/src/styles/meta";
import { technoTokens } from "../../../miniapp/src/styles/techno/tokens";
import { loadSrc } from "./dom-src";
import { HIGH_PAIRS, NORMAL_PAIRS, checkSet, checkTokens, ratio } from "./style-gate";

vi.mock("../../../miniapp/src/styles/techno/pack.css?url", () => ({ default: "/app/pack-techno.css" }));

const SRC = resolve(import.meta.dirname, "../../../miniapp/src");
const CSS = readFileSync(resolve(SRC, "styles/techno/pack.css"), "utf8");
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const CORE = readFileSync(resolve(SRC, "core.css"), "utf8");

const key = (k: string): KeyboardEventInit & { key: string } => ({ key: k, bubbles: true, cancelable: true });
const nameOf = (el: Element): string => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
const noop = (): void => undefined;
const OPTS = ["a", "b", "c"].map((v, i) => [v, `Option ${i}`] as const);

describe("techno contrast gate (WCAG)", () => {
  it("passes AA in light and dark and 7:1 text pairs in both high-contrast sets", () => {
    expect(checkTokens(technoTokens)).toEqual([]);
  });

  it("each set is checked separately: light, dark, contrastHigh.light, contrastHigh.dark", () => {
    expect(checkSet("light", technoTokens.light, NORMAL_PAIRS)).toEqual([]);
    expect(checkSet("dark", technoTokens.dark, NORMAL_PAIRS)).toEqual([]);
    expect(checkSet("contrastHigh.light", technoTokens.contrastHigh.light, HIGH_PAIRS)).toEqual([]);
    expect(checkSet("contrastHigh.dark", technoTokens.contrastHigh.dark, HIGH_PAIRS)).toEqual([]);
  });

  it("uses only #rrggbb colours and defines every token in every set", () => {
    for (const set of [technoTokens.light, technoTokens.dark, technoTokens.contrastHigh.light, technoTokens.contrastHigh.dark]) {
      expect(Object.keys(set).sort()).toEqual([...TOKEN_NAMES].sort());
      for (const v of Object.values(set)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("pack.css repeats exactly these colours and declares every token variable for every mode", () => {
    const css = CSS.toLowerCase();
    for (const set of [technoTokens.light, technoTokens.dark, technoTokens.contrastHigh.light, technoTokens.contrastHigh.dark]) {
      for (const n of TOKEN_NAMES) expect(css, `${n} ${set[n]}`).toContain(`${TOKEN_VARS[n]}: ${set[n]}`);
    }
    for (const sel of ['[data-contrast="high"]', '[data-theme="dark"]', '[data-theme="light"]', "prefers-color-scheme: dark"]) expect(css).toContain(sel);
  });

  it("brand (DEC-009): vermilion accent, light #ab3409 / dark #ff9254, white / #2a1202 on it", () => {
    expect(technoTokens.light.accent).toBe("#ab3409");
    expect(technoTokens.light.onAccent).toBe("#ffffff");
    expect(technoTokens.dark.accent).toBe("#ff9254");
    expect(technoTokens.dark.onAccent).toBe("#2a1202");
    expect(CSS).toContain("--accent-2: #b4231f");
    expect(CSS).toContain("--accent-2: #ff6f91");
  });

  it("the picker swatch is consistent with the tokens (bg, accent, key = surface)", () => {
    const s = STYLE_META.techno.swatch;
    expect(s.light).toEqual({ bg: technoTokens.light.bg, accent: technoTokens.light.accent, key: technoTokens.light.surface });
    expect(s.dark).toEqual({ bg: technoTokens.dark.bg, accent: technoTokens.dark.accent, key: technoTokens.dark.surface });
  });

  it("the semantic success colour is green and readable on bg and surface (not the accent)", () => {
    const ok = [...CSS.matchAll(/--ok: (#[0-9a-f]{6})/gi)].map((m) => m[1]);
    expect(ok.length).toBeGreaterThanOrEqual(6);
    for (const [fg, bgs] of [
      ["#0f6b45", [technoTokens.light.bg, technoTokens.light.surface]],
      ["#5fe3a8", [technoTokens.dark.bg, technoTokens.dark.surface]],
      ["#0b5a37", [technoTokens.contrastHigh.light.bg, technoTokens.contrastHigh.light.surface]],
      ["#7ff0bd", [technoTokens.contrastHigh.dark.bg, technoTokens.contrastHigh.dark.surface]],
    ] as const) for (const bg of bgs) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the second brand colour (accent-2) is readable on the page in every mode", () => {
    expect(ratio("#b4231f", technoTokens.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#ff6f91", technoTokens.dark.bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#8f1a16", technoTokens.contrastHigh.light.bg)).toBeGreaterThanOrEqual(7);
    expect(ratio("#ffa3b8", technoTokens.contrastHigh.dark.bg)).toBeGreaterThanOrEqual(7);
  });

  it("danger stays distinguishable from the accent in every mode (different hue family, not a clone)", () => {
    for (const set of [technoTokens.light, technoTokens.dark, technoTokens.contrastHigh.light, technoTokens.contrastHigh.dark]) expect(set.danger).not.toBe(set.accent);
  });

  it("negative: weakening a vermilion token is caught by the gate", () => {
    expect(checkTokens({ ...technoTokens, light: { ...technoTokens.light, accent: "#e0561f" } }).some((x) => x.startsWith("light:") && x.includes("accent"))).toBe(true);
    expect(checkTokens({ ...technoTokens, contrastHigh: { ...technoTokens.contrastHigh, dark: { ...technoTokens.contrastHigh.dark, ink2: "#777777" } } }).some((x) => x.startsWith("contrastHigh.dark:"))).toBe(true);
  });
});

describe("techno pack stylesheet: axes, effects, geometry, RTL", () => {
  it("honours the font-scale axis: every font-size / font shorthand uses var(--fs)", () => {
    let n = 0;
    for (const m of CSS_CODE.matchAll(/(?:^|[;{\s])font-size:\s*([^;}]+)/g)) {
      n++;
      expect(m[1], `font-size: ${m[1]}`).toContain("var(--fs)");
    }
    for (const m of CSS_CODE.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)) expect(m[1], `font: ${m[1]}`).toContain("var(--fs)");
    expect(n).toBeGreaterThan(40);
  });

  it("reads density and border axes (var(--ctl), var(--gap), var(--bw)) and never redefines core's axis variables", () => {
    for (const v of ["var(--ctl)", "var(--gap)", "var(--bw)", "var(--fx)"]) expect(CSS_CODE).toContain(v);
    expect(CSS_CODE).not.toMatch(/--ctl\s*:/);
    expect(CSS_CODE).not.toMatch(/--fs\s*:/);
    expect(CSS_CODE).not.toMatch(/--fx\s*:/);
    expect(CSS_CODE).not.toMatch(/--bw\s*:/);
    expect(CSS_CODE).not.toMatch(/--gap\s*:/);
  });

  it("lite mode: the neon scale derives from --fx, and every blur / animation duration is multiplied by --fx", () => {
    expect(CSS_CODE).toMatch(/--glow:\s*var\(--fx\)/);
    for (const m of CSS_CODE.matchAll(/blur\(([^)]*\)?[^)]*)\)/g)) expect(m[1], `blur(${m[1]})`).toContain("--fx");
    for (const m of CSS_CODE.matchAll(/animation:\s*([^;}]+)/g)) {
      if (m[1].trim() === "none") continue;
      expect(m[1], `animation: ${m[1]}`).toContain("var(--fx)");
    }
    // glows are multiplied by --glow (radius and alpha); none uses a raw radius
    for (const m of CSS_CODE.matchAll(/(?:box|text)-shadow:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (v === "none" || v === "var(--ring)") continue;
      // a glow uses --glow / --ring; a solid ring (blur 0: "0 0 0 <width> <colour>") is free of GPU cost and may stay
      expect(v, `shadow: ${v}`).toMatch(/--glow|--ring|^0 0 0 (?:1px|var\(--bw\)) /);
    }
    expect(CSS_CODE).toMatch(/--ring:[^;]*var\(--glow\)/);
  });

  it("lite mode and high contrast switch the scanline off (and high contrast also the glow, grid and cursor)", () => {
    expect(CSS_CODE).toMatch(/\[data-lite="on"\][^{]*\.display::after[^{]*\{\s*display:\s*none/);
    expect(CSS_CODE).toMatch(/\[data-contrast="high"\][^{]*\.display::after[^{]*\{\s*display:\s*none/);
    expect(CSS_CODE).toMatch(/:root\[data-contrast="high"\]\s*\{\s*--glow:\s*0;\s*--grid:\s*transparent/);
    expect(CSS_CODE).toMatch(/\[data-contrast="high"\]\s+\.result::after\s*\{\s*animation:\s*none/);
    expect(CSS_CODE).toContain("--cw: calc(1px + var(--bw))"); // brackets get thicker with the 2px high-contrast border
  });

  it("reduced motion: the blinking cursor is switched off", () => {
    expect(CSS_CODE).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.result::after\s*\{\s*animation:\s*none/);
  });

  it("system monospace stack only: no web fonts, no remote URLs (CSP)", () => {
    expect(CSS_CODE).toMatch(/--mono:\s*ui-monospace,\s*"JetBrains Mono",\s*Menlo,\s*Consolas,\s*monospace/);
    expect(CSS_CODE).toMatch(/body\s*\{\s*font-family:\s*var\(--mono\)/);
    expect(CSS_CODE).not.toMatch(/@font-face|@import|url\(|https?:/);
  });

  it("uppercase tracking is safe: it shrinks on narrow windows and is off in Arabic (RTL)", () => {
    expect(CSS_CODE).toMatch(/@media \(max-width: 359px\)\s*\{\s*:root\s*\{\s*--ls:\s*0\.02em/);
    expect(CSS_CODE).toMatch(/:root\[dir="rtl"\]\s*\{\s*--ls:\s*0em/);
    for (const m of CSS_CODE.matchAll(/letter-spacing:\s*([^;}]+)/g)) expect(m[1], `letter-spacing: ${m[1]}`).toMatch(/var\(--ls\)|^0$|^0em$|^-0\.0\dem$/);
  });

  it("narrow windows: table cells (core turns rows into blocks) wrap instead of overflowing, restoring white-space: normal", () => {
    const m = /@media \(max-width: 419px\)\s*\{([\s\S]*?)\n\}/.exec(CSS_CODE);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/\.tbl td\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
  });

  it("larger text scales keep the six tab labels on one line (smaller size, tighter tracking)", () => {
    expect(CSS_CODE).toMatch(/\[data-fs="l"\] \.tab-label,\s*:root\[data-fs="xl"\] \.tab-label\s*\{[^}]*font-size:\s*calc\(8\.5px \* var\(--fs\)\)/);
  });

  it("calculator keys and unit chips are never uppercased (case carries meaning: e / E, mm / Mm)", () => {
    expect(CSS_CODE).not.toMatch(/\.key[^{]*\{[^}]*text-transform:\s*uppercase/);
    expect(CSS_CODE).toMatch(/\.choose-grid \.chip\s*\{[^}]*text-transform:\s*none/);
  });

  it("does not override the geometry-critical properties of core components", () => {
    // selectors keyed on data-ui / data-part may paint (position:relative for the corner brackets is the one allowed exception)
    for (const m of CSS_CODE.matchAll(/([^{}]*\[data-(?:ui|part)=[^{}]*)\{([^}]*)\}/g)) {
      const body = m[2];
      expect(body, m[1]).not.toMatch(/(?:^|[;\s])(?:display|overflow|overflow-x|overflow-y|flex|flex-direction|grid-template-columns|grid-template-rows)\s*:/);
      if (/(?:^|[;\s])position\s*:/.test(body) && !/::before$/.test(m[1].trim())) expect(body, m[1]).toMatch(/position:\s*(?:relative|absolute)/);
    }
    // the page layout classes of core are never restyled with layout properties
    for (const m of CSS_CODE.matchAll(/(?:^|\})\s*((?:\.page|\.app|\.pages|\.calc|\.keypad|\.sci|\.pair|\.solve-out|\.fin-out|\.fn-list|\.graph-tools)(?:\.[a-z-]+)?)\s*\{([^}]*)\}/g)) {
      expect(m[2], m[1]).not.toMatch(/(?:^|[;\s])(?:display|position|overflow|flex|grid-template-columns|grid-template-rows|height|width)\s*:/);
    }
  });

  it("states are styled through ARIA attributes, not state classes", () => {
    for (const a of ['[aria-pressed="true"]', '[aria-checked="true"]', '[aria-selected="true"]', '[aria-invalid="true"]', ":checked"]) expect(CSS_CODE).toContain(a);
    expect(CSS_CODE).not.toMatch(/\.(?:active|selected|checked|pressed|on)\b[^-]/);
  });

  it("HUD character is present: corner brackets, scanline, grid, neon ring, cursor", () => {
    expect(CSS_CODE).toMatch(/\[data-ui="card"\]::before/);
    expect(CSS_CODE).toMatch(/\[data-ui="display"\]::before/);
    expect(CSS_CODE).toContain("repeating-linear-gradient");
    expect(CSS_CODE).toMatch(/background-size:\s*32px 32px/);
    expect(CSS_CODE).toContain("--ring:");
    expect(CSS_CODE).toContain("@keyframes blink");
    expect(CSS_CODE).toMatch(/border-radius:\s*0/); // the HUD is square: the radius variables are zeroed
    expect(CSS_CODE).toMatch(/--radius:\s*0px;\s*--r-s:\s*0px;\s*--r-m:\s*0px/);
  });

  it("decorative generated text carries an empty alt (not read aloud)", () => {
    for (const m of CSS_CODE.matchAll(/content:\s*("[^"]+")\s*\/\s*""/g)) expect(m[1].length).toBeGreaterThan(2);
    expect(CSS_CODE).toMatch(/content:\s*"_"\s*\/\s*""/);
  });

  it("core.css keeps owning the layout this pack depends on (no-scroll rules for the six pages)", () => {
    for (const s of ["max-width: 359px", '[data-ui="chooser"]', ".keypad", "max-height: 679px", '[data-ui="table"]']) expect(CORE).toContain(s);
  });
});

describe("techno Kit contract", () => {
  let pack: any;
  let kit: any;
  let KIT_UI: Record<string, string>;
  let KIT_COMPONENTS: string[];

  beforeAll(async () => {
    ({ KIT_UI, KIT_COMPONENTS } = await loadSrc("contract/types.ts"));
    pack = (await loadSrc("styles/techno/index.ts")).default;
    kit = pack.kit;
  });
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("dir");
  });

  it("is a complete StylePack for the techno id", () => {
    expect(pack.meta).toBe(STYLE_META.techno);
    expect(pack.meta.id).toBe("techno");
    expect(pack.meta.nameKey).toBe("style_techno");
    expect(pack.tokens).toBe(technoTokens);
    expect(pack.cssHref).toBe("/app/pack-techno.css");
    expect(Object.keys(pack).sort()).toEqual(["cssHref", "kit", "meta", "tokens"]);
  });

  it("implements exactly the contract's 27 components", () => {
    expect(KIT_COMPONENTS.length).toBe(27);
    expect(Object.keys(kit).sort()).toEqual([...KIT_COMPONENTS].sort());
    for (const n of KIT_COMPONENTS) expect(typeof kit[n], n).toBe("function");
  });

  it("every component root is an HTMLElement with its data-ui name", () => {
    const made: Record<string, any> = {
      Button: kit.Button({ label: "x", onClick: noop }),
      IconButton: kit.IconButton({ icon: "close", label: "x", onClick: noop }),
      Key: kit.Key({ id: "7", kind: "digit", label: "7", onPress: noop }),
      Chip: kit.Chip({ label: "x", onClick: noop }),
      Display: kit.Display({ placeholder: "p", inputLabel: "i", onInput: noop, onEnter: noop, onResultClick: noop }),
      Card: kit.Card({}),
      ResultCard: kit.ResultCard({}),
      Notice: kit.Notice({ kind: "info", text: "x" }),
      Toast: kit.Toast(),
      ProBadge: kit.ProBadge({ label: "Pro", tone: "pro" }),
      LockedOverlay: kit.LockedOverlay({ preview: document.createElement("div"), title: "t", text: "x", actionLabel: "a", onAction: noop }),
      Spinner: kit.Spinner({ label: "wait" }),
      Text: kit.Text({ kind: "hint", text: "x" }),
      Field: kit.Field({ ariaLabel: "f" }),
      Select: kit.Select({ ariaLabel: "s", text: "x", onClick: noop }),
      Chooser: kit.Chooser({ options: OPTS, value: "a", label: "c", onPick: noop }),
      Segmented: kit.Segmented({ options: OPTS, value: "a", label: "s", onPick: noop }),
      Toggle: kit.Toggle({ label: "t", checked: false, onChange: noop }),
      Slider: kit.Slider({ label: "s", min: 0, max: 10, step: 1, value: 3, onChange: noop }),
      Row: kit.Row({}),
      Tabs: kit.Tabs({ tabs: [{ id: "a", icon: "calc", label: "A" }], active: "a", onSelect: noop }),
      Sheet: kit.Sheet({ title: "t", closeLabel: "Close" }),
      Table: kit.Table({ columns: ["x"] }),
      ListItem: kit.ListItem({ primary: "p", layout: "split", onClick: noop }),
      StepList: kit.StepList([]),
      PlotFrame: kit.PlotFrame({ ariaLabel: "g" }),
      StylePicker: kit.StylePicker({ options: [], value: "techno", label: "s", soonLabel: "soon", onPick: noop }),
    };
    expect(Object.keys(made).sort()).toEqual([...KIT_COMPONENTS].sort());
    for (const [name, h] of Object.entries(made)) {
      expect(h.el, name).toBeInstanceOf(HTMLElement);
      expect((h.el as HTMLElement).dataset.ui, name).toBe(KIT_UI[name]);
    }
  });

  it("interactive roots are real focusable elements with an accessible name", () => {
    const btn = kit.Button({ label: "Go", onClick: noop }).el;
    const icon = kit.IconButton({ icon: "history", label: "History", onClick: noop }).el;
    const k = kit.Key({ id: "div", kind: "op", label: "÷", ariaLabel: "divide", onPress: noop }).el;
    const chip = kit.Chip({ label: "DEG", ariaLabel: "Angle", onClick: noop }).el;
    const sel = kit.Select({ ariaLabel: "From", text: "USD", onClick: noop }).el;
    const li = kit.ListItem({ primary: "USD", layout: "split", onClick: noop }).el;
    for (const el of [btn, icon, k, chip, sel, li]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("type")).toBe("button");
      expect(nameOf(el)).not.toBe("");
    }
    const f = kit.Field({ ariaLabel: "Amount" });
    expect(f.input.getAttribute("aria-label")).toBe("Amount");
    const d = kit.Display({ placeholder: "p", inputLabel: "Expression", onInput: noop, onEnter: noop, onResultClick: noop });
    expect(d.input.getAttribute("aria-label")).toBe("Expression");
    const sl = kit.Slider({ label: "Digits", min: 0, max: 20, step: 1, value: 1, onChange: noop });
    expect(sl.input.getAttribute("aria-label")).toBe("Digits");
  });

  it("Button / IconButton / Chip / Select / ListItem call their callback exactly once; Key keeps the caret in the field", () => {
    const fn = vi.fn();
    const els = [
      kit.Button({ label: "Go", variant: "primary", icon: "plus", onClick: fn }).el,
      kit.IconButton({ icon: "history", label: "H", onClick: fn }).el,
      kit.Chip({ label: "x", onClick: fn }).el,
      kit.Select({ ariaLabel: "s", text: "x", onClick: fn }).el,
      kit.ListItem({ primary: "p", layout: "stacked", onClick: fn }).el,
    ];
    for (const el of els) el.click();
    expect(fn).toHaveBeenCalledTimes(5);
    const press = vi.fn();
    const k = kit.Key({ id: "eq", kind: "eq", label: "=", onPress: press }).el;
    document.body.append(k);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    k.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    k.click();
    expect(press).toHaveBeenCalledTimes(1);
    expect(k.dataset.key).toBe("eq");
    expect(k.dataset.kind).toBe("eq");
  });

  it("Button: variant, label part, setLabel, setDisabled", () => {
    const b = kit.Button({ label: "Go", variant: "danger", size: "slim", block: true, onClick: noop });
    expect(b.el.dataset.variant).toBe("danger");
    expect(b.el.querySelector('[data-part="label"]')?.textContent).toBe("Go");
    b.setLabel("Stop");
    expect(b.el.textContent).toContain("Stop");
    b.setDisabled(true);
    expect(b.el.disabled).toBe(true);
    expect(kit.Button({ icon: "trash", ariaLabel: "Delete", onClick: noop }).el.querySelector('[data-part="label"]')).toBeNull();
  });

  it("toggle state is ARIA: IconButton and Chip keep aria-pressed only when they are toggles", () => {
    const ib = kit.IconButton({ icon: "keyboard", label: "Kbd", pressed: false, onClick: noop });
    expect(ib.el.getAttribute("aria-pressed")).toBe("false");
    ib.setPressed(true);
    expect(ib.el.getAttribute("aria-pressed")).toBe("true");
    expect(kit.IconButton({ icon: "history", label: "H", onClick: noop }).el.hasAttribute("aria-pressed")).toBe(false);
    const c = kit.Chip({ label: "DEG", pressed: true, onClick: noop });
    expect(c.el.getAttribute("aria-pressed")).toBe("true");
    c.setPressed(false);
    expect(c.el.getAttribute("aria-pressed")).toBe("false");
    c.setLabel("RAD");
    expect(c.el.textContent).toBe("RAD");
    expect(kit.Chip({ label: "x", onClick: noop }).el.hasAttribute("aria-pressed")).toBe(false);
  });

  it("Display: status result (role, aria-live, tabindex), kind and length buckets, input events", () => {
    const cb = { onInput: vi.fn(), onEnter: vi.fn(), onResultClick: vi.fn() };
    const d = kit.Display({ placeholder: "Expr", inputLabel: "Expression", ...cb });
    document.body.append(d.el);
    const result = d.el.querySelector('[data-part="result"]') as HTMLElement;
    expect(result.getAttribute("role")).toBe("status");
    expect(result.getAttribute("aria-live")).toBe("polite");
    expect(result.getAttribute("tabindex")).toBe("0");
    expect(result.dataset.kind).toBe("none");
    d.setResult("= 4", "preview");
    expect([result.dataset.kind, result.dataset.len]).toEqual(["preview", "m"]);
    d.setResult("123456789012", "final");
    expect(result.dataset.len).toBe("l");
    d.setResult("1234567890123456", "final");
    expect(result.dataset.len).toBe("xl");
    d.setResult("Syntax error", "error");
    expect(result.dataset.kind).toBe("error");
    result.click();
    expect(cb.onResultClick).toHaveBeenCalledTimes(1);
    d.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(cb.onInput).toHaveBeenCalledTimes(1);
    const enter = new KeyboardEvent("keydown", key("Enter"));
    d.input.dispatchEvent(enter);
    expect(cb.onEnter).toHaveBeenCalledTimes(1);
    expect(enter.defaultPrevented).toBe(true);
    d.input.dispatchEvent(new KeyboardEvent("keydown", key("a")));
    expect(cb.onEnter).toHaveBeenCalledTimes(1);
    d.setPrev("2+2 =");
    expect(d.el.querySelector('[data-part="prev"]')?.textContent).toBe("2+2 =");
  });

  it("the HUD decoration adds no DOM nodes: a Display contains exactly prev, input and result (assistive tech sees the contract)", () => {
    const d = kit.Display({ placeholder: "p", inputLabel: "i", onInput: noop, onEnter: noop, onResultClick: noop });
    expect([...d.el.children].map((c) => (c as HTMLElement).dataset.part)).toEqual(["prev", "input", "result"]);
    const card = kit.Card({}, "x");
    expect(card.el.children.length).toBe(0);
  });

  it("Card, ResultCard (all variants), Notice, Toast, ProBadge, Spinner, Text", () => {
    expect(kit.Card({ tone: "error", class: "form fgrid" }, "text").el.classList.contains("fgrid")).toBe(true);
    const onMain = vi.fn();
    const r = kit.ResultCard({ variant: "hero", live: true, onMainClick: onMain });
    r.update({ title: "Loan", mainLabel: "Payment", main: ["2 643 554,86"], stats: [{ label: "Total", value: "63 445" }], hint: "24%", note: { text: "Stale", warn: true } });
    for (const s of ["Loan", "Payment", "2 643 554,86", "Total", "63 445", "24%", "Stale"]) expect(r.el.textContent).toContain(s);
    const main = r.el.querySelector('[data-part="main"]') as HTMLElement;
    expect(main.getAttribute("role")).toBe("status");
    expect(main.tabIndex).toBe(0);
    main.click();
    expect(onMain).toHaveBeenCalledTimes(1);
    r.update({});
    expect(r.el.textContent).not.toContain("Loan");
    r.update({ note: { text: "Loading", busy: true } });
    expect(r.el.querySelector('[data-ui="spinner"]')).not.toBeNull();
    const lines = kit.ResultCard({ variant: "lines" });
    lines.update({ main: ["x = 1", "x = 2"] });
    expect(lines.el.querySelectorAll(".res-line").length).toBe(2);
    expect(lines.el.querySelector('[data-part="main"]')?.hasAttribute("role")).toBe(false);

    const n = kit.Notice({ kind: "error", title: "Auth", text: "reopen" });
    expect([n.el.getAttribute("role"), n.el.dataset.kind]).toEqual(["alert", "error"]);
    n.update({ kind: "info", title: "Hi" });
    expect([n.el.getAttribute("role"), n.el.dataset.kind]).toEqual(["status", "info"]);
    expect(n.el.textContent).not.toContain("reopen");

    const t = kit.Toast();
    expect(t.el.getAttribute("role")).toBe("status");
    t.set("Saved", "ok", true);
    expect([t.el.hasAttribute("data-show"), t.el.dataset.kind, t.el.textContent]).toEqual([true, "ok", "Saved"]);
    t.set("Saved", "error", false);
    expect([t.el.hasAttribute("data-show"), t.el.dataset.kind]).toEqual([false, "error"]);

    expect(kit.ProBadge({ label: "PRO", tone: "pro" }).el.textContent).toBe("PRO");
    const s = kit.Spinner({ label: "Loading" });
    expect([s.el.getAttribute("role"), s.el.getAttribute("aria-label")]).toEqual(["status", "Loading"]);
    for (const kind of ["hint", "label", "empty"]) {
      const tx = kit.Text({ kind, text: "abc", align: "center", ltr: true });
      expect(tx.el.textContent).toBe("abc");
      tx.setText("xyz");
      expect(tx.el.textContent).toBe("xyz");
    }
  });

  it("LockedOverlay: preview aria-hidden, action works", () => {
    const onAction = vi.fn();
    const p = document.createElement("p");
    const l = kit.LockedOverlay({ preview: p, title: "Pro only", text: "Upgrade", actionLabel: "Upgrade now", onAction });
    expect(l.el.querySelector('[data-part="preview"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(l.el.querySelector('[data-part="lock-text"]')?.textContent).toBe("Upgrade");
    ([...l.el.querySelectorAll("button")].find((b) => nameOf(b) === "Upgrade now") as HTMLButtonElement).click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("Field: label part, value, invalid state through aria-invalid, ltr default", () => {
    const onInput = vi.fn();
    const f = kit.Field({ label: "Amount", ariaLabel: "Amount", value: "5", inputMode: "decimal", size: "big", maxLength: 12, onInput });
    expect(f.el.tagName).toBe("LABEL");
    expect(f.el.querySelector('[data-part="label"]')?.textContent).toBe("Amount");
    expect(f.input.value).toBe("5");
    expect(f.input.getAttribute("dir")).toBe("ltr");
    f.input.value = "42";
    f.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith("42");
    f.setInvalid(true, "bad");
    expect(f.input.getAttribute("aria-invalid")).toBe("true");
    f.setInvalid(false);
    expect(f.input.hasAttribute("aria-invalid")).toBe(false);
    expect(kit.Field({ ariaLabel: "f", ltr: false }).input.getAttribute("dir")).toBeNull();
  });

  for (const comp of ["Chooser", "Segmented"] as const) {
    it(`${comp}: radiogroup, aria-checked follows clicks and arrows, roving tabindex, setValue is silent, RTL mirrors`, () => {
      const onPick = vi.fn();
      const c = kit[comp]({ options: OPTS, value: "a", label: "Group", onPick });
      document.body.append(c.el);
      const group = c.el.matches('[role="radiogroup"]') ? c.el : (c.el.querySelector('[role="radiogroup"]') as HTMLElement);
      expect(group.getAttribute("aria-label")).toBe("Group");
      const radios = [...group.querySelectorAll('[role="radio"]')] as HTMLElement[];
      const checked = (): string[] => radios.map((r) => r.getAttribute("aria-checked") ?? "");
      expect(checked()).toEqual(["true", "false", "false"]);
      expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
      radios[1].click();
      expect(onPick).toHaveBeenLastCalledWith("b");
      expect(checked()).toEqual(["false", "true", "false"]);
      radios[1].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
      expect(onPick).toHaveBeenLastCalledWith("c");
      radios[2].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
      expect(onPick).toHaveBeenLastCalledWith("a");
      radios[0].dispatchEvent(new KeyboardEvent("keydown", key("End")));
      expect(onPick).toHaveBeenLastCalledWith("c");
      const n = onPick.mock.calls.length;
      c.setValue("b");
      expect(checked()).toEqual(["false", "true", "false"]);
      expect(onPick).toHaveBeenCalledTimes(n);
      document.documentElement.setAttribute("dir", "rtl");
      radios[1].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
      expect(onPick).toHaveBeenLastCalledWith("a");
    });
  }

  it("Chooser: grid + native select parts, langs, select change picks", () => {
    const onPick = vi.fn();
    const c = kit.Chooser({ options: OPTS, value: "a", label: "Group", langs: ["uz-Latn", "ru", "ar"], roomy: true, onPick });
    expect(c.el.dataset.roomy).toBeDefined();
    expect(c.el.querySelector('[data-part="grid"]')?.getAttribute("role")).toBe("radiogroup");
    const select = c.el.querySelector('[data-part="select"] select') as HTMLSelectElement;
    expect(select.getAttribute("aria-label")).toBe("Group");
    expect(c.el.querySelectorAll('[role="radio"]')[2].getAttribute("lang")).toBe("ar");
    select.value = "c";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onPick).toHaveBeenLastCalledWith("c");
    expect(c.el.querySelectorAll('[role="radio"]')[2].getAttribute("aria-checked")).toBe("true");
  });

  it("Toggle: switch has role=switch, check does not; Slider reports numbers and mirrors its value", () => {
    const onChange = vi.fn();
    const sw = kit.Toggle({ label: "Sync", checked: true, onChange });
    expect([sw.input.type, sw.input.getAttribute("role"), sw.input.checked]).toEqual(["checkbox", "switch", true]);
    sw.input.checked = false;
    sw.input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(kit.Toggle({ kind: "check", label: "d", checked: false, onChange }).input.hasAttribute("role")).toBe(false);
    const onInput = vi.fn();
    const onSlide = vi.fn();
    const s = kit.Slider({ label: "Digits", min: 0, max: 20, step: 1, value: 12, onInput, onChange: onSlide });
    expect([s.input.type, s.input.min, s.input.max, s.input.value]).toEqual(["range", "0", "20", "12"]);
    s.input.value = "5";
    s.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith(5);
    expect(s.el.querySelector('[data-part="value"]')?.textContent).toBe("5");
    s.input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onSlide).toHaveBeenCalledWith(5);
    s.setValue(9);
    expect(s.el.querySelector('[data-part="value"]')?.textContent).toBe("9");
  });

  it("Row, Tabs (tablist, aria-selected, badge, label part), Sheet (modal dialog, parts, data-open)", () => {
    const row = kit.Row({ label: "Theme", class: "plan" }, "child");
    expect(row.el.querySelector('[data-part="label"]')?.textContent).toBe("Theme");
    expect(kit.Row({}, "x").el.querySelector('[data-part="label"]')).toBeNull();

    const onSelect = vi.fn();
    const tabs = kit.Tabs({ tabs: [{ id: "calc", icon: "calc", label: "Calc" }, { id: "solve", icon: "solve", label: "Solve", badge: "Pro" }], active: "calc", onSelect });
    expect(tabs.el.getAttribute("role")).toBe("tablist");
    const btns = [...tabs.el.querySelectorAll('[role="tab"]')] as HTMLElement[];
    expect(btns.map((b) => b.getAttribute("aria-label"))).toEqual(["Calc", "Solve"]);
    expect(btns.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(btns[1].querySelector('[data-part="badge"]')?.textContent).toBe("Pro");
    for (const b of btns) expect(b.querySelector('[data-part="label"]')).not.toBeNull();
    tabs.setActive("solve");
    expect(btns.map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    btns[0].click();
    expect(onSelect).toHaveBeenCalledWith("calc");

    const s = kit.Sheet({ title: "History", closeLabel: "Close" });
    const dialog = s.el.querySelector('[role="dialog"]') as HTMLElement;
    expect([dialog.getAttribute("aria-modal"), dialog.getAttribute("aria-label")]).toEqual(["true", "History"]);
    expect([s.body.dataset.part, s.veil.dataset.part, dialog.dataset.part]).toEqual(["body", "veil", "panel"]);
    expect(nameOf(s.closeButton)).toBe("Close");
    s.setOpen(true);
    expect(s.el.hasAttribute("data-open")).toBe(true);
    s.setOpen(false);
    expect(s.el.hasAttribute("data-open")).toBe(false);
  });

  it("Table (ltr, data-l labels, setRows), ListItem (split / stacked / option), StepList, PlotFrame", () => {
    const t = kit.Table({ columns: ["Month", "Payment"], rows: [["1", "100"]] });
    expect(t.el.querySelector("table")?.getAttribute("dir")).toBe("ltr");
    expect([...t.el.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["Month", "Payment"]);
    expect([...t.el.querySelectorAll("td")].map((c) => c.getAttribute("data-l"))).toEqual(["Month", "Payment"]);
    t.setRows([["1", "1"], ["2", "2"]]);
    expect(t.el.querySelectorAll("tbody tr").length).toBe(2);
    t.setRows([]);
    expect(t.el.querySelectorAll("tbody tr").length).toBe(0);

    const split = kit.ListItem({ primary: "USD", secondary: "US Dollar", layout: "split", role: "option", selected: true, onClick: noop });
    expect([split.el.getAttribute("role"), split.el.getAttribute("aria-selected"), split.el.textContent]).toEqual(["option", "true", "USDUS Dollar"]);
    expect(kit.ListItem({ primary: "EUR", layout: "split", role: "option", onClick: noop }).el.getAttribute("aria-selected")).toBe("false");
    const stacked = kit.ListItem({ primary: "= 4", secondary: "2+2", layout: "stacked", ariaLabel: "2+2 = 4", onClick: noop });
    expect([stacked.el.textContent, stacked.el.getAttribute("aria-label"), stacked.el.hasAttribute("role")]).toEqual(["2+2= 4", "2+2 = 4", false]);

    const code = document.createElement("code");
    const sl = kit.StepList([{ name: "Power rule", body: ["d/dx ", code] }, { name: "Done", body: [] }]);
    expect([sl.el.tagName, sl.el.querySelectorAll("li").length]).toEqual(["OL", 2]);
    expect(sl.el.querySelector("code")).toBe(code);

    const p = kit.PlotFrame({ ariaLabel: "graph" });
    expect(p.canvas.getAttribute("role")).toBe("img");
    expect(p.canvas.getAttribute("aria-label")).toBe("graph");
    expect(p.el.contains(p.canvas)).toBe(true);
  });

  it("StylePicker: radiogroup, unavailable styles disabled with a badge, the techno card selectable", () => {
    const onPick = vi.fn();
    const sw = STYLE_META.techno.swatch;
    const options = [
      { id: "tactile", name: "Tactile", swatch: sw, available: false },
      { id: "fintech", name: "Fintech", swatch: sw, available: true },
      { id: "techno", name: "Techno", swatch: sw, available: true },
    ];
    const p = kit.StylePicker({ options, value: "techno", label: "Style", soonLabel: "Soon", onPick });
    document.body.append(p.el);
    const cards = [...p.el.querySelectorAll("[data-style-id]")] as HTMLElement[];
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    expect(cards.map((c) => c.getAttribute("aria-disabled"))).toEqual(["true", null, null]);
    expect(cards[0].textContent).toContain("Soon");
    cards[0].click();
    expect(onPick).not.toHaveBeenCalled();
    cards[1].click();
    expect(onPick).toHaveBeenCalledWith("fintech");
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });

  it("sources never set markup from strings or inline styles (CSP / XSS)", () => {
    for (const f of ["kit.ts", "index.ts"]) {
      const src = readFileSync(resolve(SRC, "styles/techno/" + f), "utf8");
      expect(src, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
      expect(src, f).not.toMatch(/setAttribute\(\s*["']style["']/);
    }
  });

  it("the four axes live on <html>: kit output does not change when they change", async () => {
    const { applyAxes } = await loadSrc("contract/axes.ts");
    const b = kit.Button({ label: "x", onClick: noop });
    document.body.append(b.el);
    const before = b.el.outerHTML;
    applyAxes({ contrast: "high", density: "compact", lite: "on", fs: "xl" });
    const root = document.documentElement;
    expect([root.dataset.contrast, root.dataset.density, root.dataset.lite, root.dataset.fs]).toEqual(["high", "compact", "on", "xl"]);
    expect(b.el.outerHTML).toBe(before);
    applyAxes({ contrast: "normal", density: "comfortable", lite: "auto", fs: "m" });
  });

  it("a destroyed element keeps no listener that fires its callback", () => {
    const onClick = vi.fn();
    const b = kit.Button({ label: "x", onClick });
    b.el.remove();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("techno negative cases (the checks above can fail)", () => {
  it("a stylesheet with a raw font size, an un-scaled blur or an un-scaled animation would be caught", () => {
    const bad = "a{font-size:14px}b{filter:blur(8px)}c{animation:spin .9s linear infinite}";
    expect([...bad.matchAll(/(?:^|[;{\s])font-size:\s*([^;}]+)/g)].some((m) => !m[1].includes("var(--fs)"))).toBe(true);
    expect([...bad.matchAll(/blur\(([^)]*\)?[^)]*)\)/g)].some((m) => !m[1].includes("--fx"))).toBe(true);
    expect([...bad.matchAll(/animation:\s*([^;}]+)/g)].some((m) => !m[1].includes("var(--fx)"))).toBe(true);
  });

  it("an uppercase rule with a fixed tracking (breaks Arabic joining) would be caught", () => {
    const bad = ".x{text-transform:uppercase;letter-spacing:.1em}";
    expect([...bad.matchAll(/letter-spacing:\s*([^;}]+)/g)].some((m) => !/var\(--ls\)|^0$|^0em$|^-0\.0\dem$/.test(m[1]))).toBe(true);
  });
});
