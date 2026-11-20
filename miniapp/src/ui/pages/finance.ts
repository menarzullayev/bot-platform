// Finance page: loan (annuity / differentiated) with schedule, VAT, discount, percent change, interest, markup.

import { computeTool, defaultsOf, TOOL_IDS, TOOLS, type ToolId } from "../../lib/finance";
import { clear, h } from "../dom";
import { lsGet, lsSet, state, t } from "../state";
import { haptic } from "../tg";
import { segmented } from "../widgets";
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

  function compute(): void {
    const vals = valuesOf(tool);
    lsSet("fin-" + tool, vals);
    clear(outEl);
    const r = computeTool(tool, vals, state.lang);
    if (!r.ok) {
      outEl.appendChild(h("div", { class: "card err", text: r.error === "div0" ? tt("err_div0") : tt("fin_bad_input") }));
      return;
    }
    outEl.appendChild(
      h(
        "div",
        { class: "card out-rows" },
        r.rows.map((row) => h("div", { class: "row" + (row.strong ? " strong" : "") }, h("span", { class: "row-l", text: tt(row.label) }), h("span", { class: "row-v ltr", text: row.value }))),
      ),
    );
    if (r.schedule) {
      outEl.appendChild(
        h(
          "div",
          { class: "card" },
          h("div", { class: "lbl", text: tt("r_schedule") }),
          h(
            "div",
            { class: "tbl-wrap" },
            h(
              "table",
              { class: "tbl ltr" },
              h("thead", null, h("tr", null, ["r_col_month", "r_col_payment", "r_col_principal", "r_col_interest", "r_col_balance"].map((k) => h("th", { text: tt(k) })))),
              h("tbody", null, r.schedule.map((s) => h("tr", null, h("td", { text: s.month }), h("td", { text: s.payment }), h("td", { text: s.principal }), h("td", { text: s.interest }), h("td", { text: s.balance })))),
            ),
          ),
        ),
      );
    }
  }

  function render(): void {
    clear(el);
    el.appendChild(
      h(
        "div",
        { class: "cat-strip" },
        TOOL_IDS.map((id) =>
          h("button", {
            class: "chip" + (id === tool ? " on" : ""),
            attrs: { type: "button", "aria-pressed": id === tool },
            text: tt(TOOLS[id].title),
            on: {
              click: () => {
                haptic.select();
                tool = id;
                lsSet("fin-tool", id);
                render();
              },
            },
          }),
        ),
      ),
    );
    const vals = valuesOf(tool);
    const form = h("div", { class: "card form" });
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
        form.appendChild(h("label", { class: "lbl" }, tt(f.label), input));
      } else {
        form.appendChild(
          h(
            "div",
            { class: "lbl" },
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
    el.append(form, outEl);
    compute();
  }

  render();
  return { el, render };
}
