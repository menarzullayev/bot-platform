// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// Glass pack (shisha + gradient): Kit contract (roles, ARIA state, radio behaviour), the effective-colour contrast gate
// (tokens are the scrim blended over the mesh, and every scrim is also blended over every mesh stop), and the CSS rules
// of the adaptation axes (lite, reduced transparency, high contrast, no backdrop-filter, density, font scale).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_NAMES, TOKEN_VARS } from "../../../miniapp/src/contract/model";
import { STYLE_META } from "../../../miniapp/src/styles/meta";
import { glassAccent2, glassRecipe, glassTokens } from "../../../miniapp/src/styles/glass/tokens";
import { loadSrc } from "./dom-src";
import { checkTokens, ratio } from "./style-gate";

vi.mock("../../../miniapp/src/styles/glass/pack.css?url", () => ({ default: "/app/pack-glass.css" }));

const SRC = resolve(import.meta.dirname, "../../../miniapp/src");
const CSS = readFileSync(resolve(SRC, "styles/glass/pack.css"), "utf8");
const css = CSS.toLowerCase();

// ---------- colour helpers: alpha blending ----------
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** `fg` at opacity `a` over the opaque colour `bg`. */
const over = (fg: string, a: number, bg: string): string => toHex(rgb(fg).map((v, i) => v * a + rgb(bg)[i] * (1 - a)));

describe("glass: contrast of the EFFECTIVE (scrim-blended) colours", () => {
  it("tokens pass the shared gate: light, dark, high contrast light and dark", () => {
    expect(checkTokens(glassTokens)).toEqual([]);
  });

  it("the vermilion brand accents are exactly DEC-009's", () => {
    expect(glassTokens.light.accent).toBe("#ab3409");
    expect(glassTokens.light.onAccent).toBe("#ffffff");
    expect(glassTokens.dark.accent).toBe("#ff9254");
    expect(glassTokens.dark.onAccent).toBe("#2a1202");
    expect(glassAccent2.light).toBe("#b4231f");
    expect(glassAccent2.dark).toBe("#ff6f91");
  });

  it("uses only #rrggbb colours and pack.css repeats every token, accent-2 and recipe literal", () => {
    for (const set of [glassTokens.light, glassTokens.dark, glassTokens.contrastHigh.light, glassTokens.contrastHigh.dark]) {
      expect(Object.keys(set).sort()).toEqual([...TOKEN_NAMES].sort());
      for (const n of TOKEN_NAMES) {
        expect(set[n]).toMatch(/^#[0-9a-f]{6}$/);
        expect(css, `${n} ${set[n]}`).toContain(`${TOKEN_VARS[n]}: ${set[n]}`);
      }
    }
    for (const v of Object.values(glassAccent2)) expect(css).toContain(`--accent-2: ${v}`);
    for (const scheme of [glassRecipe.light, glassRecipe.dark]) {
      scheme.mesh.forEach((m, i) => expect(css).toContain(`--m${i + 1}: ${m}`));
      const [r, g, b] = rgb(scheme.scrim);
      expect(css).toContain(`--glass: rgba(${r}, ${g}, ${b}, ${scheme.alpha.surface})`);
      expect(css).toContain(`--glass-3: rgba(${r}, ${g}, ${b}, ${scheme.alpha.sheet})`);
      const [fr, fg, fb] = rgb(scheme.fieldScrim);
      expect(css).toContain(`--glass-2: rgba(${fr}, ${fg}, ${fb}, ${scheme.alpha.field})`);
    }
    expect(css).toContain('[data-contrast="high"]');
    expect(css).toContain('[data-theme="dark"]');
  });

  for (const scheme of ["light", "dark"] as const) {
    const t = glassTokens[scheme];
    const rec = glassRecipe[scheme];

    it(`${scheme}: tokens.surface is the surface scrim blended over tokens.bg`, () => {
      expect(over(rec.scrim, rec.alpha.surface, t.bg)).toBe(t.surface);
    });

    it(`${scheme}: ink, ink2, accent and danger stay readable on every scrim over every mesh stop`, () => {
      for (const stop of [t.bg, ...rec.mesh]) {
        for (const [name, a, tint] of [["surface", rec.alpha.surface, rec.scrim], ["field", rec.alpha.field, rec.fieldScrim], ["sheet", rec.alpha.sheet, rec.scrim]] as const) {
          const eff = over(tint, a, stop);
          const where = `${scheme} ${name} over ${stop} = ${eff}`;
          expect(ratio(t.ink, eff), `ink ${where}`).toBeGreaterThanOrEqual(7);
          expect(ratio(t.ink2, eff), `ink2 ${where}`).toBeGreaterThanOrEqual(4.5);
          expect(ratio(t.accent, eff), `accent ${where}`).toBeGreaterThanOrEqual(4.5);
          expect(ratio(t.danger, eff), `danger ${where}`).toBeGreaterThanOrEqual(4.5);
          // soft (selected tab / card) is opaque
          expect(ratio(t.accent, t.soft), `accent on soft ${scheme}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${scheme}: text lying directly on the bare mesh (labels, hints) is readable at every stop`, () => {
      for (const stop of rec.mesh) {
        expect(ratio(t.ink, stop), `ink on ${stop}`).toBeGreaterThanOrEqual(7);
        expect(ratio(t.ink2, stop), `ink2 on ${stop}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t.danger, stop), `danger on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${scheme}: a sheet (94% scrim) stays readable even over pure black or pure white page content`, () => {
      for (const extreme of ["#000000", "#ffffff"]) {
        const eff = over(rec.scrim, rec.alpha.sheet, extreme);
        expect(ratio(t.ink, eff), `ink over ${extreme}`).toBeGreaterThanOrEqual(7);
        expect(ratio(t.ink2, eff), `ink2 over ${extreme}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${scheme}: the "=" gradient (accent to accent-2) carries on-accent text at both ends`, () => {
      expect(ratio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.onAccent, glassAccent2[scheme])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("high contrast: 7:1 text, solid colours, gradient end readable too", () => {
    for (const [k, t, a2] of [["light", glassTokens.contrastHigh.light, glassAccent2.highLight], ["dark", glassTokens.contrastHigh.dark, glassAccent2.highDark]] as const) {
      expect(ratio(t.onAccent, a2), k).toBeGreaterThanOrEqual(7);
      expect(ratio(t.ink, t.bg), k).toBeGreaterThanOrEqual(7);
      expect(ratio(t.ink2, t.surface), k).toBeGreaterThanOrEqual(7);
      expect(ratio(t.line, t.bg), k).toBeGreaterThanOrEqual(3);
    }
  });

  it("negative: a scrim that is too thin fails the worst-spot check (the test can catch a regression)", () => {
    const t = glassTokens.dark;
    const rec = glassRecipe.dark;
    // 30% scrim over the lightest dark mesh stop leaves ink2 unreadable... prove the detector sees it with a white backdrop
    const thin = over(rec.scrim, 0.3, "#ffffff");
    expect(ratio(t.ink2, thin)).toBeLessThan(4.5);
    // and a light-theme ink2 that was not tuned would fail on the darkest light stop
    expect(ratio("#a08070", rec.mesh[0])).toBeLessThan(4.5);
    expect(checkTokens({ ...glassTokens, light: { ...glassTokens.light, ink2: "#a08070" } }).length).toBeGreaterThan(0);
  });

  it("the swatch colours of the style picker are valid #rrggbb", () => {
    for (const s of [STYLE_META.glass.swatch.light, STYLE_META.glass.swatch.dark]) for (const c of [s.bg, s.accent, s.key]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(STYLE_META.glass.swatch.light.accent).toBe(glassTokens.light.accent);
    expect(STYLE_META.glass.swatch.dark.accent).toBe(glassTokens.dark.accent);
  });
});

describe("glass: adaptation-axis CSS (DEC-007)", () => {
  const rule = (needle: string): string => {
    const i = css.indexOf(needle);
    expect(i, needle).toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf("}", i) + 1);
  };
  const SOLID = ["--fill: var(--surface)", "--bf: none", "--mesh: none"];

  it("lite on: opaque fills, no blur, no mesh", () => {
    const r = rule(':root[data-lite="on"]');
    for (const s of SOLID) expect(r).toContain(s);
  });

  it("the glass blur itself is scaled by --fx (lite 0 = blur 0), not only switched off by the solid blocks", () => {
    const m = /--bf:\s*blur\(calc\(12px \* var\(--fx\)\)\)/.exec(css);
    expect(m, "--bf must be blur(calc(12px * var(--fx))) ...").not.toBeNull();
  });

  it("lite auto under prefers-reduced-transparency / reduced-motion and on low-memory devices: the same solid mode", () => {
    const m = css.indexOf("@media (prefers-reduced-transparency: reduce)");
    expect(m).toBeGreaterThanOrEqual(0);
    expect(css.slice(m, m + 200)).toContain("prefers-reduced-motion: reduce");
    const r = rule(':root[data-lite="auto"] {');
    for (const s of SOLID) expect(r).toContain(s);
    const low = rule(':root[data-lite="auto"][data-lowmem]');
    for (const s of SOLID) expect(low).toContain(s);
  });

  it("high contrast: solid fills, no blur, no mesh, no gradient, heavier border through --bw", () => {
    const r = rule(':root[data-contrast="high"] { --fill');
    for (const s of SOLID) expect(r).toContain(s);
    expect(r).toContain("--grad: var(--accent)");
    expect(css).toMatch(/border: var\(--bw\) solid var\(--glass-line\)/);
    expect(r).toContain("--glass-line: var(--line)");
  });

  it("@supports not backdrop-filter: an opaque fallback", () => {
    const i = css.indexOf("@supports not");
    expect(i).toBeGreaterThanOrEqual(0);
    const block = css.slice(i, i + 400);
    expect(block).toContain("backdrop-filter");
    expect(block).toContain("--fill: var(--surface)");
    expect(block).toContain("--bf: none");
  });

  it("effects: blur radius <= 14px, only on a few large containers, never on keys, chips, fields or the tab bar", () => {
    const radii = [...css.matchAll(/blur\((?:calc\()?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(radii.length).toBeGreaterThan(0);
    for (const px of radii) expect(px).toBeLessThanOrEqual(14);
    const blurRules = [...CSS.matchAll(/([^{}]+)\{[^}]*backdrop-filter:\s*var\(--bf\)[^}]*\}/g)].map((m) => m[1]);
    const selectors = blurRules.join(",");
    for (const bad of [".key", ".chip", ".field", ".tabbar", ".btn", ".seg"]) expect(selectors, bad).not.toMatch(new RegExp(`(^|[ ,])\\${bad}(?![\\w-])`));
    for (const good of [".card", ".display", ".sheet"]) expect(selectors, good).toContain(good);
  });

  it("the mesh is a single fixed layer that plays once (no looping animation) and is scaled by --fx", () => {
    const r = rule("body::before");
    expect(r).toContain("position: fixed");
    expect(r).toContain("var(--mesh)");
    expect(r).toContain("var(--fx)");
    expect(r).not.toContain("infinite");
  });

  it("the '=' key and primary controls use the accent gradient; density, font scale and controls follow core variables", () => {
    expect(css).toContain("--grad: linear-gradient(135deg, var(--accent), var(--accent-2))");
    expect(css).toMatch(/\.key\.k-eq \{[^}]*var\(--grad\)/);
    expect(css).toMatch(/\.btn\.primary \{[^}]*var\(--grad\)/);
    expect(css).toContain("var(--ctl)");
    expect(css).toContain("var(--gap)");
    expect(css).toContain("var(--fs)");
    expect(css).toContain("var(--bw)");
    expect(css).toContain("var(--fx)");
    expect(CSS).not.toMatch(/@import|url\(|https?:\/\//);
  });

  it("keeps core's geometry: no display/position/overflow/flex/grid-template on the core-owned page classes", () => {
    for (const m of CSS.matchAll(/(^|\})\s*([^{}@]+)\{([^}]*)\}/g)) {
      const [, , sel, body] = m;
      if (!/(^|[\s,])\.(page|calc|keypad|sci|pages|app|solve-out|fin-out|fgrid|pair)(?![\w-])/.test(sel)) continue;
      expect(body, sel).not.toMatch(/(^|;|\s)(display|position|overflow|overflow-x|overflow-y|flex|grid-template-columns|grid-template-rows)\s*:/);
    }
  });

  it("uses logical properties where it adds inline offsets (RTL)", () => {
    expect(css).not.toMatch(/(^|[;{\s])(margin|padding)-(left|right)\s*:/);
    expect(css).not.toMatch(/(^|[;{\s])(left|right)\s*:/);
  });
});

describe("Kit contract: glass", () => {
  let pack: any;
  let kit: any;
  let KIT_UI: Record<string, string>;
  let KIT_COMPONENTS: string[];
  const opts = ["a", "b", "c"].map((v, i) => [v, `Option ${i}`] as const);
  const key = (k: string) => ({ key: k, bubbles: true, cancelable: true });

  beforeAll(async () => {
    ({ KIT_UI, KIT_COMPONENTS } = await loadSrc("contract/types.ts"));
    pack = (await loadSrc("styles/glass/index.ts")).default;
    kit = pack.kit;
  });
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is a complete StylePack with the glass id, the glass tokens and a stylesheet", () => {
    expect(Object.keys(pack).sort()).toEqual(["cssHref", "drawShareCard", "kit", "meta", "tokens"]);
    expect(pack.meta.id).toBe("glass");
    expect(pack.meta.nameKey).toBe("style_glass");
    expect(pack.tokens).toBe(glassTokens);
    expect(pack.cssHref).toMatch(/\.css$/);
    expect(CSS.length).toBeGreaterThan(2000);
  });

  it("implements every Kit component, each root carries its data-ui name", () => {
    expect(Object.keys(kit).sort()).toEqual([...KIT_COMPONENTS].sort());
    const made: Record<string, any> = {
      Button: kit.Button({ label: "x", onClick: () => undefined }),
      IconButton: kit.IconButton({ icon: "close", label: "x", onClick: () => undefined }),
      Key: kit.Key({ id: "7", kind: "digit", label: "7", onPress: () => undefined }),
      Chip: kit.Chip({ label: "x", onClick: () => undefined }),
      Display: kit.Display({ placeholder: "p", inputLabel: "i", onInput: () => undefined, onEnter: () => undefined, onResultClick: () => undefined }),
      Card: kit.Card({}),
      ResultCard: kit.ResultCard({}),
      Notice: kit.Notice({ kind: "info", text: "x" }),
      Toast: kit.Toast(),
      ProBadge: kit.ProBadge({ label: "Pro", tone: "pro" }),
      LockedOverlay: kit.LockedOverlay({ preview: document.createElement("div"), title: "t", text: "x", actionLabel: "a", onAction: () => undefined }),
      Spinner: kit.Spinner({ label: "wait" }),
      Text: kit.Text({ kind: "hint", text: "x" }),
      Field: kit.Field({ ariaLabel: "f" }),
      Select: kit.Select({ ariaLabel: "s", text: "x", onClick: () => undefined }),
      Chooser: kit.Chooser({ options: opts, value: "a", label: "c", onPick: () => undefined }),
      Segmented: kit.Segmented({ options: opts, value: "a", label: "s", onPick: () => undefined }),
      Toggle: kit.Toggle({ label: "t", checked: false, onChange: () => undefined }),
      Slider: kit.Slider({ label: "s", min: 0, max: 10, step: 1, value: 3, onChange: () => undefined }),
      Row: kit.Row({}),
      Tabs: kit.Tabs({ tabs: [{ id: "a", icon: "calc", label: "A" }], active: "a", onSelect: () => undefined }),
      Sheet: kit.Sheet({ title: "t", closeLabel: "Close" }),
      Table: kit.Table({ columns: ["x"] }),
      ListItem: kit.ListItem({ primary: "p", layout: "split", onClick: () => undefined }),
      StepList: kit.StepList([]),
      PlotFrame: kit.PlotFrame({ ariaLabel: "g" }),
      StylePicker: kit.StylePicker({ options: [], value: "glass", label: "s", soonLabel: "soon", onPick: () => undefined }),
    };
    expect(Object.keys(made).sort()).toEqual([...KIT_COMPONENTS].sort());
    for (const [name, h] of Object.entries(made)) {
      expect(h.el, name).toBeInstanceOf(HTMLElement);
      expect(h.el.dataset.ui, name).toBe(KIT_UI[name]);
      // CSP: no inline style attributes and no innerHTML-built markup on any component
      expect(h.el.getAttribute("style"), name).toBeNull();
      expect(h.el.querySelector("[style]"), name).toBeNull();
    }
  });

  it("interactive roots are real buttons/inputs with an accessible name", () => {
    const name = (el: Element): string => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
    const noop = () => undefined;
    const set = [
      kit.Button({ label: "Go", onClick: noop }).el,
      kit.Button({ icon: "trash", ariaLabel: "Delete", onClick: noop }).el,
      kit.IconButton({ icon: "history", label: "History", onClick: noop }).el,
      kit.Key({ id: "div", kind: "op", label: "÷", ariaLabel: "divide", onPress: noop }).el,
      kit.Key({ id: "7", kind: "digit", label: "7", onPress: noop }).el,
      kit.Chip({ label: "DEG", ariaLabel: "Angle", onClick: noop }).el,
      kit.Select({ ariaLabel: "From", text: "USD", onClick: noop }).el,
      kit.ListItem({ primary: "p", layout: "stacked", onClick: noop }).el,
    ];
    for (const el of set) {
      expect(["BUTTON", "INPUT", "SELECT"]).toContain(el.tagName);
      if (el.tagName === "BUTTON") expect(el.getAttribute("type")).toBe("button");
      expect(name(el)).not.toBe("");
    }
    const f = kit.Field({ ariaLabel: "Amount", size: "big" });
    expect(f.input.getAttribute("aria-label")).toBe("Amount");
    const d = kit.Display({ placeholder: "p", inputLabel: "Expression", onInput: noop, onEnter: noop, onResultClick: noop });
    expect(d.input.getAttribute("aria-label")).toBe("Expression");
  });

  it("state is ARIA: aria-pressed (chip, icon button), aria-invalid (field), aria-selected (tabs, options), data-open (sheet)", () => {
    const chip = kit.Chip({ label: "x", pressed: false, onClick: () => undefined });
    chip.setPressed(true);
    expect(chip.el.getAttribute("aria-pressed")).toBe("true");
    const ib = kit.IconButton({ icon: "keyboard", label: "k", pressed: false, onClick: () => undefined });
    ib.setPressed(true);
    expect(ib.el.getAttribute("aria-pressed")).toBe("true");
    const f = kit.Field({ ariaLabel: "f" });
    f.setInvalid(true, "bad");
    expect(f.input.getAttribute("aria-invalid")).toBe("true");
    f.setInvalid(false);
    expect(f.input.hasAttribute("aria-invalid")).toBe(false);
    const tabs = kit.Tabs({ tabs: [{ id: "a", icon: "calc", label: "A", badge: "PRO" }, { id: "b", icon: "calc", label: "B" }], active: "a", onSelect: () => undefined });
    const tb = [...tabs.el.querySelectorAll('[role="tab"]')];
    expect(tabs.el.getAttribute("role")).toBe("tablist");
    expect(tb.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tb[0].querySelector('[data-part="badge"]')?.textContent).toBe("PRO");
    expect(tb[0].querySelector('[data-part="label"]')?.textContent).toBe("A");
    tabs.setActive("b");
    expect(tb.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    const li = kit.ListItem({ primary: "p", layout: "split", role: "option", selected: true, onClick: () => undefined });
    expect(li.el.getAttribute("role")).toBe("option");
    expect(li.el.getAttribute("aria-selected")).toBe("true");
    const sheet = kit.Sheet({ title: "T", closeLabel: "Close" });
    expect(sheet.el.querySelector('[data-part="panel"]')?.getAttribute("role")).toBe("dialog");
    expect(sheet.el.querySelector('[data-part="panel"]')?.getAttribute("aria-modal")).toBe("true");
    for (const p of ["veil", "panel", "body"]) expect(sheet.el.querySelector(`[data-part="${p}"]`), p).not.toBeNull();
    sheet.setOpen(true);
    expect(sheet.el.dataset.open).toBe("1");
    sheet.setOpen(false);
    expect(sheet.el.hasAttribute("data-open")).toBe(false);
  });

  for (const [label, make] of [
    ["Chooser", (o: any) => kit.Chooser(o)],
    ["Segmented", (o: any) => kit.Segmented(o)],
  ] as const) {
    it(`${label}: radiogroup with roving tabindex, arrow keys wrap, setValue is silent`, () => {
      const onPick = vi.fn();
      const c = make({ options: opts, value: "a", label: "Group", onPick });
      document.body.append(c.el);
      const group = c.el.matches('[role="radiogroup"]') ? c.el : c.el.querySelector('[role="radiogroup"]');
      expect(group.getAttribute("aria-label")).toBe("Group");
      const radios = [...group.querySelectorAll('[role="radio"]')];
      expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
      expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
      radios[1].click();
      expect(onPick).toHaveBeenLastCalledWith("b");
      radios[1].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
      expect(onPick).toHaveBeenLastCalledWith("c");
      radios[2].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
      expect(onPick).toHaveBeenLastCalledWith("a");
      const n = onPick.mock.calls.length;
      c.setValue("b");
      expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
      expect(onPick).toHaveBeenCalledTimes(n);
      if (label === "Chooser") {
        expect(c.el.querySelector('[data-part="select"] select')).not.toBeNull();
        expect(c.el.querySelector(':scope > [data-part="grid"]')).not.toBeNull();
      }
    });
  }

  it("Key: mousedown keeps focus in the field, press fires once; Display result carries kind and length bucket", () => {
    const onPress = vi.fn();
    const k = kit.Key({ id: "5", kind: "digit", label: "5", onPress });
    document.body.append(k.el);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    k.el.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    k.el.click();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(k.el.dataset.key).toBe("5");
    expect(k.el.dataset.kind).toBe("digit");
    const eq = kit.Key({ id: "eq", kind: "eq", label: "=", ariaLabel: "equals", onPress });
    expect(eq.el.classList.contains("k-eq")).toBe(true); // the gradient hook of pack.css
    const d = kit.Display({ placeholder: "p", inputLabel: "i", onInput: () => undefined, onEnter: () => undefined, onResultClick: () => undefined });
    const result = d.el.querySelector('[data-part="result"]');
    expect(result.getAttribute("role")).toBe("status");
    expect(result.getAttribute("aria-live")).toBe("polite");
    d.setResult("= 4", "preview");
    expect([result.dataset.kind, result.dataset.len]).toEqual(["preview", "m"]);
    d.setResult("1234567890123456", "final");
    expect([result.dataset.kind, result.dataset.len]).toEqual(["final", "xl"]);
    d.setResult("Syntax error", "error");
    expect(result.dataset.kind).toBe("error");
  });

  it("ResultCard, Notice, Toast, LockedOverlay, Table: content and roles", () => {
    const r = kit.ResultCard({ variant: "value", live: true });
    r.update({ title: "Result", mainLabel: "Payment", main: ["1 234"], stats: [{ label: "Total", value: "9 999" }], hint: "h", note: { text: "stale", warn: true } });
    for (const s of ["Result", "Payment", "1 234", "Total", "9 999", "stale"]) expect(r.el.textContent).toContain(s);
    const main = r.el.querySelector('[data-part="main"]');
    expect([main.getAttribute("role"), main.getAttribute("aria-live"), main.tabIndex]).toEqual(["status", "polite", 0]);
    const n = kit.Notice({ kind: "error", title: "Auth", text: "reopen" });
    expect(n.el.getAttribute("role")).toBe("alert");
    n.update({ kind: "info", title: "Hi" });
    expect(n.el.getAttribute("role")).toBe("status");
    const t = kit.Toast();
    t.set("Saved", "ok", true);
    expect(t.el.hasAttribute("data-show")).toBe(true);
    t.set("Saved", "ok", false);
    expect(t.el.hasAttribute("data-show")).toBe(false);
    const onAction = vi.fn();
    const l = kit.LockedOverlay({ preview: document.createElement("p"), title: "Pro", text: "x", actionLabel: "Upgrade", onAction });
    expect(l.el.querySelector('[data-part="preview"]').getAttribute("aria-hidden")).toBe("true");
    [...l.el.querySelectorAll("button")].find((b) => b.textContent === "Upgrade").click();
    expect(onAction).toHaveBeenCalledTimes(1);
    const table = kit.Table({ columns: ["No", "Pay"], rows: [["1", "10"], ["2", "20"]] });
    expect([...table.el.querySelectorAll("td")].map((c) => c.dataset.l)).toEqual(["No", "Pay", "No", "Pay"]);
    table.setRows([["3", "30"]]);
    expect(table.el.querySelectorAll("tbody tr").length).toBe(1);
  });

  it("Toggle (switch role / checkbox), Slider (range input, live value), StylePicker (radiogroup of cards)", () => {
    const onChange = vi.fn();
    const sw = kit.Toggle({ label: "Haptics", checked: true, onChange });
    expect(sw.input.getAttribute("role")).toBe("switch");
    expect(sw.input.checked).toBe(true);
    sw.input.checked = false;
    sw.input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(kit.Toggle({ label: "c", kind: "check", checked: false, onChange }).input.hasAttribute("role")).toBe(false);
    const onSl = vi.fn();
    const s = kit.Slider({ label: "Digits", min: 0, max: 12, step: 1, value: 6, onChange: onSl });
    expect(s.input.type).toBe("range");
    expect(s.input.getAttribute("aria-label")).toBe("Digits");
    s.setValue(9);
    expect(s.el.textContent).toContain("9");
    const sw0 = { bg: "#ffffff", accent: "#ab3409", key: "#fffaf8" };
    const onPick = vi.fn();
    const options = ["tactile", "glass", "fintech", "techno"].map((id) => ({ id, name: id, swatch: { light: sw0, dark: sw0 }, available: id !== "tactile" }));
    const p = kit.StylePicker({ options, value: "glass", label: "Style", soonLabel: "Soon", onPick });
    expect(p.el.getAttribute("role")).toBe("radiogroup");
    const cards = [...p.el.querySelectorAll('[role="radio"]')];
    expect(cards.map((c) => c.dataset.styleId)).toEqual(["tactile", "glass", "fintech", "techno"]);
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);
    expect(cards[0].getAttribute("aria-disabled")).toBe("true");
    cards[2].click();
    expect(onPick).toHaveBeenLastCalledWith("fintech");
  });

  it("RTL: the kit sets no physical direction; numbers and formulas carry .ltr", () => {
    document.documentElement.setAttribute("dir", "rtl");
    const d = kit.Display({ placeholder: "p", inputLabel: "i", onInput: () => undefined, onEnter: () => undefined, onResultClick: () => undefined });
    expect(d.input.getAttribute("dir")).toBe("ltr");
    expect(d.el.querySelector('[data-part="result"]').classList.contains("ltr")).toBe(true);
    expect(kit.Field({ ariaLabel: "x" }).input.getAttribute("dir")).toBe("ltr");
    expect(kit.Table({ columns: ["a"] }).el.querySelector("table").getAttribute("dir")).toBe("ltr");
    document.documentElement.removeAttribute("dir");
  });
});
