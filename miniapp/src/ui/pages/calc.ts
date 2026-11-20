// Calculator page: expression editor with live preview, scientific strip, keypad and history sheet.

import type { Decimal } from "../../../../worker/src/calc/decimal";
import { applyKey, MAIN_PAD, runCalc, SCI_KEYS, type EditState, type KeyDef } from "../../lib/calc";
import { isolateLtr } from "../../lib/num";
import { isRtl } from "../../i18n";
import { h, icon, clear } from "../dom";
import { clearHistoryAll, pushHistory, saveSettings, syncHistory } from "../session";
import { prefs, state, t } from "../state";
import { haptic } from "../tg";
import { openSheet, toast } from "../widgets";
import type { Page } from "./types";

export function createCalcPage(): Page {
  const el = h("section", { class: "page calc", attrs: { "aria-label": "calculator" } });
  let ans: Decimal | null = null;
  let justEvaluated = false;
  let exprValue = "";
  let lastResult = "";
  let lastResultKind: "none" | "preview" | "final" | "error" = "none";
  let lastErrorText = "";
  let input!: HTMLInputElement;
  let resultEl!: HTMLElement;
  let prevEl!: HTMLElement;
  let angleBtn!: HTMLButtonElement;
  // short screens show either the scientific grid or the digit pad (CSS reads data-sci); tall ones show both
  let sciOn = false;

  const editState = (): EditState => ({ text: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length });

  function setEdit(s: EditState): void {
    input.value = s.text;
    exprValue = s.text;
    input.focus({ preventScroll: true });
    input.setSelectionRange(s.start, s.end);
    preview();
  }

  function showResult(text: string, kind: "preview" | "final" | "error"): void {
    resultEl.textContent = text;
    resultEl.dataset.kind = kind;
    // long results shrink instead of scrolling sideways
    resultEl.dataset.len = text.length > 15 ? "xl" : text.length > 11 ? "l" : "m";
    lastResultKind = kind;
    lastResult = kind === "error" ? "" : text;
    if (kind === "error") lastErrorText = text;
  }

  function preview(): void {
    const expr = input.value.trim();
    prevEl.textContent = "";
    if (expr === "") {
      showResult("", "preview");
      return;
    }
    const r = runCalc(expr, prefs(), ans);
    if (r.ok && r.text !== expr) showResult("= " + r.text, "preview");
    else showResult("", "preview");
  }

  function commit(): void {
    const expr = input.value.trim();
    if (expr === "") return;
    const r = runCalc(expr, prefs(), ans);
    if (!r.ok) {
      haptic.result("error");
      showResult(t(r.error.key, r.error.params), "error");
      return;
    }
    haptic.result("success");
    ans = r.value;
    prevEl.textContent = isRtl(state.lang) ? isolateLtr(expr) + " =" : expr + " =";
    showResult(r.text, "final");
    pushHistory(expr, r.text);
    input.value = r.raw;
    exprValue = r.raw;
    justEvaluated = true;
    input.setSelectionRange(r.raw.length, r.raw.length);
  }

  function press(key: KeyDef): void {
    haptic.tap();
    if (key.id === "eq") {
      commit();
      return;
    }
    let s = editState();
    // after "=", a digit/function/constant starts a new expression; an operator continues with the result
    if (justEvaluated && (key.kind === "digit" || key.kind === "fn" || key.kind === "const") && key.id !== "ac" && key.id !== "bs") {
      s = { text: "", start: 0, end: 0 };
    }
    justEvaluated = false;
    if (key.id === "ac") {
      prevEl.textContent = "";
      showResult("", "preview");
    }
    setEdit(applyKey(s, key));
  }

  function keyButton(k: KeyDef, extraClass = ""): HTMLButtonElement {
    return h("button", {
      class: `key k-${k.kind} k-${k.id}${extraClass ? " " + extraClass : ""}`,
      attrs: { type: "button", "aria-label": k.label },
      text: k.label,
      on: {
        mousedown: (e) => e.preventDefault(), // keep focus (and the caret) in the expression field
        click: () => press(k),
      },
    });
  }

  async function openHistory(): Promise<void> {
    const items = await syncHistory();
    openSheet(t("calc_history"), (body, close) => {
      const synced = state.keepHistory && state.mode === "telegram" && !state.authError;
      body.append(
        h(
          "div",
          { class: "hist-meta" },
          h("span", { text: t("calc_history_count", { n: items.length, max: state.historyLimit }) }),
          h("span", { class: "hint", text: synced ? "☁" : t("calc_history_local") }),
        ),
      );
      const list = h("div", { class: "hist-list" });
      if (items.length === 0) list.appendChild(h("div", { class: "empty", text: t("history_empty") }));
      for (const it of items) {
        list.appendChild(
          h(
            "button",
            {
              class: "hist-item",
              attrs: { type: "button", "aria-label": `${it.expr} = ${it.result}` },
              on: {
                click: () => {
                  haptic.select();
                  justEvaluated = false;
                  close();
                  setEdit({ text: it.expr, start: it.expr.length, end: it.expr.length });
                },
              },
            },
            h("span", { class: "hist-expr ltr", text: it.expr }),
            h("span", { class: "hist-res ltr", text: "= " + it.result }),
          ),
        );
      }
      body.appendChild(list);
      if (items.length > 0) {
        body.appendChild(
          h(
            "button",
            {
              class: "btn danger",
              attrs: { type: "button" },
              on: {
                click: () => {
                  clearHistoryAll();
                  toast(t("history_cleared"));
                  close();
                },
              },
            },
            icon("trash", 18),
            t("calc_clear_history"),
          ),
        );
      }
    });
  }

  function render(): void {
    clear(el);
    angleBtn = h("button", {
      class: "chip",
      attrs: { type: "button", "aria-label": t("set_angle") },
      text: state.angle === "deg" ? "DEG" : "RAD",
      on: {
        click: () => {
          haptic.select();
          void saveSettings({ angle: state.angle === "deg" ? "rad" : "deg" }).then(() => {
            angleBtn.textContent = state.angle === "deg" ? "DEG" : "RAD";
            preview();
          });
        },
      },
    });
    const kbd = h(
      "button",
      {
        class: "icon-btn",
        attrs: { type: "button", "aria-label": t("calc_keyboard"), "aria-pressed": "false" },
        on: {
          click: () => {
            const on = input.inputMode === "none";
            input.inputMode = on ? "text" : "none";
            kbd.setAttribute("aria-pressed", String(on));
            kbd.classList.toggle("on", on);
            input.focus();
          },
        },
      },
      icon("keyboard", 20),
    );
    const hist = h(
      "button",
      { class: "icon-btn", attrs: { type: "button", "aria-label": t("calc_history") }, on: { click: () => void openHistory() } },
      icon("history", 20),
    );
    input = h("input", {
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
        placeholder: t("calc_placeholder"),
        "aria-label": t("calc_placeholder"),
        maxlength: 500,
      },
      on: {
        input: () => {
          justEvaluated = false;
          exprValue = input.value;
          preview();
        },
        keydown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        },
      },
    });
    input.value = exprValue;
    prevEl = h("div", { class: "prev ltr", attrs: { "aria-hidden": "true" } });
    resultEl = h("div", {
      class: "result ltr",
      attrs: { role: "status", "aria-live": "polite", tabindex: 0 },
      on: {
        click: () => {
          if (lastResultKind !== "final" || !lastResult) return;
          void navigator.clipboard?.writeText(lastResult).then(() => toast(t("copied")), () => undefined);
        },
      },
    });
    const sciToggle = h(
      "button",
      {
        class: "chip sci-toggle",
        attrs: { type: "button", "aria-label": t("calc_sci"), "aria-pressed": String(sciOn) },
        text: "ƒ(x)",
        on: {
          mousedown: (e) => e.preventDefault(),
          click: () => setSci(!sciOn),
        },
      },
    );
    const backKey = h("button", {
      class: "key k-ctl sci-back",
      attrs: { type: "button", "aria-label": "123" },
      text: "123",
      on: { mousedown: (e) => e.preventDefault(), click: () => setSci(false) },
    });
    const extra = MAIN_PAD.filter((k) => k.id === "ac" || k.id === "bs" || k.id === "eq").map((k) => keyButton(k, "sci-extra"));
    const sci = h("div", { class: "sci", attrs: { role: "group", "aria-label": t("calc_sci") } }, SCI_KEYS.map((k) => keyButton(k)), backKey, extra);
    const pad = h("div", { class: "keypad", attrs: { role: "group" } }, MAIN_PAD.map((k) => keyButton(k)));
    function setSci(on: boolean): void {
      sciOn = on;
      el.dataset.sci = on ? "on" : "off";
      sciToggle.setAttribute("aria-pressed", String(on));
      sciToggle.classList.toggle("on", on);
      haptic.select();
    }
    el.dataset.sci = sciOn ? "on" : "off";
    sciToggle.classList.toggle("on", sciOn);
    el.append(
      h("div", { class: "calc-bar" }, hist, h("div", { class: "grow" }), sciToggle, angleBtn, kbd),
      h("div", { class: "display" }, prevEl, input, resultEl),
      sci,
      pad,
    );
    if (lastResultKind === "final" || lastResultKind === "error") showResult(lastResultKind === "error" ? lastErrorText : lastResult, lastResultKind);
    else preview();
  }

  render();
  return { el, render };
}
