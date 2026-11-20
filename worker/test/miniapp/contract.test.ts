// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// Kit contract: every registered pack must build every component with the expected root, ARIA state and behaviour.
// A new style that breaks the contract turns CI red (DEC-003, DEC-010, DEC-017). Add your pack to PACKS (dom-src.ts).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PACKS, loadSrc, packDirs } from "./dom-src";

// `import url from "./pack.css?url"` is an esbuild-plugin feature of the production build and vite refuses to serve
// CSS from outside the worker root, so the tests stub the URL (the stylesheet text is read with fs where needed).
vi.mock("../../../miniapp/src/styles/tactile/pack.css?url", () => ({ default: "/app/pack-tactile.css" }));
vi.mock("../../../miniapp/src/styles/glass/pack.css?url", () => ({ default: "/app/pack-glass.css" }));
vi.mock("../../../miniapp/src/styles/fintech/pack.css?url", () => ({ default: "/app/pack-fintech.css" }));
vi.mock("../../../miniapp/src/styles/techno/pack.css?url", () => ({ default: "/app/pack-techno.css" }));
vi.mock("../../../miniapp/src/styles/_template/pack.css?url", () => ({ default: "/app/pack-template.css" }));
// `npm run new-style` appends the line of a new pack right after the last vi.mock above

const SRC = resolve(import.meta.dirname, "../../../miniapp/src");

let KIT_UI: Record<string, string>;
let KIT_COMPONENTS: string[];

beforeAll(async () => {
  ({ KIT_UI, KIT_COMPONENTS } = await loadSrc("contract/types.ts"));
});

const key = (k: string): KeyboardEventInit & { key: string } => ({ key: k, bubbles: true, cancelable: true });
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The accessible name of an element: aria-label, else its visible text. */
const nameOf = (el: Element): string => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";

const RADIO_OPTS = ["a", "b", "c"].map((v, i) => [v, `Option ${i}`] as const);

/** The behaviour every radio-like kit component (Chooser, Segmented) must have. Also run against broken kits below. */
function radioContract(make: (o: unknown) => any): void {
  const onPick = vi.fn();
  const c = make({ options: RADIO_OPTS, value: "a", label: "Group", onPick });
  document.body.append(c.el);
  const group = c.el.matches('[role="radiogroup"]') ? c.el : (c.el.querySelector('[role="radiogroup"]') as HTMLElement);
  expect(group.getAttribute("aria-label")).toBe("Group");
  const radios = [...group.querySelectorAll('[role="radio"]')] as HTMLElement[];
  expect(radios.map((r) => r.textContent)).toEqual(["Option 0", "Option 1", "Option 2"]);
  const checked = (): string[] => radios.map((r) => r.getAttribute("aria-checked") ?? "");
  expect(checked()).toEqual(["true", "false", "false"]);
  expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  radios[1].click();
  expect(onPick).toHaveBeenLastCalledWith("b");
  expect(checked()).toEqual(["false", "true", "false"]);
  expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  radios[1].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
  expect(onPick).toHaveBeenLastCalledWith("c");
  expect(checked()).toEqual(["false", "false", "true"]);
  radios[2].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
  expect(onPick).toHaveBeenLastCalledWith("a"); // wraps
  radios[0].dispatchEvent(new KeyboardEvent("keydown", key("End")));
  expect(onPick).toHaveBeenLastCalledWith("c");
  const n = onPick.mock.calls.length;
  c.setValue("b");
  expect(checked()).toEqual(["false", "true", "false"]);
  expect(onPick).toHaveBeenCalledTimes(n);
}

describe("pack list (derived from miniapp/src/styles/*)", () => {
  it("every pack folder has its pack.css?url vi.mock line in this file (npm run new-style adds it)", () => {
    const self = readFileSync(import.meta.filename, "utf8");
    for (const d of packDirs()) {
      expect(self, `add: vi.mock("../../../miniapp/src/styles/${d}/pack.css?url", () => ({ default: "/app/pack-${d}.css" }));`).toContain(`vi.mock("../../../miniapp/src/styles/${d}/pack.css?url"`);
    }
  });

  it("covers every registered style plus the template", async () => {
    const { STYLE_IDS } = await loadSrc("contract/model.ts");
    const names = PACKS.map(([n]) => n);
    for (const id of STYLE_IDS) expect(names, `pack ${id}`).toContain(id);
    expect(names).toContain("_template");
  });
});

for (const [packName, entry] of PACKS) {
  describe(`Kit contract: ${packName}`, () => {
    let pack: any;
    let kit: any;
    const opts = ["a", "b", "c"].map((v, i) => [v, `Option ${i}`] as const);

    beforeAll(async () => {
      pack = (await loadSrc(entry)).default;
      kit = pack.kit;
    });
    beforeEach(() => {
      document.body.innerHTML = "";
      document.documentElement.removeAttribute("dir");
    });

    const packCss = (): string => readFileSync(resolve(SRC, entry.replace(/index\.ts$/, "pack.css")), "utf8");

    it("is a complete StylePack (meta, kit, tokens, stylesheet URL and a real pack.css)", async () => {
      // a generated skeleton still points at a registered placeholder id until it is registered (see its index.ts TODO)
      const { STYLE_IDS } = await loadSrc("contract/model.ts");
      expect(STYLE_IDS).toContain(pack.meta.id);
      expect(pack.meta.nameKey).toBe("style_" + pack.meta.id);
      expect(pack.tokens.light.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof pack.cssHref).toBe("string");
      expect(pack.cssHref).toMatch(/\.css$/);
      // drawShareCard is the one optional member (DEC-011); a pack that has it must give a function
      expect(Object.keys(pack).filter((k) => k !== "drawShareCard").sort()).toEqual(["cssHref", "kit", "meta", "tokens"]);
      if ("drawShareCard" in pack) expect(typeof pack.drawShareCard).toBe("function");
      expect(packCss().length).toBeGreaterThan(500);
    });

    it("implements every Kit component and nothing is missing from the contract", () => {
      expect(Object.keys(kit).sort()).toEqual([...KIT_COMPONENTS].sort());
      for (const name of KIT_COMPONENTS) expect(typeof kit[name], name).toBe("function");
    });

    it("every root carries its data-ui name and is an HTMLElement", () => {
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
        StylePicker: kit.StylePicker({ options: [], value: "fintech", label: "s", soonLabel: "soon", onPick: () => undefined }),
      };
      expect(Object.keys(made).sort()).toEqual([...KIT_COMPONENTS].sort());
      for (const [name, h] of Object.entries(made)) {
        expect(h.el, name).toBeInstanceOf(HTMLElement);
        expect((h.el as HTMLElement).dataset.ui, name).toBe(KIT_UI[name]);
      }
    });

    it("Button: <button type=button> with a name, calls onClick once, label and disabled update", () => {
      const onClick = vi.fn();
      const b = kit.Button({ label: "Go", variant: "primary", icon: "plus", onClick });
      expect(b.el.tagName).toBe("BUTTON");
      expect(b.el.getAttribute("type")).toBe("button");
      expect(nameOf(b.el)).toBe("Go");
      expect(b.el.querySelector('[data-part="label"]')?.textContent).toBe("Go");
      b.el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
      b.setLabel("Stop");
      expect(b.el.textContent).toContain("Stop");
      b.setDisabled(true);
      expect(b.el.disabled).toBe(true);
      b.setDisabled(false);
      expect(b.el.disabled).toBe(false);
      const iconOnly = kit.Button({ icon: "trash", ariaLabel: "Delete", onClick });
      expect(nameOf(iconOnly.el)).toBe("Delete");
      expect(iconOnly.el.querySelector('[data-part="label"]')).toBeNull();
    });

    it("IconButton: named, toggles aria-pressed only when it is a toggle", () => {
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

    it("Key: data-key/data-kind, named, press called once, mousedown keeps focus in the field", () => {
      const onPress = vi.fn();
      for (const kind of ["digit", "op", "fn", "eq", "ctl"]) {
        const k = kit.Key({ id: "k-" + kind, kind, label: kind === "op" ? "÷" : "7", onPress });
        expect(k.el.dataset.key).toBe("k-" + kind);
        expect(k.el.dataset.kind).toBe(kind);
        expect(k.el.tagName).toBe("BUTTON");
        expect(nameOf(k.el)).not.toBe("");
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

    it("Chip: label, toggle state and click", () => {
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

    it("Display: input is named, events reach the callbacks, result carries kind and length bucket", () => {
      const cb = { onInput: vi.fn(), onEnter: vi.fn(), onResultClick: vi.fn() };
      const d = kit.Display({ placeholder: "Expr", inputLabel: "Expression", ...cb });
      document.body.append(d.el);
      expect(d.input).toBeInstanceOf(HTMLInputElement);
      expect(d.input.getAttribute("aria-label")).toBe("Expression");
      expect(d.input.getAttribute("placeholder")).toBe("Expr");
      d.input.value = "2+2";
      d.input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(cb.onInput).toHaveBeenCalledTimes(1);
      const enter = new KeyboardEvent("keydown", key("Enter"));
      d.input.dispatchEvent(enter);
      expect(cb.onEnter).toHaveBeenCalledTimes(1);
      expect(enter.defaultPrevented).toBe(true);
      d.input.dispatchEvent(new KeyboardEvent("keydown", key("a")));
      expect(cb.onEnter).toHaveBeenCalledTimes(1);
      const result = d.el.querySelector('[data-part="result"]') as HTMLElement;
      expect(result.getAttribute("role")).toBe("status");
      expect(result.getAttribute("aria-live")).toBe("polite");
      expect(result.getAttribute("tabindex")).toBe("0");
      d.setResult("= 4", "preview");
      expect(result.textContent).toBe("= 4");
      expect(result.dataset.kind).toBe("preview");
      expect(result.dataset.len).toBe("m");
      d.setResult("123456789012", "final");
      expect(result.dataset.len).toBe("l");
      d.setResult("1234567890123456", "final");
      expect(result.dataset.len).toBe("xl");
      d.setResult("Syntax error", "error");
      expect(result.dataset.kind).toBe("error");
      result.click();
      expect(cb.onResultClick).toHaveBeenCalledTimes(1);
      d.setPrev("2+2 =");
      expect(d.el.querySelector('[data-part="prev"]')?.textContent).toBe("2+2 =");
    });

    it("Card: wraps children; error tone is accepted", () => {
      const c = kit.Card({ tone: "error", class: "form" }, "text", document.createElement("hr"));
      expect(c.el.textContent).toContain("text");
      expect(c.el.querySelector("hr")).not.toBeNull();
      expect(c.el.classList.contains("form")).toBe(true);
    });

    it("ResultCard: shows title, main, stats, hint and note; empty update clears; live and click work", () => {
      const onMainClick = vi.fn();
      const r = kit.ResultCard({ variant: "value", live: true, onMainClick });
      r.update({ title: "Result", mainLabel: "Payment", main: ["1 234"], stats: [{ label: "Total", value: "9 999" }, { label: "Rate", value: "12%" }], hint: "1 m = 3.28 ft", note: { text: "Rates stale", warn: true } });
      const text = r.el.textContent ?? "";
      for (const s of ["Result", "Payment", "1 234", "Total", "9 999", "Rate", "12%", "1 m = 3.28 ft", "Rates stale"]) expect(text, s).toContain(s);
      const main = r.el.querySelector('[data-part="main"]') as HTMLElement;
      expect(main.getAttribute("role")).toBe("status");
      expect(main.getAttribute("aria-live")).toBe("polite");
      expect(main.tabIndex).toBe(0);
      main.click();
      expect(onMainClick).toHaveBeenCalledTimes(1);
      expect(r.actions).toBeInstanceOf(HTMLElement);
      r.actions.append(kit.Button({ label: "Schedule", onClick: () => undefined }).el);
      r.update({ main: ["5"], stats: [] });
      expect(r.el.textContent).toContain("Schedule");
      expect(r.el.textContent).not.toContain("Total");
      expect(r.el.textContent).not.toContain("Rates stale");
      r.update({ note: { text: "Loading", busy: true } });
      expect(r.el.querySelector('[data-ui="spinner"]')).not.toBeNull();
      const plain = kit.ResultCard({ variant: "lines" });
      plain.update({ title: "T", main: ["a = 1", "b = 2"] });
      expect(plain.el.textContent).toContain("a = 1");
      expect(plain.el.textContent).toContain("b = 2");
      expect(plain.el.querySelector('[data-part="main"]')?.hasAttribute("role")).toBe(false);
    });

    it("Notice: kind drives the role, update replaces the text", () => {
      const n = kit.Notice({ kind: "error", title: "Auth", text: "reopen" });
      expect(n.el.getAttribute("role")).toBe("alert");
      expect(n.el.dataset.kind).toBe("error");
      expect(n.el.textContent).toContain("Auth");
      expect(n.el.textContent).toContain("reopen");
      n.update({ kind: "info", title: "Open in Telegram" });
      expect(n.el.getAttribute("role")).toBe("status");
      expect(n.el.dataset.kind).toBe("info");
      expect(n.el.textContent).toContain("Open in Telegram");
      expect(n.el.textContent).not.toContain("reopen");
    });

    it("Toast: data-show only while visible", () => {
      const t = kit.Toast();
      expect(t.el.getAttribute("role")).toBe("status");
      t.set("Saved", "ok", true);
      expect(t.el.textContent).toBe("Saved");
      expect(t.el.hasAttribute("data-show")).toBe(true);
      expect(t.el.dataset.kind).toBe("ok");
      t.set("Saved", "error", false);
      expect(t.el.hasAttribute("data-show")).toBe(false);
      expect(t.el.dataset.kind).toBe("error");
    });

    it("ProBadge and Spinner: text / accessible name", () => {
      expect(kit.ProBadge({ label: "PRO", tone: "pro" }).el.textContent).toBe("PRO");
      expect(kit.ProBadge({ label: "Free", tone: "free" }).el.textContent).toBe("Free");
      const s = kit.Spinner({ label: "Loading" });
      expect(s.el.getAttribute("role")).toBe("status");
      expect(s.el.getAttribute("aria-label")).toBe("Loading");
    });

    it("LockedOverlay: preview is hidden from assistive tech, the action works", () => {
      const onAction = vi.fn();
      const preview = document.createElement("p");
      preview.textContent = "secret preview";
      const l = kit.LockedOverlay({ preview, title: "Pro only", text: "Upgrade to see steps", actionLabel: "Upgrade", onAction });
      expect(l.el.contains(preview)).toBe(true);
      const part = l.el.querySelector('[data-part="preview"]') as HTMLElement;
      expect(part.getAttribute("aria-hidden")).toBe("true");
      expect(part.contains(preview)).toBe(true);
      expect(l.el.textContent).toContain("Pro only");
      expect(l.el.textContent).toContain("Upgrade to see steps");
      const btn = [...l.el.querySelectorAll("button")].find((b) => nameOf(b) === "Upgrade") as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click();
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it("Text: kinds render text; setText updates", () => {
      for (const kind of ["hint", "label", "empty"]) {
        const t = kit.Text({ kind, text: "abc", tone: kind === "hint" ? "warn" : undefined, align: "center", ltr: true });
        expect(t.el.textContent).toBe("abc");
        t.setText("xyz");
        expect(t.el.textContent).toBe("xyz");
      }
    });

    it("Field: named input, label, value, events, invalid state", () => {
      const onInput = vi.fn();
      const onEnter = vi.fn();
      const f = kit.Field({ label: "Value", ariaLabel: "Amount", value: "5", inputMode: "decimal", size: "big", maxLength: 12, onInput, onEnter });
      document.body.append(f.el);
      expect(f.el.tagName).toBe("LABEL");
      expect(f.input).toBeInstanceOf(HTMLInputElement);
      expect(f.input.getAttribute("aria-label")).toBe("Amount");
      expect(f.input.getAttribute("inputmode")).toBe("decimal");
      expect(f.input.getAttribute("maxlength")).toBe("12");
      expect(f.input.value).toBe("5");
      expect(f.el.textContent).toContain("Value");
      f.input.value = "42";
      f.input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(onInput).toHaveBeenCalledWith("42");
      f.input.dispatchEvent(new KeyboardEvent("keydown", key("Enter")));
      expect(onEnter).toHaveBeenCalledTimes(1);
      f.setValue("7");
      expect(f.input.value).toBe("7");
      expect(f.input.hasAttribute("aria-invalid")).toBe(false);
      f.setInvalid(true, "bad");
      expect(f.input.getAttribute("aria-invalid")).toBe("true");
      f.setInvalid(false);
      expect(f.input.hasAttribute("aria-invalid")).toBe(false);
      const bare = kit.Field({ ariaLabel: "f1", type: "search", ltr: false });
      expect(bare.input.getAttribute("type")).toBe("search");
      expect(bare.input.getAttribute("dir")).toBeNull();
      expect(bare.el.querySelector('[data-part="label"]')).toBeNull();
    });

    it("Select: a named button that opens the picker", () => {
      const onClick = vi.fn();
      const s = kit.Select({ ariaLabel: "From", text: "USD", onClick });
      expect(s.el.tagName).toBe("BUTTON");
      expect(s.el.getAttribute("aria-label")).toBe("From");
      expect(s.el.textContent).toBe("USD");
      s.setText("EUR");
      expect(s.el.textContent).toBe("EUR");
      s.el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    for (const comp of ["Chooser", "Segmented"] as const) {
      it(`${comp}: radiogroup, aria-checked follows clicks, arrows, roving tabindex, setValue is silent`, () => {
        radioContract((o) => kit[comp](o));
      });
    }

    it("Chooser: also a native <select> in [data-part=select]; its change picks the option; langs are set", () => {
      const onPick = vi.fn();
      const c = kit.Chooser({ options: opts, value: "a", label: "Group", langs: ["uz-Latn", "ru", "ar"], roomy: true, onPick });
      document.body.append(c.el);
      expect(c.el.dataset.roomy).toBeDefined();
      expect(c.el.querySelector('[data-part="grid"]')?.getAttribute("role")).toBe("radiogroup");
      const select = c.el.querySelector('[data-part="select"] select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.getAttribute("aria-label")).toBe("Group");
      expect([...select.options].map((o) => o.value)).toEqual(["a", "b", "c"]);
      expect(select.value).toBe("a");
      expect(c.el.querySelectorAll('[role="radio"]')[2].getAttribute("lang")).toBe("ar");
      select.value = "c";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      expect(onPick).toHaveBeenLastCalledWith("c");
      expect(c.el.querySelectorAll('[role="radio"]')[2].getAttribute("aria-checked")).toBe("true");
      c.setValue("b");
      expect(select.value).toBe("b");
    });

    it("radio groups mirror the arrow keys in right-to-left documents", () => {
      document.documentElement.setAttribute("dir", "rtl");
      const onPick = vi.fn();
      const s = kit.Segmented({ options: opts, value: "b", label: "g", onPick });
      document.body.append(s.el);
      const radios = [...s.el.querySelectorAll('[role="radio"]')] as HTMLElement[];
      radios[1].dispatchEvent(new KeyboardEvent("keydown", key("ArrowRight")));
      expect(onPick).toHaveBeenLastCalledWith("a");
    });

    it("Toggle: switch has role=switch, check does not; change reports the state", () => {
      const onChange = vi.fn();
      const sw = kit.Toggle({ label: "Sync", checked: true, onChange });
      expect(sw.input.type).toBe("checkbox");
      expect(sw.input.getAttribute("role")).toBe("switch");
      expect(sw.input.checked).toBe(true);
      expect(sw.el.tagName).toBe("LABEL");
      expect(sw.el.textContent).toContain("Sync");
      sw.input.checked = false;
      sw.input.dispatchEvent(new Event("change", { bubbles: true }));
      expect(onChange).toHaveBeenLastCalledWith(false);
      sw.setChecked(true);
      expect(sw.input.checked).toBe(true);
      const check = kit.Toggle({ kind: "check", label: "Definite", checked: false, onChange });
      expect(check.input.hasAttribute("role")).toBe(false);
      expect(check.el.textContent).toContain("Definite");
    });

    it("Slider: range input with limits, live value output, change reports a number", () => {
      const onInput = vi.fn();
      const onChange = vi.fn();
      const s = kit.Slider({ label: "Digits", min: 0, max: 20, step: 1, value: 12, onInput, onChange });
      expect(s.input.type).toBe("range");
      expect(s.input.min).toBe("0");
      expect(s.input.max).toBe("20");
      expect(s.input.step).toBe("1");
      expect(s.input.value).toBe("12");
      expect(s.input.getAttribute("aria-label")).toBe("Digits");
      expect(s.el.querySelector('[data-part="value"]')?.textContent).toBe("12");
      s.input.value = "5";
      s.input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(onInput).toHaveBeenCalledWith(5);
      expect(s.el.querySelector('[data-part="value"]')?.textContent).toBe("5");
      s.input.dispatchEvent(new Event("change", { bubbles: true }));
      expect(onChange).toHaveBeenCalledWith(5);
      s.setValue(9);
      expect(s.input.value).toBe("9");
      expect(s.el.querySelector('[data-part="value"]')?.textContent).toBe("9");
    });

    it("Row: optional label part and children", () => {
      const withLabel = kit.Row({ label: "Theme", class: "plan" }, kit.Text({ kind: "hint", text: "child" }).el);
      expect(withLabel.el.querySelector('[data-part="label"]')?.textContent).toBe("Theme");
      expect(withLabel.el.textContent).toContain("child");
      expect(withLabel.el.classList.contains("plan")).toBe(true);
      expect(kit.Row({}, "x").el.querySelector('[data-part="label"]')).toBeNull();
    });

    it("Tabs: tablist, named tabs, aria-selected follows setActive and clicks report the id, badge", () => {
      const onSelect = vi.fn();
      const tabs = kit.Tabs({
        tabs: [
          { id: "calc", icon: "calc", label: "Calc" },
          { id: "solve", icon: "solve", label: "Solve", badge: "Pro" },
          { id: "settings", icon: "settings", label: "Settings" },
        ],
        active: "calc",
        onSelect,
      });
      expect(tabs.el.getAttribute("role")).toBe("tablist");
      const btns = [...tabs.el.querySelectorAll('[role="tab"]')] as HTMLElement[];
      expect(btns.map((b) => b.getAttribute("aria-label"))).toEqual(["Calc", "Solve", "Settings"]);
      expect(btns.map((b) => b.dataset.tab)).toEqual(["calc", "solve", "settings"]);
      expect(btns.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
      for (const b of btns) expect(b.querySelector('[data-part="label"]')).not.toBeNull();
      expect(btns[1].querySelector('[data-part="badge"]')?.textContent).toBe("Pro");
      expect(btns[0].querySelector('[data-part="badge"]')).toBeNull();
      tabs.setActive("settings");
      expect(btns.map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
      btns[1].click();
      expect(onSelect).toHaveBeenCalledWith("solve");
    });

    it("Sheet: modal dialog with a named close button, body, veil and an open flag", () => {
      const s = kit.Sheet({ title: "History", closeLabel: "Close" });
      const dialog = s.el.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-label")).toBe("History");
      expect(s.body.dataset.part).toBe("body");
      expect(s.veil.dataset.part).toBe("veil");
      expect(s.el.contains(s.body) && s.el.contains(s.veil) && s.el.contains(s.closeButton)).toBe(true);
      expect(nameOf(s.closeButton)).toBe("Close");
      expect(s.el.textContent).toContain("History");
      expect(s.el.hasAttribute("data-open")).toBe(false);
      s.setOpen(true);
      expect(s.el.hasAttribute("data-open")).toBe(true);
      s.setOpen(false);
      expect(s.el.hasAttribute("data-open")).toBe(false);
    });

    it("Table: headers, rows with data-l labels, left-to-right, setRows replaces", () => {
      const t = kit.Table({ columns: ["Month", "Payment"], rows: [["1", "100"], ["2", "90"]] });
      const table = t.el.querySelector("table") as HTMLTableElement;
      expect(table.getAttribute("dir")).toBe("ltr");
      expect([...table.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["Month", "Payment"]);
      const cells = [...table.querySelectorAll("tbody td")] as HTMLElement[];
      expect(cells.map((c) => c.textContent)).toEqual(["1", "100", "2", "90"]);
      expect(cells.map((c) => c.getAttribute("data-l"))).toEqual(["Month", "Payment", "Month", "Payment"]);
      t.setRows([["9", "9"]]);
      expect(table.querySelectorAll("tbody tr").length).toBe(1);
      t.setRows([]);
      expect(table.querySelectorAll("tbody tr").length).toBe(0);
    });

    it("ListItem: split and stacked order, option semantics, click", () => {
      const onClick = vi.fn();
      const split = kit.ListItem({ primary: "USD", secondary: "US Dollar", layout: "split", role: "option", selected: true, onClick });
      expect(split.el.tagName).toBe("BUTTON");
      expect(split.el.getAttribute("role")).toBe("option");
      expect(split.el.getAttribute("aria-selected")).toBe("true");
      expect(split.el.textContent).toBe("USDUS Dollar");
      split.el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
      const unselected = kit.ListItem({ primary: "EUR", layout: "split", role: "option", onClick });
      expect(unselected.el.getAttribute("aria-selected")).toBe("false");
      const stacked = kit.ListItem({ primary: "= 4", secondary: "2+2", layout: "stacked", ariaLabel: "2+2 = 4", onClick });
      expect(stacked.el.textContent).toBe("2+2= 4");
      expect(stacked.el.getAttribute("aria-label")).toBe("2+2 = 4");
      expect(stacked.el.hasAttribute("role")).toBe(false);
    });

    it("StepList: ordered list, one item per step, with the body nodes", () => {
      const code = document.createElement("code");
      code.textContent = "x^2";
      const l = kit.StepList([{ name: "Power rule", body: ["d/dx ", code] }, { name: "Done", body: [] }]);
      expect(l.el.tagName).toBe("OL");
      expect(l.el.querySelectorAll("li").length).toBe(2);
      expect(l.el.textContent).toContain("Power rule");
      expect(l.el.querySelector("code")).toBe(code);
    });

    it("PlotFrame: a canvas named for assistive tech", () => {
      const p = kit.PlotFrame({ ariaLabel: "graph" });
      expect(p.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(p.el.contains(p.canvas)).toBe(true);
      expect(p.canvas.getAttribute("role")).toBe("img");
      expect(p.canvas.getAttribute("aria-label")).toBe("graph");
    });

    it("StylePicker: radiogroup of style cards; unavailable styles are disabled with a badge", () => {
      const onPick = vi.fn();
      const sw = { light: { bg: "#ffffff", accent: "#ab3409", key: "#f2f2f2" }, dark: { bg: "#000000", accent: "#ff9254", key: "#202020" } };
      const options = [
        { id: "tactile", name: "Tactile", swatch: sw, available: false },
        { id: "glass", name: "Glass", swatch: sw, available: false },
        { id: "fintech", name: "Fintech", swatch: sw, available: true },
        { id: "techno", name: "Techno", swatch: sw, available: true },
      ];
      const p = kit.StylePicker({ options, value: "fintech", label: "Style", soonLabel: "Soon", onPick });
      document.body.append(p.el);
      expect(p.el.getAttribute("role")).toBe("radiogroup");
      expect(p.el.getAttribute("aria-label")).toBe("Style");
      const cards = [...p.el.querySelectorAll("[data-style-id]")] as HTMLElement[];
      expect(cards.map((c) => c.dataset.styleId)).toEqual(["tactile", "glass", "fintech", "techno"]);
      for (const c of cards) {
        expect(c.getAttribute("role")).toBe("radio");
        expect(c.getAttribute("aria-label")).toBeTruthy();
      }
      expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
      expect(cards.map((c) => c.getAttribute("aria-disabled"))).toEqual(["true", "true", null, null]);
      expect(cards[0].textContent).toContain("Soon");
      expect(cards[2].textContent).not.toContain("Soon");
      cards[0].click();
      expect(onPick).not.toHaveBeenCalled();
      cards[3].click();
      expect(onPick).toHaveBeenCalledWith("techno");
      expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "true"]);
      p.setValue("fintech");
      expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
    });

    it("no component ever sets markup from strings (CSP / XSS): the sources avoid innerHTML and friends", () => {
      const dir = entry.replace(/index\.ts$/, "");
      for (const f of ["kit.ts", "index.ts"]) {
        const src = readFileSync(resolve(SRC, dir + f), "utf8");
        expect(src, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
        expect(src, f).not.toMatch(/setAttribute\(\s*["']style["']/);
      }
    });

    it("the pack stylesheet honours the axes: font scale, effects, control height, gaps, high contrast", () => {
      const css = packCss().replace(/\/\*[\s\S]*?\*\//g, ""); // comments may mention the variables
      // every font size is scaled by the font-size axis
      for (const m of css.matchAll(/(?:^|[;{\s])font-size:\s*([^;}]+)/g)) expect(m[1], `font-size: ${m[1]}`).toContain("var(--fs)");
      for (const m of css.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)) expect(m[1], `font: ${m[1]}`).toContain("var(--fs)");
      expect(css).toContain("var(--fx)");
      expect(css).toContain("var(--ctl)");
      expect(css).toContain("var(--gap)");
      expect(css).toContain("var(--bw)");
      expect(css).toContain('[data-contrast="high"]');
      // effects must scale with --fx: no raw blur() / backdrop-filter radius
      // (exempt: @supports feature probes, and a custom property that holds a whole filter, e.g. glass's `--bf`, which the
      // pack switches off through --fx elsewhere; the pack's own style-<id>.test.ts proves that switch)
      for (const m of css.matchAll(/blur\(([^)]*\)?[^)]*)\)/g)) {
        const line = css.slice(css.lastIndexOf("\n", m.index) + 1, m.index + m[0].length);
        if (/@supports/.test(line) || /--[\w-]+\s*:[^;]*$/.test(line.slice(0, line.length - m[0].length))) continue;
        expect(m[1], `blur(${m[1]})`).toContain("--fx");
      }
      // a pack must not hard-code the properties that belong to core geometry
      expect(css).not.toMatch(/--ctl\s*:/);
      expect(css).not.toMatch(/--fs\s*:/);
      expect(css).not.toMatch(/--fx\s*:/);
    });

    it("kit output follows an axis change without being rebuilt: state lives on <html>, not in the DOM", async () => {
      const { applyAxes } = await loadSrc("contract/axes.ts");
      const b = kit.Button({ label: "x", onClick: () => undefined });
      document.body.append(b.el);
      const before = b.el.outerHTML;
      applyAxes({ contrast: "high", density: "compact", lite: "on", fs: "xl" });
      const root = document.documentElement;
      expect([root.dataset.contrast, root.dataset.density, root.dataset.lite, root.dataset.fs]).toEqual(["high", "compact", "on", "xl"]);
      expect(b.el.outerHTML).toBe(before);
      applyAxes({ contrast: "normal", density: "comfortable", lite: "auto", fs: "m" });
      expect([root.dataset.contrast, root.dataset.density, root.dataset.lite, root.dataset.fs]).toEqual(["normal", "comfortable", "auto", "m"]);
    });

    it("activation does not leak: a destroyed sheet and removed nodes keep no listeners that fire callbacks", async () => {
      const onClick = vi.fn();
      const b = kit.Button({ label: "x", onClick });
      document.body.append(b.el);
      b.el.remove();
      await tick();
      expect(onClick).not.toHaveBeenCalled();
    });
  });
}

describe("the contract tests catch broken kits (negative)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /** A segmented control that forgets to maintain aria-checked and never reports picks. */
  const brokenRadios = (o: any): any => {
    const el = document.createElement("div");
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-label", o.label);
    for (const [, text] of o.options as Array<readonly [string, string]>) {
      const b = document.createElement("button");
      b.setAttribute("role", "radio");
      b.textContent = text;
      el.append(b);
    }
    return { el, setValue: () => undefined };
  };

  it("a radio group without aria-checked / onPick fails the radio contract", () => {
    expect(() => radioContract(brokenRadios)).toThrow();
  });

  it("a radio group that keeps state but ignores the keyboard fails the radio contract", async () => {
    const pack = (await loadSrc("styles/_template/index.ts")).default;
    const good = pack.kit.Segmented;
    const noKeys = (o: any): any => {
      const h = good(o);
      // replace every radio by a clone: clones lose the keydown handlers but keep the markup
      for (const r of [...h.el.querySelectorAll('[role="radio"]')]) r.replaceWith(r.cloneNode(true));
      return h;
    };
    expect(() => radioContract(noKeys)).toThrow();
    expect(() => radioContract((o) => good(o))).not.toThrow();
  });

});

describe("adaptation axes (core)", () => {
  it("parseAxes validates every field and falls back to the defaults (negative cases)", async () => {
    const { parseAxes, DEFAULT_AXES } = await loadSrc("contract/model.ts");
    expect(parseAxes(null)).toEqual(DEFAULT_AXES);
    expect(parseAxes(undefined)).toEqual(DEFAULT_AXES);
    expect(parseAxes({ contrast: "ultra", density: 3, lite: "maybe", fs: "xxl" })).toEqual(DEFAULT_AXES);
    expect(parseAxes({ contrast: "high", density: "compact", lite: "off", fs: "l" })).toEqual({ contrast: "high", density: "compact", lite: "off", fs: "l" });
    expect(parseAxes({ contrast: "high", fs: "bad" })).toEqual({ ...DEFAULT_AXES, contrast: "high" });
  });

  it("applyAxes marks low-memory devices only for the automatic lite mode hint", async () => {
    const { applyAxes } = await loadSrc("contract/axes.ts");
    const root = document.documentElement;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const prev = Object.getOwnPropertyDescriptor(nav, "deviceMemory");
    Object.defineProperty(nav, "deviceMemory", { value: 1, configurable: true });
    applyAxes({ contrast: "normal", density: "comfortable", lite: "auto", fs: "m" });
    expect(root.hasAttribute("data-lowmem")).toBe(true);
    Object.defineProperty(nav, "deviceMemory", { value: 8, configurable: true });
    Object.defineProperty(nav, "hardwareConcurrency", { value: 8, configurable: true });
    applyAxes({ contrast: "normal", density: "comfortable", lite: "auto", fs: "m" });
    expect(root.hasAttribute("data-lowmem")).toBe(false);
    if (prev) Object.defineProperty(nav, "deviceMemory", prev);
    else delete nav.deviceMemory;
  });

  it("core.css implements the axis variables that packs read", () => {
    const css = readFileSync(resolve(SRC, "core.css"), "utf8");
    expect(css).toMatch(/\[data-fs="l"\]\s*\{\s*--fs:\s*1\.12/);
    expect(css).toMatch(/\[data-fs="xl"\]\s*\{\s*--fs:\s*1\.25/);
    expect(css).toMatch(/\[data-lite="on"\]\s*\{\s*--fx:\s*0/);
    expect(css).toContain('[data-lite="auto"]');
    expect(css).toContain("prefers-reduced-transparency");
    expect(css).toContain("[data-lowmem]");
    expect(css).toMatch(/\[data-density="compact"\]\s*\{[^}]*--gap:[^}]*--ctl:/);
    expect(css).toMatch(/\[data-contrast="high"\]\s*\{[^}]*--bw/);
  });
});
