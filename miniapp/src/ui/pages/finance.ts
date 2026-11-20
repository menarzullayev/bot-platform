// Finance page: loan (annuity / differentiated) with schedule, VAT, discount, percent change, interest, markup.

import { computeTool, defaultsOf, TOOL_IDS, TOOLS, type ScheduleLine, type ToolId } from "../../lib/finance";
import type { TableHandle } from "../../contract/types";
import { clear, h } from "../dom";
import { openSheet } from "../overlays";
import { runShare, shareAvailable } from "../share";
import { lsGet, lsSet, state, t } from "../state";
import type { Page, PageCtx } from "./types";
import type { MessageKey, MsKey } from "../../i18n";

const tt = (k: string): string => t(k as MsKey | MessageKey);

export function createFinancePage(ctx: PageCtx): Page {
  const el = h("section", { class: "page finance", attrs: { "aria-label": "finance" } });
  let tool: ToolId = lsGet<ToolId>("fin-tool", "loan");
  if (!TOOL_IDS.includes(tool)) tool = "loan";
  const values: Partial<Record<ToolId, Record<string, string>>> = {};
  const valuesOf = (id: ToolId): Record<string, string> => (values[id] ??= { ...defaultsOf(id), ...lsGet<Record<string, string>>("fin-" + id, {}) });
  let outEl!: HTMLElement;
  let schedEl!: HTMLElement;

  function scheduleTable(sched: ScheduleLine[]): TableHandle {
    return ctx.kit.Table({
      columns: ["r_col_month", "r_col_payment", "r_col_principal", "r_col_interest", "r_col_balance"].map(tt),
      rows: sched.map((s) => [String(s.month), s.payment, s.principal, s.interest, s.balance]),
    });
  }

  function compute(): void {
    const kit = ctx.kit;
    const vals = valuesOf(tool);
    lsSet("fin-" + tool, vals);
    clear(outEl);
    clear(schedEl);
    const r = computeTool(tool, vals, state.lang);
    if (!r.ok) {
      outEl.appendChild(kit.Notice({ kind: "error", text: r.error === "div0" ? tt("err_div0") : tt("fin_bad_input") }).el);
      return;
    }
    // the headline row is the hero of the card, the rest are compact label-over-value cells
    const hero = r.rows.find((row) => row.strong);
    const rest = r.rows.filter((row) => row !== hero);
    const sched = r.schedule;
    const card = kit.ResultCard({ variant: "hero" });
    // roomy screens show the schedule inline (inner scroll); short ones open it in a sheet so the page never scrolls
    if (sched) {
      const btn = kit.Button({
        size: "slim",
        block: true,
        icon: "table",
        label: t("graph_table"),
        ariaLabel: tt("r_schedule"),
        onClick: () => openSheet(tt("r_schedule"), (body) => body.appendChild(scheduleTable(sched).el)),
      });
      btn.el.classList.add("sched-btn");
      card.actions.appendChild(btn.el);
    }
    if (hero && shareAvailable()) {
      const share = kit.Button({
        size: "slim",
        block: true,
        icon: "share",
        label: t("share"),
        onClick: () =>
          void runShare(
            {
              kind: tool === "loan" ? "loan" : "calc",
              title: tt(TOOLS[tool].title),
              main: hero.value,
              sub: tt(hero.label),
              footer: rest
                .slice(0, 2)
                .map((row) => `${tt(row.label)}: ${row.value}`)
                .join("  ·  "),
            },
            share.el,
          ),
      });
      card.actions.appendChild(share.el);
    }
    card.update({
      mainLabel: hero ? tt(hero.label) : undefined,
      main: hero ? [hero.value] : [],
      stats: rest.map((row) => ({ label: tt(row.label), value: row.value })),
    });
    outEl.appendChild(card.el);
    if (sched) schedEl.append(kit.Text({ kind: "label", text: tt("r_schedule") }).el, scheduleTable(sched).el);
  }

  function render(): void {
    clear(el);
    const kit = ctx.kit;
    el.appendChild(
      kit.Chooser({
        options: TOOL_IDS.map((id) => [id, tt(TOOLS[id].title)] as const),
        value: tool,
        label: tt("nav_finance"),
        onPick: (id) => {
          tool = id;
          lsSet("fin-tool", id);
          render();
        },
      }).el,
    );
    const vals = valuesOf(tool);
    const form = kit.Card({ class: "form fgrid" }).el;
    // an odd count of number fields: the first one takes the full row so the rest pair up
    const oddNumbers = TOOLS[tool].fields.filter((f) => f.kind === "number").length % 2 === 1;
    let firstNumber = true;
    for (const f of TOOLS[tool].fields) {
      if (f.kind === "number") {
        const field = kit.Field({
          label: tt(f.label),
          ariaLabel: tt(f.label),
          inputMode: "decimal",
          value: vals[f.id] ?? f.default,
          onInput: (v) => {
            vals[f.id] = v;
            compute();
          },
        });
        if (oddNumbers && firstNumber) field.el.classList.add("span2");
        form.appendChild(field.el);
        firstNumber = false;
      } else {
        form.appendChild(
          h(
            "div",
            { class: "fld-row span2" + ((f.options ?? []).length <= 2 ? " inl" : "") },
            kit.Text({ kind: "label", text: tt(f.label) }).el,
            kit.Segmented({
              options: (f.options ?? []).map(([v, k]) => [v, tt(k)] as const),
              value: vals[f.id] ?? f.default,
              label: tt(f.label),
              onPick: (v) => {
                vals[f.id] = v;
                compute();
              },
            }).el,
          ),
        );
      }
    }
    outEl = h("div", { class: "fin-out", attrs: { "aria-live": "polite" } });
    // result first on short screens: it is what the user came for, the form is two compact columns
    schedEl = kit.Card({ class: "sched" }).el;
    el.append(outEl, form, schedEl);
    compute();
  }

  render();
  return { el, render };
}
