// Solve page (Pro): derivative, integral, equation, 2x2 system and step-by-step arithmetic, computed in the browser
// with the same symbolic modules as the bot. Lazy-loaded. Without Pro the result area is a blurred teaser and no
// computation runs.

import {
  definiteIntegral,
  derivative,
  explainArithmetic,
  integrate,
  solveEquation,
  solveSystem,
  stepLabel,
  type Failure,
  type Step,
} from "../../../../worker/src/calc/symbolic";
import { clear, h } from "../dom";
import { refreshMe } from "../session";
import { lsGet, lsSet, state, t } from "../state";
import { haptic } from "../tg";
import { proLock, segmented } from "../widgets";
import type { Page } from "./types";

type Mode = "derivative" | "integral" | "equation" | "system" | "arith";
const MODES: Mode[] = ["derivative", "integral", "equation", "system", "arith"];

const ERR_KEYS = {
  parse: "solve_err_parse",
  unsupported: "solve_err_unsupported",
  too_complex: "solve_err_complex",
  unknown_function: "solve_err_parse",
  div_zero: "err_div0",
  domain: "solve_err_domain",
  divergent: "solve_err_divergent",
  invalid: "solve_err_invalid",
} as const;

export function failText(f: Failure): string {
  return t(ERR_KEYS[f.error] ?? "solve_err_invalid");
}

/** Fills a step label template ({before} {after} {note}) with isolated math fragments. */
export function stepNodes(step: Step): Node[] {
  const lab = stepLabel(step.rule, state.lang);
  const code = (txt: string): HTMLElement => h("code", { class: "ltr", text: txt });
  const noteUsed = lab.tpl.includes("{note}");
  let tpl = lab.tpl;
  if (!step.note) tpl = tpl.replace(/\s*\(\{note\}\)/g, "").replace(/\{note\}/g, "");
  const out: Node[] = [];
  for (const part of tpl.split(/(\{before\}|\{after\}|\{note\})/)) {
    if (part === "{before}") out.push(code(step.before));
    else if (part === "{after}") out.push(code(step.after));
    else if (part === "{note}") out.push(code(step.note ?? ""));
    else if (part) out.push(document.createTextNode(part));
  }
  if (!noteUsed && step.note) out.push(h("div", { class: "step-note" }, code(step.note)));
  return out;
}

export function createSolvePage(): Page {
  const el = h("section", { class: "page solve", attrs: { "aria-label": "solve" } });
  let mode: Mode = lsGet<Mode>("solve-mode", "derivative");
  if (!MODES.includes(mode)) mode = "derivative";
  const vals: Record<string, string> = { expr: "x^2*sin(x)", eq: "x^2-5x+6=0", eq1: "2x+3y=7", eq2: "x-y=1", a: "0", b: "1", variable: "x", definite: "" };
  let out!: HTMLElement;

  function showFailure(f: Failure): void {
    clear(out);
    out.appendChild(h("div", { class: "card err", text: failText(f) }));
  }

  function showResult(title: string, main: string[], steps: Step[]): void {
    clear(out);
    out.appendChild(
      h(
        "div",
        { class: "card result-card" },
        h("div", { class: "lbl", text: title }),
        ...main.map((m) => h("div", { class: "res-line ltr", text: m })),
      ),
    );
    if (steps.length > 0) {
      out.appendChild(
        h(
          "div",
          { class: "card steps" },
          h("div", { class: "lbl", text: t("solve_steps") }),
          h(
            "ol",
            { class: "step-list" },
            steps.map((s) => h("li", null, h("div", { class: "step-name", text: stepLabel(s.rule, state.lang).name }), h("div", { class: "step-body" }, stepNodes(s)))),
          ),
        ),
      );
    }
  }

  function run(): void {
    haptic.tap();
    const v = (vals.variable || "x").slice(0, 1);
    const R = t("solve_result");
    switch (mode) {
      case "derivative": {
        const r = derivative(vals.expr, v);
        if (!r.ok) return showFailure(r);
        return showResult(R, [`d/d${v} = ${r.text}`], r.steps);
      }
      case "integral": {
        if (vals.definite === "1") {
          const r = definiteIntegral(vals.expr, vals.a, vals.b, v);
          if (!r.ok) return showFailure(r);
          const lines = [`∫[${vals.a}, ${vals.b}] = ${r.value}`];
          if (r.exactText) lines.push(`= ${r.exactText}`);
          return showResult(R, lines, r.steps);
        }
        const r = integrate(vals.expr, v);
        if (!r.ok) return showFailure(r);
        return showResult(R, [`∫ = ${r.text}`], r.steps);
      }
      case "equation": {
        const r = solveEquation(vals.eq, v);
        if (!r.ok) return showFailure(r);
        const lines = r.kind === "none" ? [t("solve_no_roots")] : r.kind === "all" ? [t("solve_all")] : [r.text];
        return showResult(R, lines, r.steps);
      }
      case "system": {
        const r = solveSystem([vals.eq1, vals.eq2]);
        if (!r.ok) return showFailure(r);
        const lines = r.kind === "unique" ? r.variables.map((n) => `${n} = ${r.texts[n]}`) : [t(r.kind === "none" ? "solve_no_roots" : "solve_infinite")];
        return showResult(R, lines, r.steps);
      }
      case "arith": {
        const r = explainArithmetic(vals.expr);
        if (!r.ok) return showFailure(r);
        return showResult(R, [`= ${r.result}`], r.steps);
      }
    }
  }

  function field(key: string, ph: string, inputMode = "text"): HTMLInputElement {
    const input = h("input", {
      class: "field ltr",
      attrs: { type: "text", inputmode: inputMode, dir: "ltr", autocomplete: "off", autocapitalize: "off", spellcheck: false, placeholder: ph, "aria-label": ph, maxlength: 200 },
      on: {
        input: () => {
          vals[key] = input.value;
        },
        keydown: (e) => {
          if (e.key === "Enter") run();
        },
      },
    });
    input.value = vals[key];
    return input;
  }

  function teaser(): HTMLElement {
    return h(
      "div",
      { class: "teaser" },
      h(
        "div",
        { class: "teaser-blur", attrs: { "aria-hidden": "true" } },
        h("div", { class: "card result-card" }, h("div", { class: "lbl", text: t("solve_result") }), h("div", { class: "res-line ltr", text: "d/dx = 2x·sin(x) + x²·cos(x)" })),
        h("div", { class: "card steps" }, h("div", { class: "lbl", text: t("solve_steps") }), h("div", { class: "step-body ltr", text: "(x²)′·sin(x) + x²·(sin(x))′ → 2x·sin(x) + x²·cos(x)" })),
      ),
      proLock(async () => {
        await refreshMe();
        render();
      }),
    );
  }

  function render(): void {
    clear(el);
    const modeOptions = MODES.map((m) => [m, t(`solve_${m}` as "solve_derivative")] as const);
    const tabs = segmented(modeOptions, mode, (m) => {
      mode = m;
      lsSet("solve-mode", m);
      render();
    });
    tabs.classList.add("scroll");
    el.appendChild(tabs);
    if (!state.isPro) {
      el.appendChild(teaser());
      return;
    }
    const form = h("div", { class: "card form" });
    if (mode === "derivative" || mode === "integral" || mode === "arith") {
      form.appendChild(field("expr", t("solve_expr_ph")));
    }
    if (mode === "equation") form.appendChild(field("eq", t("solve_eq_ph")));
    if (mode === "system") form.append(field("eq1", t("solve_eq1")), field("eq2", t("solve_eq2")));
    if (mode === "integral") {
      const def = h("input", { attrs: { type: "checkbox", id: "def-int" }, on: { change: () => { vals.definite = def.checked ? "1" : ""; render(); } } });
      def.checked = vals.definite === "1";
      form.appendChild(h("label", { class: "check" }, def, h("span", { text: t("solve_definite") })));
      if (vals.definite === "1") form.appendChild(h("div", { class: "grid2" }, field("a", t("solve_lower"), "decimal"), field("b", t("solve_upper"), "decimal")));
    }
    form.appendChild(h("button", { class: "btn primary wide", attrs: { type: "button" }, text: t("solve_go"), on: { click: run } }));
    out = h("div", { class: "solve-out", attrs: { "aria-live": "polite" } });
    el.append(form, out);
  }

  render();
  return {
    el,
    render,
    onShow: () => {
      // entitlement may have changed (purchase, refund): rebuild when the lock state differs from what is shown
      const locked = !!el.querySelector(".teaser");
      if (locked === state.isPro) render();
    },
  };
}
