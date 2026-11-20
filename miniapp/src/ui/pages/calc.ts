// Calculator page: expression editor with live preview, scientific strip, keypad and history sheet.
// All visuals come from ctx.kit; this file owns state and behaviour only.

import type { Decimal } from "../../../../worker/src/calc/decimal";
import { applyKey, MAIN_PAD, runCalc, SCI_KEYS, type EditState, type KeyDef } from "../../lib/calc";
import { isolateLtr } from "../../lib/num";
import { isRtl } from "../../i18n";
import type { ChipHandle, DisplayHandle, IconButtonHandle, KeyKind, ResultKind } from "../../contract/types";
import { clear, h } from "../dom";
import { openSheet, toast } from "../overlays";
import { clearHistoryAll, pushHistory, saveSettings, syncHistory } from "../session";
import { runShare, shareAvailable } from "../share";
import { prefs, state, t } from "../state";
import { haptic } from "../tg";
import type { Page, PageCtx } from "./types";

const keyKind = (k: KeyDef): KeyKind => (k.id === "eq" ? "eq" : k.kind === "const" ? "fn" : k.kind);

export function createCalcPage(ctx: PageCtx): Page {
  const el = h("section", { class: "page calc", attrs: { "aria-label": "calculator" } });
  let ans: Decimal | null = null;
  let justEvaluated = false;
  let exprValue = "";
  let lastResult = "";
  let lastResultKind: ResultKind = "none";
  let lastErrorText = "";
  let lastExpr = "";
  let shareBtn: IconButtonHandle | null = null;
  let display!: DisplayHandle;
  let angleChip!: ChipHandle;
  // short screens show either the scientific grid or the digit pad (CSS reads data-sci); tall ones show both
  let sciOn = false;

  const editState = (): EditState => {
    const input = display.input;
    return { text: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length };
  };

  function setEdit(s: EditState): void {
    const input = display.input;
    input.value = s.text;
    exprValue = s.text;
    input.focus({ preventScroll: true });
    input.setSelectionRange(s.start, s.end);
    preview();
  }

  function showResult(text: string, kind: "preview" | "final" | "error"): void {
    display.setResult(text, kind);
    lastResultKind = kind;
    lastResult = kind === "error" ? "" : text;
    if (kind === "error") lastErrorText = text;
    // the share button appears only next to a finished result
    if (shareBtn) shareBtn.el.hidden = !(kind === "final" && lastResult !== "");
  }

  function preview(): void {
    const expr = display.input.value.trim();
    display.setPrev("");
    if (expr === "") {
      showResult("", "preview");
      return;
    }
    const r = runCalc(expr, prefs(), ans);
    if (r.ok && r.text !== expr) showResult("= " + r.text, "preview");
    else showResult("", "preview");
  }

  function commit(): void {
    const input = display.input;
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
    lastExpr = expr;
    display.setPrev(isRtl(state.lang) ? isolateLtr(expr) + " =" : expr + " =");
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
      display.setPrev("");
      showResult("", "preview");
    }
    setEdit(applyKey(s, key));
  }

  function keyButton(k: KeyDef, extraClass = ""): HTMLElement {
    const key = ctx.kit.Key({ id: k.id, kind: keyKind(k), label: k.label, onPress: () => press(k) });
    if (extraClass) key.el.classList.add(extraClass);
    return key.el;
  }

  async function openHistory(): Promise<void> {
    const items = await syncHistory();
    openSheet(t("calc_history"), (body, close) => {
      const kit = ctx.kit;
      const synced = state.keepHistory && state.mode === "telegram" && !state.authError;
      body.append(
        h(
          "div",
          { class: "hist-meta" },
          kit.Text({ kind: "hint", text: t("calc_history_count", { n: items.length, max: state.historyLimit }) }).el,
          kit.Text({ kind: "hint", text: synced ? "☁" : t("calc_history_local") }).el,
        ),
      );
      const list = h("div", { class: "hist-list" });
      if (items.length === 0) list.appendChild(kit.Text({ kind: "empty", text: t("history_empty") }).el);
      for (const it of items) {
        list.appendChild(
          kit.ListItem({
            layout: "stacked",
            primary: "= " + it.result,
            secondary: it.expr,
            secondaryLtr: true,
            ariaLabel: `${it.expr} = ${it.result}`,
            onClick: () => {
              justEvaluated = false;
              close();
              setEdit({ text: it.expr, start: it.expr.length, end: it.expr.length });
            },
          }).el,
        );
      }
      body.appendChild(list);
      if (items.length > 0) {
        body.appendChild(
          kit.Button({
            variant: "danger",
            icon: "trash",
            label: t("calc_clear_history"),
            onClick: () => {
              clearHistoryAll();
              toast(t("history_cleared"));
              close();
            },
          }).el,
        );
      }
    });
  }

  function render(): void {
    clear(el);
    const kit = ctx.kit;
    angleChip = kit.Chip({
      label: state.angle === "deg" ? "DEG" : "RAD",
      ariaLabel: t("set_angle"),
      onClick: () => {
        haptic.select();
        void saveSettings({ angle: state.angle === "deg" ? "rad" : "deg" }).then(() => {
          angleChip.setLabel(state.angle === "deg" ? "DEG" : "RAD");
          preview();
        });
      },
    });
    const kbd: IconButtonHandle = kit.IconButton({
      icon: "keyboard",
      label: t("calc_keyboard"),
      pressed: false,
      onClick: () => {
        const input = display.input;
        const on = input.inputMode === "none";
        input.inputMode = on ? "text" : "none";
        kbd.setPressed(on);
        input.focus();
      },
    });
    const hist = kit.IconButton({ icon: "history", label: t("calc_history"), onClick: () => void openHistory() });
    shareBtn = shareAvailable()
      ? kit.IconButton({
          icon: "share",
          label: t("share"),
          onClick: () =>
            void runShare(
              { kind: "calc", title: t("nav_calc"), main: lastResult, sub: lastExpr, footer: new Date().toISOString().slice(0, 10) },
              shareBtn?.el,
            ),
        })
      : null;
    if (shareBtn) shareBtn.el.hidden = true;
    display = kit.Display({
      placeholder: t("calc_placeholder"),
      inputLabel: t("calc_placeholder"),
      onInput: () => {
        justEvaluated = false;
        exprValue = display.input.value;
        preview();
      },
      onEnter: commit,
      onResultClick: () => {
        if (lastResultKind !== "final" || !lastResult) return;
        void navigator.clipboard?.writeText(lastResult).then(() => toast(t("copied")), () => undefined);
      },
    });
    display.input.value = exprValue;
    const sciToggle = kit.Chip({ label: "ƒ(x)", ariaLabel: t("calc_sci"), pressed: sciOn, keepFocus: true, onClick: () => setSci(!sciOn) });
    sciToggle.el.classList.add("sci-toggle");
    const backKey = kit.Key({ id: "sci-back", kind: "ctl", label: "123", ariaLabel: "123", onPress: () => setSci(false) });
    backKey.el.classList.add("sci-back");
    const extra = MAIN_PAD.filter((k) => k.id === "ac" || k.id === "bs" || k.id === "eq").map((k) => keyButton(k, "sci-extra"));
    const sci = h("div", { class: "sci", attrs: { role: "group", "aria-label": t("calc_sci") } }, SCI_KEYS.map((k) => keyButton(k)), backKey.el, extra);
    const pad = h("div", { class: "keypad", attrs: { role: "group" } }, MAIN_PAD.map((k) => keyButton(k)));
    function setSci(on: boolean): void {
      sciOn = on;
      el.dataset.sci = on ? "on" : "off";
      sciToggle.setPressed(on);
      haptic.select();
    }
    el.dataset.sci = sciOn ? "on" : "off";
    el.append(h("div", { class: "calc-bar" }, hist.el, shareBtn?.el, h("div", { class: "grow" }), sciToggle.el, angleChip.el, kbd.el), display.el, sci, pad);
    if (lastResultKind === "final" || lastResultKind === "error") showResult(lastResultKind === "error" ? lastErrorText : lastResult, lastResultKind);
    else preview();
  }

  render();
  return { el, render };
}
