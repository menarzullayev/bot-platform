// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// The headless core renders every page through ctx.kit. These smoke tests run the real pages against the fintech pack
// and the template pack: behaviour must be identical whichever kit draws it, and a style switch must re-draw.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSrc } from "./dom-src";

vi.mock("../../../miniapp/src/styles/fintech/pack.css?url", () => ({ default: "/app/pack-fintech.css" }));
vi.mock("../../../miniapp/src/styles/_template/pack.css?url", () => ({ default: "/app/pack-template.css" }));

interface Env {
  reg: any;
  ctx: { readonly kit: any };
  state: any;
  mods: Record<string, any>;
}

async function boot(entry = "styles/fintech/index.ts"): Promise<Env> {
  window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  vi.resetModules();
  localStorage.clear();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const reg = await loadSrc("styles/registry.ts");
  const pack = (await loadSrc(entry)).default;
  await reg.applyStyle(pack);
  const state = (await loadSrc("ui/state.ts")).state;
  const ctx = {
    get kit() {
      return reg.currentKit();
    },
  };
  const mods = {
    calc: await loadSrc("ui/pages/calc.ts"),
    convert: await loadSrc("ui/pages/convert.ts"),
    finance: await loadSrc("ui/pages/finance.ts"),
    settings: await loadSrc("ui/pages/settings.ts"),
    solve: await loadSrc("ui/pages/solve.ts"),
    graph: await loadSrc("ui/pages/graph.ts"),
    session: await loadSrc("ui/session.ts"),
  };
  return { reg, ctx, state, mods };
}

const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector(sel) as HTMLElement;
const qa = (root: ParentNode, sel: string): HTMLElement[] => [...root.querySelectorAll(sel)] as HTMLElement[];
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const press = (page: HTMLElement, id: string): void => q(page, `[data-key="${id}"]:not(.sci-extra)`).click();

for (const [name, entry] of [["fintech", "styles/fintech/index.ts"], ["template", "styles/_template/index.ts"]] as const) {
  describe(`pages through the ${name} kit`, () => {
    let env: Env;
    beforeEach(async () => {
      env = await boot(entry);
    });

    it("calculator: keypad, live preview, = evaluates, AC clears, angle chip, history sheet", async () => {
      const page = env.mods.calc.createCalcPage(env.ctx);
      document.body.append(page.el);
      expect(qa(page.el, '.keypad [data-ui="key"]').length).toBe(20);
      expect(qa(page.el, '.sci [data-ui="key"]').length).toBeGreaterThanOrEqual(20);
      const input = q(page.el, '[data-part="input"]') as HTMLInputElement;
      const result = q(page.el, '[data-part="result"]');
      for (const id of ["2", "add", "3"]) press(page.el, id);
      expect(input.value).toBe("2+3");
      expect(result.textContent).toBe("= 5");
      expect(result.dataset.kind).toBe("preview");
      press(page.el, "eq");
      expect(result.textContent).toBe("5");
      expect(result.dataset.kind).toBe("final");
      expect(q(page.el, '[data-part="prev"]').textContent).toBe("2+3 =");
      expect(input.value).toBe("5");
      press(page.el, "mul");
      press(page.el, "4");
      press(page.el, "eq");
      expect(result.textContent).toBe("20");
      // syntax error is reported in the result line
      press(page.el, "ac");
      expect(input.value).toBe("");
      press(page.el, "mul");
      press(page.el, "eq");
      expect(result.dataset.kind).toBe("error");
      // angle chip toggles DEG/RAD
      const chip = qa(page.el, '[data-ui="chip"]').find((c) => c.textContent === "DEG") as HTMLElement;
      chip.click();
      await flush();
      expect(env.state.angle).toBe("rad");
      expect(chip.textContent).toBe("RAD");
      // the keyboard toggle is a pressed toggle
      const kbd = qa(page.el, '[data-ui="icon-button"]').find((b) => b.getAttribute("aria-pressed") !== null) as HTMLElement;
      expect(kbd.getAttribute("aria-pressed")).toBe("false");
      kbd.click();
      expect(kbd.getAttribute("aria-pressed")).toBe("true");
      expect(input.inputMode).toBe("text");
      // history opens in a sheet and lists the evaluated expressions
      const hist = qa(page.el, '[data-ui="icon-button"]').find((b) => b.getAttribute("aria-label")?.length && b.getAttribute("aria-pressed") === null) as HTMLElement;
      hist.click();
      await flush();
      const sheet = q(document, '[data-ui="sheet"]');
      expect(sheet).toBeTruthy();
      const items = qa(sheet, '[data-ui="list-item"]');
      expect(items.length).toBe(2);
      expect(items[0].getAttribute("aria-label")).toBe("5*4 = 20");
      items[1].click();
      expect(input.value).toBe("2+3");
    });

    it("calculator: the scientific toggle flips data-sci and aria-pressed", () => {
      const page = env.mods.calc.createCalcPage(env.ctx);
      expect(page.el.dataset.sci).toBe("off");
      const toggle = q(page.el, ".sci-toggle");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      toggle.click();
      expect(page.el.dataset.sci).toBe("on");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      q(page.el, ".sci-back").click();
      expect(page.el.dataset.sci).toBe("off");
    });

    it("converter: live result, swap, searchable picker, category chooser, currency status line", async () => {
      const page = env.mods.convert.createConvertPage(env.ctx);
      document.body.append(page.el);
      const main = q(page.el, '[data-ui="result-card"] [data-part="main"]');
      const value = q(page.el, '[data-ui="field"] input') as HTMLInputElement;
      expect(main.textContent).not.toBe("—");
      value.value = "3";
      value.dispatchEvent(new Event("input", { bubbles: true }));
      const first = main.textContent;
      expect(first).not.toBe("—");
      const selects = qa(page.el, '[data-ui="select"]');
      const [from, to] = selects.map((s) => s.textContent);
      q(page.el, '[data-ui="icon-button"]').click(); // swap
      expect(selects.map((s) => s.textContent)).toEqual([to, from]);
      expect(main.textContent).not.toBe(first);
      // picker: search and choose
      selects[0].click();
      const sheet = q(document, '[data-ui="sheet"]');
      const search = q(sheet, '[data-ui="field"] input') as HTMLInputElement;
      expect(search.getAttribute("type")).toBe("search");
      const options = qa(sheet, '[role="option"]');
      expect(options.length).toBeGreaterThan(3);
      expect(options.filter((o) => o.getAttribute("aria-selected") === "true").length).toBe(1);
      search.value = "km";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const found = qa(sheet, '[role="option"]');
      expect(found.length).toBeGreaterThan(0);
      expect(found.length).toBeLessThan(options.length);
      found[0].click();
      expect(selects[0].textContent).toBe("km");
      // category chooser switches to currencies: no rates offline -> a status line
      const chips = qa(page.el, '[data-ui="chooser"] [role="radio"]');
      const currency = chips.find((c) => /currenc|valyuta|валют/i.test(c.textContent ?? "")) ?? chips[chips.length - 1];
      currency.click();
      await flush();
      expect(q(page.el, '[data-ui="result-card"] [data-part="note"]').textContent?.length).toBeGreaterThan(0);
    });

    it("finance: loan result with stats and a schedule button, errors are a Notice, the tool chooser re-renders", () => {
      const page = env.mods.finance.createFinancePage(env.ctx);
      document.body.append(page.el);
      const card = q(page.el, '[data-ui="result-card"]');
      expect(card).toBeTruthy();
      expect(q(card, '[data-part="main"]').textContent).toMatch(/\d/);
      expect(qa(card, '[data-part="cells"] > *').length).toBeGreaterThan(1);
      const sched = q(card, ".sched-btn");
      expect(sched).toBeTruthy();
      sched.click();
      const sheet = q(document, '[data-ui="sheet"]');
      expect(qa(sheet, "tbody tr").length).toBeGreaterThan(5);
      expect(qa(sheet, "th").length).toBe(5);
      // an invalid field turns the result into an error notice
      const field = q(page.el, '.fgrid [data-ui="field"] input') as HTMLInputElement;
      field.value = "abc";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      expect(q(page.el, '.fin-out [data-ui="notice"]')?.dataset.kind).toBe("error");
      expect(q(page.el, '.fin-out [data-ui="result-card"]')).toBeNull();
      // another tool
      const radios = qa(page.el, '[data-ui="chooser"] [role="radio"]');
      radios[1].click();
      expect(qa(page.el, '[data-ui="chooser"] [role="radio"]')[1].getAttribute("aria-checked")).toBe("true");
      expect(q(page.el, ".fin-out")).toBeTruthy();
    });

    it("settings: style picker with unavailable styles disabled, axes apply to state, every control is named", async () => {
      env.reg.setStyleLoader("tactile", null);
      env.reg.setStyleLoader("glass", null);
      env.reg.setStyleLoader("techno", null);
      const page = env.mods.settings.createSettingsPage(env.ctx, () => undefined);
      document.body.append(page.el);
      const cards = qa(page.el, '[data-ui="style-picker"] [data-style-id]');
      expect(cards.map((c) => c.dataset.styleId)).toEqual(["tactile", "glass", "fintech", "techno"]);
      expect(cards.map((c) => c.getAttribute("aria-disabled"))).toEqual(["true", "true", null, "true"]);
      // the preference is tactile (default) which is not available: the shown selection is the fallback
      expect(env.state.style).toBe("tactile");
      expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
      cards[0].click();
      await flush();
      expect(env.state.style).toBe("tactile"); // disabled: nothing changed
      cards[2].click();
      await flush();
      expect(env.state.style).toBe("fintech");
      // axes
      // labels are translated, so the groups are found by their order: angle, theme, contrast, density, lite, font size
      const groups = qa(page.el, '[data-ui="segmented"]');
      const labels = groups.map((g) => g.getAttribute("aria-label"));
      expect(labels.length).toBeGreaterThanOrEqual(6); // angle, theme, contrast, density, lite, font size
      const contrast = qa(groups[2], '[role="radio"]');
      const density = qa(groups[3], '[role="radio"]');
      const lite = qa(groups[4], '[role="radio"]');
      const fs = qa(groups[5], '[role="radio"]');
      expect(fs.map((b) => b.textContent)).toEqual(["A", "A+", "A++"]);
      contrast[1].click();
      density[1].click();
      lite[1].click();
      fs[2].click();
      await flush();
      expect([env.state.contrast, env.state.density, env.state.lite, env.state.fs]).toEqual(["high", "compact", "on", "xl"]);
      const stored = JSON.parse(localStorage.getItem("tc:prefs") as string);
      expect([stored.contrast, stored.density, stored.lite, stored.fs, stored.style]).toEqual(["high", "compact", "on", "xl", "fintech"]);
      // the Pro plan row shows the upgrade button for a free user
      expect(qa(page.el, '[data-ui="pro-badge"]').length).toBe(1);
      // every interactive element has a name
      for (const el of qa(page.el, "button, input, select")) {
        const named = el.getAttribute("aria-label") || el.textContent?.trim() || el.closest("label")?.textContent?.trim();
        expect(named, el.outerHTML.slice(0, 80)).toBeTruthy();
      }
    });

    it("solve (Pro): a free user sees the locked overlay, a Pro user gets derivative result and steps", async () => {
      const page = env.mods.solve.createSolvePage(env.ctx);
      document.body.append(page.el);
      expect(q(page.el, '[data-ui="locked-overlay"]')).toBeTruthy();
      expect(q(page.el, '[data-ui="locked-overlay"] [data-part="preview"]').getAttribute("aria-hidden")).toBe("true");
      expect(q(page.el, '[data-ui="field"]')).toBeNull();
      env.state.isPro = true;
      page.onShow();
      expect(q(page.el, '[data-ui="locked-overlay"]')).toBeNull();
      const go = qa(page.el, '[data-ui="button"]').find((b) => b.dataset.variant === "primary") as HTMLElement;
      go.click();
      const out = q(page.el, ".solve-out");
      expect(q(out, '[data-ui="result-card"]').textContent).toContain("d/dx");
      expect(qa(out, '[data-ui="step-list"] li').length).toBeGreaterThan(0);
      // invalid input -> an error notice
      const expr = q(page.el, '[data-ui="field"] input') as HTMLInputElement;
      expr.value = "((";
      expr.dispatchEvent(new Event("input", { bubbles: true }));
      go.click();
      expect(q(out, '[data-ui="notice"]').dataset.kind).toBe("error");
    });

    it("graph: function rows, adding a row, invalid input is flagged, the plot canvas exists", async () => {
      const page = env.mods.graph.createGraphPage(env.ctx);
      document.body.append(page.el);
      expect(q(page.el, '[data-ui="plot-frame"] canvas')).toBeTruthy();
      expect(qa(page.el, ".fn-row").length).toBe(1);
      const add = qa(page.el, '.graph-tools [data-ui="button"]')[0];
      add.click();
      expect(qa(page.el, ".fn-row").length).toBe(2);
      const second = qa(page.el, ".fn-row")[1];
      const input = q(second, "input") as HTMLInputElement;
      input.value = "2*(";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(input.getAttribute("aria-invalid")).toBe("true");
      input.value = "x^2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(input.hasAttribute("aria-invalid")).toBe(false);
      // remove buttons appear with two rows and delete a row
      qa(page.el, ".fn-row")[1].querySelector('[data-ui="icon-button"]').click();
      expect(qa(page.el, ".fn-row").length).toBe(1);
      // the value table opens in a sheet
      qa(page.el, '.graph-tools [data-ui="button"]')[1].click();
      const sheet = q(document, '[data-ui="sheet"]');
      expect(qa(sheet, "tbody tr").length).toBeGreaterThan(5);
      expect(qa(sheet, "th").map((t) => t.textContent)).toEqual(["x", "f(x)"]);
    });
  });
}

describe("a style switch re-draws the pages with the new kit", () => {
  it("calling render() after applyStyle replaces every component by the new kit's markup", async () => {
    const env = await boot("styles/fintech/index.ts");
    const page = env.mods.calc.createCalcPage(env.ctx);
    document.body.append(page.el);
    const before = q(page.el, '[data-key="7"]');
    expect(before.classList.contains("key")).toBe(true); // fintech markup
    const template = (await loadSrc("styles/_template/index.ts")).default;
    await env.reg.applyStyle(template);
    page.render();
    const after = q(page.el, '[data-key="7"]');
    expect(after).not.toBe(before);
    expect(before.isConnected).toBe(false);
    expect(after.classList.contains("key")).toBe(false); // template markup
    expect(qa(page.el, '[data-ui="key"]').length).toBe(44); // 20 pad + 20 scientific + "123" + 3 extras
    // behaviour is the same
    q(page.el, '[data-key="7"]:not(.sci-extra)').click();
    expect((q(page.el, '[data-part="input"]') as HTMLInputElement).value).toBe("7");
  });

  it("the calculator keeps its expression when the style changes mid-edit", async () => {
    const env = await boot("styles/fintech/index.ts");
    const page = env.mods.calc.createCalcPage(env.ctx);
    for (const id of ["1", "2", "add", "3"]) q(page.el, `[data-key="${id}"]:not(.sci-extra)`).click();
    await env.reg.applyStyle((await loadSrc("styles/_template/index.ts")).default);
    page.render();
    expect((q(page.el, '[data-part="input"]') as HTMLInputElement).value).toBe("12+3");
    expect(q(page.el, '[data-part="result"]').textContent).toBe("= 15");
  });
});
