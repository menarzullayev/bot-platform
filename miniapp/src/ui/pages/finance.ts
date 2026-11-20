// Finance page: loan (annuity / differentiated) with schedule, VAT, discount, percent change, interest, markup.

import { computeTool, defaultsOf, TOOL_IDS, TOOLS, type ScheduleLine, type ToolId } from "../../lib/finance";
import { clear, h, icon } from "../dom";
import { lsGet, lsSet, state, t } from "../state";
import { chooser, openSheet, segmented } from "../widgets";
import type { Page } from "./types";
import type { MessageKey, MsKey } from "../../i18n";

const tt = (k: string): string => t(k as MsKey | MessageKey);

export function createFinancePage(): Page {
  const el = h("section", { class: "page finance", attrs: { "aria-label": "finance" } });
  let tool: ToolId = lsGet<ToolId>("fin-tool", "loan");
  if (!TOOL_IDS.includes(tool)) tool = "loan";
  const values: Partial<Record<ToolId, Record<string, string>>> = {};
  const valuesOf = (id: ToolId): Record<string, string> => (values[id] ??= { ...defaultsOf(id), ...lsGet<Record<string, string>>("fin-" + id, {}) });
  let outEl!: HTMLElement;
  let schedEl!: HTMLElement;

  function scheduleTable(sched: ScheduleLine[]): HTMLElement {
    return h(
      "table",
      { class: "tbl ltr" },
      h("thead", null, h("tr", null, ["r_col_month", "r_col_payment", "r_col_principal", "r_col_interest", "r_col_balance"].map((k) => h("th", { text: tt(k) })))),
      h(
        "tbody",
        null,
        sched.map((s) =>
          h(
            "tr",
            null,
            // data-l feeds the inline labels used by the narrow-screen layout
            h("td", { text: s.month, attrs: { "data-l": tt("r_col_month") } }),
            h("td", { text: s.payment, attrs: { "data-l": tt("r_col_payment") } }),
            h("td", { text: s.principal, attrs: { "data-l": tt("r_col_principal") } }),
            h("td", { text: s.interest, attrs: { "data-l": tt("r_col_interest") } }),
            h("td", { text: s.balance, attrs: { "data-l": tt("r_col_balance") } }),
          ),
        ),
      ),
    );
  }

  function compute(): void {
    const vals = valuesOf(tool);
    lsSet("fin-" + tool, vals);
    clear(outEl);
    clear(schedEl);
    const r = computeTool(tool, vals, state.lang);
    if (!r.ok) {
      outEl.appendChild(h("div", { class: "card err", text: r.error === "div0" ? tt("err_div0") : tt("fin_bad_input") }));
      return;
    }
    // the headline row is the hero of the card, the rest are compact label-over-value cells
    const hero = r.rows.find((row) => row.strong);
    const rest = r.rows.filter((row) => row !== hero);
    const sched = r.schedule;
    // roomy screens show the schedule inline (inner scroll); short ones open it in a sheet so the page never scrolls
    const schedBtn = sched
      ? h(
          "button",
          { class: "btn slim sched-btn", attrs: { type: "button", "aria-label": tt("r_schedule") }, on: { click: () => openSheet(tt("r_schedule"), (body) => body.appendChild(h("div", { class: "tbl-wrap sheet-tbl" }, scheduleTable(sched)))) } },
          icon("table", 16),
          t("graph_table"),
        )
      : null;
    outEl.appendChild(
      h(
        "div",
        { class: "card out-rows" },
        hero ? h("div", { class: "hero" }, h("span", { class: "row-l", text: tt(hero.label) }), h("span", { class: "hero-v ltr", text: hero.value })) : null,
        h("div", { class: "cells" }, rest.map((row) => h("div", { class: "cell" }, h("span", { class: "row-l", text: tt(row.label) }), h("span", { class: "row-v ltr", text: row.value }))), schedBtn),
      ),
    );
    if (sched) schedEl.append(h("div", { class: "lbl", text: tt("r_schedule") }), h("div", { class: "tbl-wrap" }, scheduleTable(sched)));
  }

  function render(): void {
    clear(el);
    el.appendChild(
      chooser(
        TOOL_IDS.map((id) => [id, tt(TOOLS[id].title)] as const),
        tool,
        (id) => {
          tool = id;
          lsSet("fin-tool", id);
          render();
        },
        tt("nav_finance"),
      ),
    );
    const vals = valuesOf(tool);
    const form = h("div", { class: "card form fgrid" });
    // an odd count of number fields: the first one takes the full row so the rest pair up
    const oddNumbers = TOOLS[tool].fields.filter((f) => f.kind === "number").length % 2 === 1;
    let firstNumber = true;
    for (const f of TOOLS[tool].fields) {
      if (f.kind === "number") {
        const input = h("input", {
          class: "field ltr",
          attrs: { type: "text", inputmode: "decimal", dir: "ltr", autocomplete: "off", "aria-label": tt(f.label) },
          on: {
            input: () => {
              vals[f.id] = input.value;
              compute();
            },
          },
        });
        input.value = vals[f.id] ?? f.default;
        form.appendChild(h("label", { class: "lbl" + (oddNumbers && firstNumber ? " span2" : "") }, tt(f.label), input));
        firstNumber = false;
      } else {
        form.appendChild(
          h(
            "div",
            { class: "lbl span2" + ((f.options ?? []).length <= 2 ? " inl" : "") },
            tt(f.label),
            segmented(
              (f.options ?? []).map(([v, k]) => [v, tt(k)] as const),
              vals[f.id] ?? f.default,
              (v) => {
                vals[f.id] = v;
                compute();
              },
              tt(f.label),
            ),
          ),
        );
      }
    }
    outEl = h("div", { class: "fin-out", attrs: { "aria-live": "polite" } });
    // result first on short screens: it is what the user came for, the form is two compact columns
    schedEl = h("div", { class: "card sched" });
    el.append(outEl, form, schedEl);
    compute();
  }

  render();
  return { el, render };
}
