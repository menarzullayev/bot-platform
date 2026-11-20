// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// Tactile pack (the default style, DEC-009): Kit contract for every component, the four adaptation axes in pack.css,
// the WCAG gate over its tokens (plus the key-face colours only this style has) and token/stylesheet/swatch consistency.
// The generic contract.test.ts / contrast.test.ts iterate their own pack lists; this file runs the same checks for Tactile.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_NAMES, TOKEN_VARS } from "../../../miniapp/src/contract/model";
import { STYLE_META } from "../../../miniapp/src/styles/meta";
import { tactileShades, tactileTokens } from "../../../miniapp/src/styles/tactile/tokens";
import { loadSrc } from "./dom-src";
import { checkTokens, ratio } from "./style-gate";

vi.mock("../../../miniapp/src/styles/tactile/pack.css?url", () => ({ default: "/app/pack-tactile.css" }));

const SRC = resolve(import.meta.dirname, "../../../miniapp/src");
const CSS_PATH = "styles/tactile/pack.css";
const rawCss = (): string => readFileSync(resolve(SRC, CSS_PATH), "utf8");

const key = (k: string): KeyboardEventInit & { key: string } => ({ key: k, bubbles: true, cancelable: true });
const nameOf = (el: Element): string => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
const opts = ["a", "b", "c"].map((v, i) => [v, `Option ${i}`] as const);
const noop = (): void => undefined;

let KIT_UI: Record<string, string>;
let KIT_COMPONENTS: string[];
let pack: any;
let kit: any;

beforeAll(async () => {
  ({ KIT_UI, KIT_COMPONENTS } = await loadSrc("contract/types.ts"));
  pack = (await loadSrc("styles/tactile/index.ts")).default;
  kit = pack.kit;
});

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("dir");
});

describe("Tactile: the pack", () => {
  it("is a complete StylePack with the tactile meta, tokens and a stylesheet", () => {
    expect(Object.keys(pack).sort()).toEqual(["cssHref", "drawShareCard", "kit", "meta", "tokens"]);
    expect(pack.meta).toBe(STYLE_META.tactile);
    expect(pack.meta.id).toBe("tactile");
    expect(pack.meta.nameKey).toBe("style_tactile");
    expect(pack.tokens).toBe(tactileTokens);
    expect(pack.cssHref).toMatch(/\.css$/);
    expect(rawCss().length).toBeGreaterThan(2000);
  });

  it("is registered: tactile is available and is the default style", async () => {
    const reg = await loadSrc("styles/registry.ts");
    expect(reg.DEFAULT_STYLE).toBe("tactile");
    expect(reg.isAvailable("tactile")).toBe(true);
    expect(reg.effectiveStyle("tactile")).toBe("tactile");
    const loaded = await reg.loadStyle("tactile");
    expect(loaded.meta.id).toBe("tactile");
    expect(loaded.kit).toBe(kit);
  });

  it("implements every Kit component", () => {
    expect(Object.keys(kit).sort()).toEqual([...KIT_COMPONENTS].sort());
    for (const name of KIT_COMPONENTS) expect(typeof kit[name], name).toBe("function");
  });

  it("every component root is an HTMLElement carrying its data-ui name", () => {
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
      Chooser: kit.Chooser({ options: opts, value: "a", label: "c", onPick: noop }),
      Segmented: kit.Segmented({ options: opts, value: "a", label: "s", onPick: noop }),
      Toggle: kit.Toggle({ label: "t", checked: false, onChange: noop }),
      Slider: kit.Slider({ label: "s", min: 0, max: 10, step: 1, value: 3, onChange: noop }),
      Row: kit.Row({}),
      Tabs: kit.Tabs({ tabs: [{ id: "a", icon: "calc", label: "A" }], active: "a", onSelect: noop }),
      Sheet: kit.Sheet({ title: "t", closeLabel: "Close" }),
      Table: kit.Table({ columns: ["x"] }),
      ListItem: kit.ListItem({ primary: "p", layout: "split", onClick: noop }),
      StepList: kit.StepList([]),
      PlotFrame: kit.PlotFrame({ ariaLabel: "g" }),
      StylePicker: kit.StylePicker({ options: [], value: "tactile", label: "s", soonLabel: "soon", onPick: noop }),
    };
    expect(Object.keys(made).sort()).toEqual([...KIT_COMPONENTS].sort());
    for (const [name, h] of Object.entries(made)) {
      expect(h.el, name).toBeInstanceOf(HTMLElement);
      expect(h.el.dataset.ui, name).toBe(KIT_UI[name]);
    }
  });
});

describe("Tactile: components (roles, ARIA state, behaviour)", () => {
  it("Button: named <button type=button>, one call per click, label and disabled update", () => {
    const onClick = vi.fn();
    const b = kit.Button({ label: "Go", variant: "primary", icon: "plus", onClick });
    expect(b.el.tagName).toBe("BUTTON");
    expect(b.el.getAttribute("type")).toBe("button");
    expect(nameOf(b.el)).toBe("Go");
    b.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    b.setLabel("Stop");
    expect(b.el.textContent).toContain("Stop");
    b.setDisabled(true);
    expect(b.el.disabled).toBe(true);
    const iconOnly = kit.Button({ icon: "trash", ariaLabel: "Delete", onClick });
    expect(nameOf(iconOnly.el)).toBe("Delete");
    expect(iconOnly.el.querySelector('[data-part="label"]')).toBeNull();
    for (const v of ["primary", "secondary", "danger"]) expect(kit.Button({ label: "x", variant: v, onClick }).el.dataset.variant).toBe(v);
  });

  it("IconButton: named; aria-pressed only for toggles", () => {
    const onClick = vi.fn();
    const plain = kit.IconButton({ icon: "history", label: "History", onClick });
    expect(plain.el.getAttribute("aria-label")).toBe("History");
    expect(plain.el.hasAttribute("aria-pressed")).toBe(false);
    plain.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    const toggle = kit.IconButton({ icon: "keyboard", label: "Kbd", pressed: false, onClick });
    expect(toggle.el.getAttribute("aria-pressed")).toBe("false");
    toggle.setPressed(true);
    expect(toggle.el.getAttribute("aria-pressed")).toBe("true");
  });

  it("Key: data-key / data-kind, named, mousedown keeps focus, one call per press", () => {
    const onPress = vi.fn();
    for (const kind of ["digit", "op", "fn", "eq", "ctl"]) {
      const k = kit.Key({ id: "k-" + kind, kind, label: "7", onPress });
      expect([k.el.dataset.key, k.el.dataset.kind, k.el.tagName]).toEqual(["k-" + kind, kind, "BUTTON"]);
      expect(k.el.classList.contains("k-" + kind)).toBe(true);
    }
    const k = kit.Key({ id: "div", kind: "op", label: "÷", ariaLabel: "divide", onPress });
    expect(k.el.getAttribute("aria-label")).toBe("divide");
    document.body.append(k.el);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    k.el.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    k.el.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("Chip: toggle state only when asked, label, click", () => {
    const onClick = vi.fn();
    const c = kit.Chip({ label: "DEG", ariaLabel: "Angle", pressed: false, onClick });
    expect(c.el.getAttribute("aria-label")).toBe("Angle");
    expect(c.el.getAttribute("aria-pressed")).toBe("false");
    c.setPressed(true);
    expect(c.el.getAttribute("aria-pressed")).toBe("true");
    c.setLabel("RAD");
    expect(c.el.textContent).toBe("RAD");
    c.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(kit.Chip({ label: "x", onClick }).el.hasAttribute("aria-pressed")).toBe(false);
  });

  it("Display: named input, Enter, result live region with data-kind / data-len, click and prev line", () => {
    const cb = { onInput: vi.fn(), onEnter: vi.fn(), onResultClick: vi.fn() };
    const d = kit.Display({ placeholder: "Expr", inputLabel: "Expression", ...cb });
    document.body.append(d.el);
    expect(d.input.getAttribute("aria-label")).toBe("Expression");
    d.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(cb.onInput).toHaveBeenCalledTimes(1);
    const enter = new KeyboardEvent("keydown", key("Enter"));
    d.input.dispatchEvent(enter);
    expect(cb.onEnter).toHaveBeenCalledTimes(1);
    expect(enter.defaultPrevented).toBe(true);
    d.input.dispatchEvent(new KeyboardEvent("keydown", key("a")));
    expect(cb.onEnter).toHaveBeenCalledTimes(1);
    const result = d.el.querySelector('[data-part="result"]');
    expect([result.getAttribute("role"), result.getAttribute("aria-live"), result.getAttribute("tabindex")]).toEqual(["status", "polite", "0"]);
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
    d.setPrev("2+2 =");
    expect(d.el.querySelector('[data-part="prev"]').textContent).toBe("2+2 =");
  });

  it("Card and ResultCard: children, error tone, title / main / stats / hint / note, live region and actions", () => {
    const c = kit.Card({ tone: "error", class: "form fgrid" }, "text", document.createElement("hr"));
    expect(c.el.textContent).toContain("text");
    expect(c.el.classList.contains("fgrid")).toBe(true);
    expect(c.el.dataset.tone).toBe("error");
    const onMainClick = vi.fn();
    const r = kit.ResultCard({ variant: "value", live: true, onMainClick });
    r.update({ title: "Result", mainLabel: "Payment", main: ["1 234"], stats: [{ label: "Total", value: "9 999" }], hint: "1 m = 3.28 ft", note: { text: "Rates stale", warn: true } });
    for (const s of ["Result", "Payment", "1 234", "Total", "9 999", "1 m = 3.28 ft", "Rates stale"]) expect(r.el.textContent, s).toContain(s);
    const main = r.el.querySelector('[data-part="main"]');
    expect([main.getAttribute("role"), main.getAttribute("aria-live"), main.tabIndex]).toEqual(["status", "polite", 0]);
    main.click();
    expect(onMainClick).toHaveBeenCalledTimes(1);
    r.actions.append(kit.Button({ label: "Schedule", onClick: noop }).el);
    r.update({ main: ["5"], stats: [] });
    expect(r.el.textContent).toContain("Schedule");
    expect(r.el.textContent).not.toContain("Total");
    expect(r.el.textContent).not.toContain("Rates stale");
    r.update({ note: { text: "Loading", busy: true } });
    expect(r.el.querySelector('[data-ui="spinner"]')).not.toBeNull();
    for (const variant of ["hero", "lines"]) {
      const v = kit.ResultCard({ variant });
      v.update({ title: "T", mainLabel: "L", main: ["a = 1", "b = 2"] });
      expect(v.el.dataset.variant).toBe(variant);
      expect(v.el.textContent).toContain("b = 2");
      expect(v.el.querySelector('[data-part="main"]').hasAttribute("role")).toBe(false);
    }
  });

  it("Notice: kind drives role and data-kind; Toast: data-show only while visible; Spinner and ProBadge", () => {
    const n = kit.Notice({ kind: "error", title: "Auth", text: "reopen" });
    expect([n.el.getAttribute("role"), n.el.dataset.kind]).toEqual(["alert", "error"]);
    n.update({ kind: "info", title: "Open in Telegram" });
    expect([n.el.getAttribute("role"), n.el.dataset.kind]).toEqual(["status", "info"]);
    expect(n.el.textContent).not.toContain("reopen");
    const t = kit.Toast();
    expect(t.el.getAttribute("role")).toBe("status");
    t.set("Saved", "ok", true);
    expect([t.el.textContent, t.el.hasAttribute("data-show"), t.el.dataset.kind]).toEqual(["Saved", true, "ok"]);
    t.set("Saved", "error", false);
    expect([t.el.hasAttribute("data-show"), t.el.dataset.kind]).toEqual([false, "error"]);
    const s = kit.Spinner({ label: "Loading" });
    expect([s.el.getAttribute("role"), s.el.getAttribute("aria-label")]).toEqual(["status", "Loading"]);
    expect(kit.ProBadge({ label: "PRO", tone: "pro" }).el.textContent).toBe("PRO");
    expect(kit.ProBadge({ label: "Free", tone: "free" }).el.dataset.tone).toBe("free");
  });

  it("LockedOverlay: preview is aria-hidden, the action button works", () => {
    const onAction = vi.fn();
    const preview = document.createElement("p");
    const l = kit.LockedOverlay({ preview, title: "Pro only", text: "Upgrade to see steps", actionLabel: "Upgrade", onAction });
    const part = l.el.querySelector('[data-part="preview"]');
    expect(part.getAttribute("aria-hidden")).toBe("true");
    expect(part.contains(preview)).toBe(true);
    expect(l.el.querySelector('[data-part="lock-text"]').textContent).toBe("Upgrade to see steps");
    [...l.el.querySelectorAll("button")].find((b) => nameOf(b) === "Upgrade").click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("Text: every kind renders and updates", () => {
    for (const kind of ["hint", "label", "empty"]) {
      const t = kit.Text({ kind, text: "abc", tone: kind === "hint" ? "warn" : undefined, align: "center", ltr: true });
      expect(t.el.dataset.kind).toBe(kind);
      expect(t.el.textContent).toBe("abc");
      t.setText("xyz");
      expect(t.el.textContent).toBe("xyz");
    }
  });

  it("Field: label, named input, events, aria-invalid, LTR isolation", () => {
    const onInput = vi.fn();
    const onEnter = vi.fn();
    const f = kit.Field({ label: "Value", ariaLabel: "Amount", value: "5", inputMode: "decimal", size: "big", maxLength: 12, onInput, onEnter });
    document.body.append(f.el);
    expect(f.el.tagName).toBe("LABEL");
    expect([f.input.getAttribute("aria-label"), f.input.getAttribute("inputmode"), f.input.getAttribute("maxlength"), f.input.value]).toEqual(["Amount", "decimal", "12", "5"]);
    expect(f.input.getAttribute("dir")).toBe("ltr");
    f.input.value = "42";
    f.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith("42");
    f.input.dispatchEvent(new KeyboardEvent("keydown", key("Enter")));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(f.input.hasAttribute("aria-invalid")).toBe(false);
    f.setInvalid(true, "bad");
    expect(f.input.getAttribute("aria-invalid")).toBe("true");
    f.setInvalid(false);
    expect(f.input.hasAttribute("aria-invalid")).toBe(false);
    f.setValue("7");
    expect(f.input.value).toBe("7");
    const bare = kit.Field({ ariaLabel: "f1", type: "search", ltr: false });
    expect([bare.input.getAttribute("type"), bare.input.getAttribute("dir"), bare.el.querySelector('[data-part="label"]')]).toEqual(["search", null, null]);
  });

  it("Select: a named button that opens the picker", () => {
    const onClick = vi.fn();
    const s = kit.Select({ ariaLabel: "From", text: "USD", onClick });
    expect([s.el.tagName, s.el.getAttribute("aria-label"), s.el.textContent]).toEqual(["BUTTON", "From", "USD"]);
    s.setText("EUR");
    expect(s.el.textContent).toBe("EUR");
    s.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  for (const comp of ["Chooser", "Segmented"] as const) {
    it(`${comp}: radiogroup, aria-checked follows clicks, arrows, Home/End, roving tabindex, setValue is silent`, () => {
      const onPick = vi.fn();
      const c = kit[comp]({ options: opts, value: "a", label: "Group", onPick });
      document.body.append(c.el);
      const group = c.el.matches('[role="radiogroup"]') ? c.el : c.el.querySelector('[role="radiogroup"]');
      expect(group.getAttribute("aria-label")).toBe("Group");
      const radios = [...group.querySelectorAll('[role="radio"]')];
      expect(radios.map((r) => r.textContent)).toEqual(["Option 0", "Option 1", "Option 2"]);
      const checked = (): string[] => radios.map((r) => r.getAttribute("aria-checked"));
      expect(checked()).toEqual(["true", "false", "false"]);
      expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
      radios[1].click();
      expect(onPick).toHaveBeenLastCalledWith("b");
      expect(checked()).toEqual(["false", "true", "false"]);
      expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
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
    });
  }

  it("Chooser: exactly a radiogroup grid and a native select part; select change picks; langs; roomy flag", () => {
    const onPick = vi.fn();
    const c = kit.Chooser({ options: opts, value: "a", label: "Group", langs: ["uz-Latn", "ru", "ar"], roomy: true, onPick });
    document.body.append(c.el);
    expect(c.el.children.length).toBe(2);
    expect(c.el.dataset.roomy).toBeDefined();
    expect(c.el.querySelector('[data-part="grid"]').getAttribute("role")).toBe("radiogroup");
    const select = c.el.querySelector('[data-part="select"] select');
    expect([select.getAttribute("aria-label"), select.value, [...select.options].map((o) => o.value)]).toEqual(["Group", "a", ["a", "b", "c"]]);
    expect(c.el.querySelectorAll('[role="radio"]')[2].getAttribute("lang")).toBe("ar");
    select.value = "c";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onPick).toHaveBeenLastCalledWith("c");
    expect(c.el.querySelectorAll('[role="radio"]')[2].getAttribute("aria-checked")).toBe("true");
    c.setValue("b");
    expect(select.value).toBe("b");
  });

  it("radio groups mirror the arrow keys in right-to-left documents (Arabic)", () => {
    document.documentElement.setAttribute("dir", "rtl");
    const onPick = vi.fn();
    const s = kit.Segmented({ options: opts, value: "b", label: "g", onPick });
    document.body.append(s.el);
    [...s.el.querySelectorAll('[role="radio"]')][1].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
    expect(onPick).toHaveBeenLastCalledWith("a");
  });

  it("Toggle: switch has role=switch, check does not; change reports the state; stays a real checkbox input", () => {
    const onChange = vi.fn();
    const sw = kit.Toggle({ label: "Sync", checked: true, onChange });
    expect([sw.input.type, sw.input.getAttribute("role"), sw.input.checked, sw.el.tagName]).toEqual(["checkbox", "switch", true, "LABEL"]);
    expect(sw.el.textContent).toContain("Sync");
    sw.input.checked = false;
    sw.input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(false);
    sw.setChecked(true);
    expect(sw.input.checked).toBe(true);
    const check = kit.Toggle({ kind: "check", label: "Definite", checked: false, onChange });
    expect([check.input.hasAttribute("role"), check.el.dataset.kind, check.el.classList.contains("check")]).toEqual([false, "check", true]);
  });

  it("Slider: range input with limits, live value part, number callbacks", () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const s = kit.Slider({ label: "Digits", min: 0, max: 20, step: 1, value: 12, onInput, onChange });
    expect([s.input.type, s.input.min, s.input.max, s.input.step, s.input.value, s.input.getAttribute("aria-label")]).toEqual(["range", "0", "20", "1", "12", "Digits"]);
    const out = s.el.querySelector('[data-part="value"]');
    expect(out.textContent).toBe("12");
    s.input.value = "5";
    s.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith(5);
    expect(out.textContent).toBe("5");
    s.input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(5);
    s.setValue(9);
    expect([s.input.value, out.textContent]).toEqual(["9", "9"]);
  });

  it("Row: optional label part, children and the extra class", () => {
    const r = kit.Row({ label: "Theme", class: "plan" }, kit.Text({ kind: "hint", text: "child" }).el);
    expect(r.el.querySelector('[data-part="label"]').textContent).toBe("Theme");
    expect(r.el.textContent).toContain("child");
    expect(r.el.classList.contains("plan")).toBe(true);
    expect(kit.Row({}, "x").el.querySelector('[data-part="label"]')).toBeNull();
  });

  it("Tabs: tablist, named tabs, aria-selected follows setActive, click reports the id, badge part", () => {
    const onSelect = vi.fn();
    const tabs = kit.Tabs({
      tabs: [{ id: "calc", icon: "calc", label: "Calc" }, { id: "solve", icon: "solve", label: "Solve", badge: "Pro" }, { id: "settings", icon: "settings", label: "Settings" }],
      active: "calc",
      onSelect,
    });
    expect(tabs.el.getAttribute("role")).toBe("tablist");
    const btns = [...tabs.el.querySelectorAll('[role="tab"]')];
    expect(btns.map((b) => b.getAttribute("aria-label"))).toEqual(["Calc", "Solve", "Settings"]);
    expect(btns.map((b) => b.dataset.tab)).toEqual(["calc", "solve", "settings"]);
    expect(btns.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    for (const b of btns) expect(b.querySelector('[data-part="label"]')).not.toBeNull();
    expect(btns[1].querySelector('[data-part="badge"]').textContent).toBe("Pro");
    tabs.setActive("settings");
    expect(btns.map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    btns[1].click();
    expect(onSelect).toHaveBeenCalledWith("solve");
  });

  it("Sheet: modal dialog, named close button, body / veil parts, data-open flag", () => {
    const s = kit.Sheet({ title: "History", closeLabel: "Close" });
    const dialog = s.el.querySelector('[role="dialog"]');
    expect([dialog.getAttribute("aria-modal"), dialog.getAttribute("aria-label")]).toEqual(["true", "History"]);
    expect([s.body.dataset.part, s.veil.dataset.part, nameOf(s.closeButton)]).toEqual(["body", "veil", "Close"]);
    expect(s.el.contains(s.body) && s.el.contains(s.veil) && s.el.contains(s.closeButton)).toBe(true);
    s.setOpen(true);
    expect(s.el.hasAttribute("data-open")).toBe(true);
    s.setOpen(false);
    expect(s.el.hasAttribute("data-open")).toBe(false);
  });

  it("Table: LTR table, headers, rows with data-l labels, setRows replaces", () => {
    const t = kit.Table({ columns: ["Month", "Payment"], rows: [["1", "100"], ["2", "90"]] });
    const table = t.el.querySelector("table");
    expect(table.getAttribute("dir")).toBe("ltr");
    expect([...table.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["Month", "Payment"]);
    const cells = [...table.querySelectorAll("tbody td")];
    expect(cells.map((c) => c.getAttribute("data-l"))).toEqual(["Month", "Payment", "Month", "Payment"]);
    t.setRows([["9", "9"]]);
    expect(table.querySelectorAll("tbody tr").length).toBe(1);
    t.setRows([]);
    expect(table.querySelectorAll("tbody tr").length).toBe(0);
  });

  it("ListItem: split / stacked order, option semantics, click; StepList; PlotFrame", () => {
    const onClick = vi.fn();
    const split = kit.ListItem({ primary: "USD", secondary: "US Dollar", layout: "split", role: "option", selected: true, onClick });
    expect([split.el.tagName, split.el.getAttribute("role"), split.el.getAttribute("aria-selected"), split.el.textContent]).toEqual(["BUTTON", "option", "true", "USDUS Dollar"]);
    split.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(kit.ListItem({ primary: "EUR", layout: "split", role: "option", onClick }).el.getAttribute("aria-selected")).toBe("false");
    const stacked = kit.ListItem({ primary: "= 4", secondary: "2+2", layout: "stacked", ariaLabel: "2+2 = 4", onClick });
    expect([stacked.el.textContent, stacked.el.getAttribute("aria-label"), stacked.el.hasAttribute("role")]).toEqual(["2+2= 4", "2+2 = 4", false]);
    const code = document.createElement("code");
    const steps = kit.StepList([{ name: "Power rule", body: ["d/dx ", code] }, { name: "Done", body: [] }]);
    expect([steps.el.tagName, steps.el.querySelectorAll("li").length]).toEqual(["OL", 2]);
    expect(steps.el.querySelector("code")).toBe(code);
    const p = kit.PlotFrame({ ariaLabel: "graph" });
    expect([p.canvas.getAttribute("role"), p.canvas.getAttribute("aria-label"), p.el.contains(p.canvas)]).toEqual(["img", "graph", true]);
  });

  it("StylePicker: radiogroup of cards, unavailable ones are disabled with the badge, picks update aria-checked", () => {
    const onPick = vi.fn();
    const sw = { light: { bg: "#ffffff", accent: "#ab3409", key: "#f2f2f2" }, dark: { bg: "#000000", accent: "#ff9254", key: "#202020" } };
    const options = [
      { id: "tactile", name: "Tactile", swatch: sw, available: true },
      { id: "glass", name: "Glass", swatch: sw, available: false },
      { id: "fintech", name: "Fintech", swatch: sw, available: true },
      { id: "techno", name: "Techno", swatch: sw, available: false },
    ];
    const p = kit.StylePicker({ options, value: "tactile", label: "Style", soonLabel: "Soon", onPick });
    document.body.append(p.el);
    expect([p.el.getAttribute("role"), p.el.getAttribute("aria-label")]).toEqual(["radiogroup", "Style"]);
    const cards = [...p.el.querySelectorAll("[data-style-id]")];
    expect(cards.map((c) => c.dataset.styleId)).toEqual(["tactile", "glass", "fintech", "techno"]);
    for (const c of cards) expect([c.getAttribute("role"), !!c.getAttribute("aria-label")]).toEqual(["radio", true]);
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
    expect(cards.map((c) => c.getAttribute("aria-disabled"))).toEqual([null, "true", null, "true"]);
    expect(cards[1].textContent).toContain("Soon");
    cards[1].click();
    expect(onPick).not.toHaveBeenCalled();
    cards[2].click();
    expect(onPick).toHaveBeenCalledWith("fintech");
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
    p.setValue("tactile");
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
  });

  it("the kit never builds markup from strings and never writes inline style attributes (CSP)", () => {
    for (const f of ["kit.ts", "index.ts"]) {
      const src = readFileSync(resolve(SRC, "styles/tactile/" + f), "utf8");
      expect(src, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
      expect(src, f).not.toMatch(/setAttribute\(\s*["']style["']/);
    }
  });

  it("every interactive component root is keyboard-focusable and named (a11y sweep)", () => {
    const els: HTMLElement[] = [
      kit.Button({ label: "b", onClick: noop }).el,
      kit.IconButton({ icon: "close", label: "i", onClick: noop }).el,
      kit.Key({ id: "1", kind: "digit", label: "1", onPress: noop }).el,
      kit.Chip({ label: "c", onClick: noop }).el,
      kit.Select({ ariaLabel: "s", text: "x", onClick: noop }).el,
      kit.ListItem({ primary: "p", layout: "split", onClick: noop }).el,
    ];
    for (const el of els) {
      document.body.append(el);
      expect(["BUTTON", "INPUT", "SELECT"]).toContain(el.tagName);
      expect(nameOf(el)).not.toBe("");
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Tactile: pack.css and the four adaptation axes", () => {
  const css = (): string => rawCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("scales every font size by --fs; shadows, blur and animations by --fx; uses --ctl, --gap, --bw", () => {
    const c = css();
    for (const m of c.matchAll(/(?:^|[;{\s])font-size:\s*([^;}]+)/g)) expect(m[1], `font-size: ${m[1]}`).toContain("var(--fs)");
    for (const m of c.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)) expect(m[1], `font: ${m[1]}`).toContain("var(--fs)");
    for (const m of c.matchAll(/blur\(([^)]*\)?[^)]*)\)/g)) expect(m[1], `blur(${m[1]})`).toContain("--fx");
    for (const needle of ["var(--fx)", "var(--ctl)", "var(--gap)", "var(--bw)", "var(--sx)", "[data-contrast=\"high\"]"]) expect(c).toContain(needle);
    // a pack never redefines what core owns
    expect(c).not.toMatch(/--ctl\s*:/);
    expect(c).not.toMatch(/--fs\s*:/);
    expect(c).not.toMatch(/--fx\s*:/);
    expect(c).not.toMatch(/--gap\s*:/);
  });

  it("every shadow offset and blur is multiplied by --sx, which follows --fx (lite mode: flat keys) and is 0 in high contrast", () => {
    const c = css();
    expect(c).toMatch(/--sx:\s*var\(--fx\)/);
    expect(c).toMatch(/:root\[data-contrast="high"\]\s*\{[^}]*--sx:\s*0/);
    for (const m of c.matchAll(/--(o|b|o2|b2):\s*([^;]+);/g)) expect(m[2], m[0]).toContain("var(--sx)");
    for (const m of c.matchAll(/box-shadow:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (v === "none" || v === "0 0 0 1px color-mix(in srgb, var(--ink-2) 35%, transparent)") continue; // none, or the swatch hairline
      expect(v, `box-shadow: ${v}`).toMatch(/var\(--(raise|raise-s|inset|inset-s)\)|var\(--sx\)/);
    }
    // gradients flatten with --sx too (a flat face in lite mode and in high contrast)
    expect(c).toMatch(/--face:[^;]*var\(--sx\)/);
    expect(c).toMatch(/--face-accent:[^;]*var\(--sx\)/);
  });

  it("small shadows: offsets are at most 4px so they never eat page padding (264x470 stays scroll-free)", () => {
    const c = css();
    for (const m of c.matchAll(/--(o|o2):\s*calc\((\d+(?:\.\d+)?)px/g)) expect(Number(m[2]), m[0]).toBeLessThanOrEqual(4);
    for (const m of c.matchAll(/--(b|b2):\s*calc\((\d+(?:\.\d+)?)px/g)) expect(Number(m[2]), m[0]).toBeLessThanOrEqual(8);
  });

  it("every control has a visible border and the focus ring is not removed", () => {
    const c = css();
    for (const sel of [".btn", ".key", ".chip", ".select", ".icon-btn", ".hist-item", ".style-card", ".choose-select"]) {
      expect(c, sel).toMatch(new RegExp(`(?:^|[\\s,}])${sel.replace(".", "\\.")}[^{]*\\{[^}]*border:\\s*var\\(--bw\\) solid var\\(--line\\)`));
    }
    for (const sel of [".field", ".seg", ".display", ".tab", ".pick-item", ".badge"]) {
      expect(c, sel).toMatch(new RegExp(`(?:^|[\\s,}])${sel.replace(".", "\\.")}\\s*\\{[^}]*border:\\s*var\\(--bw\\) solid var\\(--line\\)`));
    }
    // outline is only removed where a replacement ring is drawn (the expression input, whose wrapper shows it)
    for (const m of c.matchAll(/([^{}]+)\{[^}]*outline:\s*none/g)) expect(m[1].trim(), m[0]).toBe(".expr");
    expect(c).toContain(".display:has(.expr:focus-visible)");
    expect(readFileSync(resolve(SRC, "core.css"), "utf8")).toMatch(/:focus-visible\s*\{\s*outline:\s*calc\(2px \* var\(--bw\)\)/);
  });

  it("pressed state exists for every raised control and for the toggle states (ARIA, not classes)", () => {
    const c = css();
    expect(c).toMatch(/\.btn:active[^{]*\{[^}]*var\(--inset-s\)/);
    expect(c).toMatch(/\.key:active/);
    for (const a of ['.chip[aria-pressed="true"]', '.chip[aria-checked="true"]', '.icon-btn[aria-pressed="true"]', '.seg-btn[aria-checked="true"]', '.tab[aria-selected="true"]', '.pick-item[aria-selected="true"]', '.style-card[aria-checked="true"]', '.field[aria-invalid="true"]']) {
      expect(c, a).toContain(a);
    }
  });

  it("respects prefers-reduced-motion through --fx (core) and has no animation that ignores it", () => {
    const c = css();
    for (const m of c.matchAll(/(?:^|[;{\s])(?:transition|animation):\s*([^;}]+)/g)) expect(m[1], m[0]).toMatch(/var\(--fx\)|^none/);
    expect(readFileSync(resolve(SRC, "core.css"), "utf8")).toContain("prefers-reduced-motion");
  });

  it("is RTL-safe: no physical left/right positioning, the switch knob is mirrored for dir=rtl", () => {
    const c = css();
    expect(c).not.toMatch(/(?:^|[;{\s])(?:left|right|margin-left|margin-right|padding-left|padding-right):/);
    expect(c).toContain(':root[dir="rtl"] .switch-row input');
  });

  it("ships no external resources (build rule): no url(), @import or http(s) in the stylesheet", () => {
    expect(css()).not.toMatch(/url\(|@import|https?:\/\//);
  });

  it("kit output follows an axis change without being rebuilt (state lives on <html>)", async () => {
    const { applyAxes } = await loadSrc("contract/axes.ts");
    const b = kit.Button({ label: "x", onClick: noop });
    document.body.append(b.el);
    const before = b.el.outerHTML;
    applyAxes({ contrast: "high", density: "compact", lite: "on", fs: "xl" });
    const root = document.documentElement;
    expect([root.dataset.contrast, root.dataset.density, root.dataset.lite, root.dataset.fs]).toEqual(["high", "compact", "on", "xl"]);
    expect(b.el.outerHTML).toBe(before);
    applyAxes({ contrast: "normal", density: "comfortable", lite: "auto", fs: "m" });
    expect(root.dataset.contrast).toBe("normal");
  });
});

describe("Tactile: contrast (WCAG)", () => {
  it("tokens pass the shared gate: AA in light and dark, 7:1 text pairs in high contrast", () => {
    expect(checkTokens(tactileTokens)).toEqual([]);
  });

  it("brand (DEC-009): vermilion #ab3409 / #ff9254 with the specified text colours", () => {
    expect(tactileTokens.light.accent).toBe("#ab3409");
    expect(tactileTokens.light.onAccent).toBe("#ffffff");
    expect(tactileTokens.dark.accent).toBe("#ff9254");
    expect(tactileTokens.dark.onAccent).toBe("#2a1202");
    expect(tactileTokens.light.bg).toBe("#e3e7f0");
    expect(tactileTokens.dark.bg).toBe("#1c2130");
  });

  const sets = [
    ["light", tactileTokens.light, tactileShades.light, false],
    ["dark", tactileTokens.dark, tactileShades.dark, false],
    ["contrastHigh.light", tactileTokens.contrastHigh.light, tactileShades.contrastHigh.light, true],
    ["contrastHigh.dark", tactileTokens.contrastHigh.dark, tactileShades.contrastHigh.dark, true],
  ] as const;

  for (const [name, t, s, high] of sets) {
    it(`${name}: text stays readable on both key-face colours (keys, buttons, chips, history items)`, () => {
      const min = high ? 7 : 4.5;
      for (const face of [s.keyHi, s.keyLo]) {
        for (const fg of ["ink", "ink2", "accent", "danger"] as const) expect(ratio(t[fg], face), `${name}: ${fg} ${t[fg]} on key ${face}`).toBeGreaterThanOrEqual(min);
      }
      // text on the soft (selected) tint and on the inset surface
      expect(ratio(t.ink2, t.soft)).toBeGreaterThanOrEqual(min);
      expect(ratio(t.ink2, t.surface)).toBeGreaterThanOrEqual(min);
    });

    it(`${name}: the 1px control border is visible against the page (>= 3:1, WCAG 1.4.11)`, () => {
      expect(ratio(t.line, t.bg), `${name}: line ${t.line} on bg ${t.bg}`).toBeGreaterThanOrEqual(3);
      expect(ratio(t.line, t.surface)).toBeGreaterThanOrEqual(high ? 3 : 2.7); // inset wells sit on the lighter surface
    });

    it(`${name}: the accent key keeps its label readable on the whole gradient and the edge is visible`, () => {
      // face goes from accent mixed 12% with white (non-high) to the accent itself
      const mix = (a: string, b: string, k: number): string => {
        const pa = parseInt(a.slice(1), 16);
        const pb = parseInt(b.slice(1), 16);
        const ch = (sh: number): string => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k).toString(16).padStart(2, "0");
        return "#" + ch(16) + ch(8) + ch(0);
      };
      const top = mix(t.accent, "#ffffff", high ? 0 : 0.12);
      expect(ratio(t.onAccent, top), `${name}: onAccent on gradient top ${top}`).toBeGreaterThanOrEqual(high ? 7 : 4.5);
      expect(ratio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(high ? 7 : 4.5);
    });
  }

  it("shades are plain #rrggbb colours and the swatch (style picker) equals the pack colours", () => {
    for (const s of [tactileShades.light, tactileShades.dark, tactileShades.contrastHigh.light, tactileShades.contrastHigh.dark]) for (const v of Object.values(s)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
    const sw = STYLE_META.tactile.swatch;
    expect(sw.light).toEqual({ bg: tactileTokens.light.bg, accent: tactileTokens.light.accent, key: tactileShades.light.keyHi });
    expect(sw.dark).toEqual({ bg: tactileTokens.dark.bg, accent: tactileTokens.dark.accent, key: tactileShades.dark.keyHi });
  });

  it("negative: the gate rejects a pale accent and weak high-contrast secondary text in this pack's tokens", () => {
    const bad = { ...tactileTokens, light: { ...tactileTokens.light, accent: "#ff9254" }, contrastHigh: { ...tactileTokens.contrastHigh, dark: { ...tactileTokens.contrastHigh.dark, ink2: "#777777" } } };
    const v = checkTokens(bad);
    expect(v.some((x) => x.startsWith("light:") && x.includes("accent"))).toBe(true);
    expect(v.some((x) => x.startsWith("contrastHigh.dark:") && x.includes("ink2"))).toBe(true);
  });
});

describe("Tactile: tokens.ts and pack.css agree", () => {
  const sets = [tactileTokens.light, tactileTokens.dark, tactileTokens.contrastHigh.light, tactileTokens.contrastHigh.dark];

  it("only #rrggbb colours and every token name in every set", () => {
    for (const set of sets) {
      expect(Object.keys(set).sort()).toEqual([...TOKEN_NAMES].sort());
      for (const v of Object.values(set)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("pack.css repeats exactly these colours and declares every token variable; dark and high-contrast blocks exist", () => {
    const css = rawCss().toLowerCase();
    for (const set of sets) for (const n of TOKEN_NAMES) expect(css, `${n} ${set[n]}`).toContain(`${TOKEN_VARS[n]}: ${set[n]}`);
    for (const needle of ['[data-contrast="high"]', '[data-theme="dark"]', '[data-theme="light"]', "prefers-color-scheme: dark"]) expect(css).toContain(needle);
  });

  it("pack.css shade variables match the shades in tokens.ts", () => {
    const css = rawCss().toLowerCase();
    for (const s of [tactileShades.light, tactileShades.dark, tactileShades.contrastHigh.light, tactileShades.contrastHigh.dark]) {
      expect(css).toContain(`--hi: ${s.hi}; --lo: ${s.lo}; --key-hi: ${s.keyHi}; --key-lo: ${s.keyLo}`);
    }
  });

  it("high contrast is at least as strong as normal for secondary text", () => {
    expect(ratio(tactileTokens.contrastHigh.light.ink2, tactileTokens.contrastHigh.light.bg)).toBeGreaterThanOrEqual(ratio(tactileTokens.light.ink2, tactileTokens.light.bg));
    expect(ratio(tactileTokens.contrastHigh.dark.ink2, tactileTokens.contrastHigh.dark.bg)).toBeGreaterThanOrEqual(ratio(tactileTokens.dark.ink2, tactileTokens.dark.bg));
  });
});
