// Graph page: canvas plotting of up to four functions with pan, pinch/wheel zoom, tracing and a table of values.
// Lazy-loaded (it pulls in the symbolic parser). Angles are radians here, as in the numeric sampler.

import { compileFast } from "../../../../worker/src/calc/symbolic/numeric";
import { parseExpression } from "../../../../worker/src/calc/symbolic/solve";
import { bounds, defaultView, fitView, formatTick, niceStep, panBy, samplePlot, tableRows, ticks, toScreen, toWorld, traceAt, zoomAt, type Fn, type Plot, type View } from "../../lib/plot";
import { parseNumber } from "../../lib/num";
import { clear, h } from "../dom";
import { openSheet } from "../overlays";
import { lsGet, lsSet, t } from "../state";
import { haptic } from "../tg";
import type { FieldHandle } from "../../contract/types";
import type { Page, PageCtx } from "./types";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];
const MAX_FUNCS = 4;

interface Row {
  text: string;
  fn: Fn | null;
  valid: boolean;
}

/** "y = x^2", "f(x)=x^2" -> "x^2". */
export function stripLhs(s: string): string {
  return s.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "");
}

export function compileRow(text: string): Row {
  const src = stripLhs(text.trim());
  if (src === "") return { text, fn: null, valid: true };
  try {
    const fn = compileFast(parseExpression(src), "x");
    // probe once: a function that is NaN everywhere still plots nothing but is syntactically fine
    return { text, fn, valid: true };
  } catch {
    return { text, fn: null, valid: false };
  }
}

export function createGraphPage(ctx: PageCtx): Page {
  const el = h("section", { class: "page graph", attrs: { "aria-label": "graph" } });
  const saved = lsGet<string[]>("graph", ["sin(x)"]);
  const rows: Row[] = (saved.length ? saved.slice(0, MAX_FUNCS) : ["sin(x)"]).map((s) => compileRow(String(s).slice(0, 200)));
  let canvas!: HTMLCanvasElement;
  let g2d: CanvasRenderingContext2D | null = null;
  let view: View | null = null;
  let w = 0;
  let hgt = 0;
  let dpr = 1;
  let dirty = true;
  let raf = 0;
  let visible = false;
  let plots: Plot[] = [];
  let trace: { x: number; y: number; i: number } | null = null;
  let colors = { bg: "#ffffff", grid: "#00000014", axis: "#00000066", text: "#00000099" };
  const pointers = new Map<number, { x: number; y: number }>();
  let tapCandidate: { x: number; y: number; t: number } | null = null;

  const persist = (): void => lsSet("graph", rows.map((r) => r.text));

  function readColors(): void {
    const cs = getComputedStyle(el);
    const get = (n: string, d: string): string => cs.getPropertyValue(n).trim() || d;
    colors = { bg: get("--bg", "#ffffff"), grid: get("--line", "#00000014"), axis: get("--ink-2", "#888888"), text: get("--ink-2", "#888888") };
  }

  function resize(): void {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const nw = Math.round(r.width);
    const nh = Math.round(r.height);
    if (nw === w && nh === hgt && view) return;
    const first = view === null;
    w = nw;
    hgt = nh;
    canvas.width = Math.round(nw * dpr);
    canvas.height = Math.round(nh * dpr);
    g2d = canvas.getContext("2d");
    if (first) view = fitView(activeFns(), w, hgt);
    invalidate();
  }

  const activeFns = (): Fn[] => rows.filter((r) => r.fn).map((r) => r.fn as Fn);

  function invalidate(): void {
    dirty = true;
    if (!raf && visible) raf = window.requestAnimationFrame(frame);
  }

  function frame(): void {
    raf = 0;
    if (!dirty || !visible) return;
    dirty = false;
    draw();
  }

  function draw(): void {
    if (!g2d || !view || w === 0) return;
    const c = g2d;
    const v = view;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, hgt);
    const b = bounds(v, w, hgt);
    const xs = niceStep(b.xmax - b.xmin, w / 90);
    const ys = niceStep(b.ymax - b.ymin, hgt / 70);
    c.lineWidth = 1;
    c.strokeStyle = colors.grid;
    c.beginPath();
    for (const x of ticks(b.xmin, b.xmax, xs)) {
      const [px] = toScreen(v, w, hgt, x, 0);
      c.moveTo(Math.round(px) + 0.5, 0);
      c.lineTo(Math.round(px) + 0.5, hgt);
    }
    for (const y of ticks(b.ymin, b.ymax, ys)) {
      const [, py] = toScreen(v, w, hgt, 0, y);
      c.moveTo(0, Math.round(py) + 0.5);
      c.lineTo(w, Math.round(py) + 0.5);
    }
    c.stroke();
    // axes
    const [ox, oy] = toScreen(v, w, hgt, 0, 0);
    c.strokeStyle = colors.axis;
    c.lineWidth = 1.5;
    c.beginPath();
    if (oy >= 0 && oy <= hgt) {
      c.moveTo(0, oy);
      c.lineTo(w, oy);
    }
    if (ox >= 0 && ox <= w) {
      c.moveTo(ox, 0);
      c.lineTo(ox, hgt);
    }
    c.stroke();
    // tick labels
    c.fillStyle = colors.text;
    c.font = "11px system-ui, sans-serif";
    c.textBaseline = "top";
    c.textAlign = "center";
    const ly = Math.min(hgt - 14, Math.max(2, oy + 3));
    for (const x of ticks(b.xmin, b.xmax, xs)) {
      if (x === 0) continue;
      const [px] = toScreen(v, w, hgt, x, 0);
      c.fillText(formatTick(x, xs), px, ly);
    }
    c.textAlign = "left";
    c.textBaseline = "middle";
    const lx = Math.min(w - 34, Math.max(2, ox + 4));
    for (const y of ticks(b.ymin, b.ymax, ys)) {
      if (y === 0) continue;
      const [, py] = toScreen(v, w, hgt, 0, y);
      c.fillText(formatTick(y, ys), lx, py - 1);
    }
    // curves
    plots = [];
    c.lineWidth = 2.2;
    c.lineJoin = "round";
    c.lineCap = "round";
    rows.forEach((r, i) => {
      if (!r.fn) {
        plots.push({ lines: [], samples: { points: [], breaks: [] } });
        return;
      }
      const p = samplePlot(r.fn, v, w, hgt);
      plots.push(p);
      c.strokeStyle = COLORS[i % COLORS.length];
      c.beginPath();
      for (const line of p.lines) {
        c.moveTo(line[0][0], line[0][1]);
        for (let k = 1; k < line.length; k++) c.lineTo(line[k][0], line[k][1]);
      }
      c.stroke();
    });
    // trace marker
    if (trace) {
      const [px, py] = toScreen(v, w, hgt, trace.x, trace.y);
      c.fillStyle = COLORS[trace.i % COLORS.length];
      c.beginPath();
      c.arc(px, py, 5, 0, Math.PI * 2);
      c.fill();
      const label = `(${Number(trace.x.toPrecision(5))}, ${Number(trace.y.toPrecision(5))})`;
      c.font = "600 13px system-ui, sans-serif";
      const tw = c.measureText(label).width + 14;
      const bx = Math.min(w - tw - 4, Math.max(4, px - tw / 2));
      const by = py < 40 ? py + 12 : py - 34;
      c.fillStyle = colors.bg;
      c.strokeStyle = COLORS[trace.i % COLORS.length];
      c.lineWidth = 1.5;
      c.beginPath();
      if (typeof c.roundRect === "function") c.roundRect(bx, by, tw, 24, 8);
      else c.rect(bx, by, tw, 24);
      c.fill();
      c.stroke();
      c.fillStyle = colors.text;
      c.textAlign = "center";
      c.fillText(label, bx + tw / 2, by + 12);
    }
  }

  function setTrace(px: number, py: number): void {
    if (!view) return;
    const [wx] = toWorld(view, w, hgt, px, py);
    let found: { x: number; y: number; i: number } | null = null;
    let bestD = 60; // only snap to a curve within 60 px of the tap
    for (let i = 0; i < plots.length; i++) {
      const pt = traceAt(plots[i].samples, wx);
      if (!pt) continue;
      const d = Math.abs(toScreen(view, w, hgt, pt[0], pt[1])[1] - py);
      if (d < bestD) {
        bestD = d;
        found = { x: pt[0], y: pt[1], i };
      }
    }
    trace = found;
    if (trace) haptic.select();
    invalidate();
  }

  function onPointerDown(e: PointerEvent): void {
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    tapCandidate = pointers.size === 1 ? { x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now() } : null;
  }

  function onPointerMove(e: PointerEvent): void {
    const prev = pointers.get(e.pointerId);
    if (!prev || !view) return;
    const r = canvas.getBoundingClientRect();
    const cur = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (pointers.size === 1) {
      view = panBy(view, cur.x - prev.x, cur.y - prev.y);
      if (tapCandidate && Math.hypot(cur.x - tapCandidate.x, cur.y - tapCandidate.y) > 6) tapCandidate = null;
    } else if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
        const mx = (cur.x + other.x) / 2;
        const my = (cur.y + other.y) / 2;
        const pmx = (prev.x + other.x) / 2;
        const pmy = (prev.y + other.y) / 2;
        if (d0 > 0 && d1 > 0) view = zoomAt(view, d1 / d0, mx, my, w, hgt);
        view = panBy(view, mx - pmx, my - pmy);
      }
      tapCandidate = null;
    }
    pointers.set(e.pointerId, cur);
    trace = null;
    invalidate();
  }

  function onPointerUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (tapCandidate && Date.now() - tapCandidate.t < 400) setTrace(tapCandidate.x, tapCandidate.y);
    tapCandidate = null;
  }

  function onWheel(e: WheelEvent): void {
    if (!view) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    view = zoomAt(view, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top, w, hgt);
    trace = null;
    invalidate();
  }

  function resetView(): void {
    haptic.select();
    view = w ? fitView(activeFns(), w, hgt) : defaultView(300, 300);
    trace = null;
    invalidate();
  }

  function openTable(): void {
    const idx = Math.max(0, rows.findIndex((r) => r.fn));
    const row = rows[idx];
    openSheet(t("graph_table"), (body) => {
      const kit = ctx.kit;
      let from = "-5";
      let step = "1";
      const fromIn = kit.Field({ label: t("graph_table_from"), ariaLabel: t("graph_table_from"), inputMode: "decimal", value: from, onInput: (v) => { from = v; paint(); } });
      const stepIn = kit.Field({ label: t("graph_table_step"), ariaLabel: t("graph_table_step"), inputMode: "decimal", value: step, onInput: (v) => { step = v; paint(); } });
      const table = kit.Table({ columns: ["x", "f(x)"] });
      const paint = (): void => {
        const f0 = parseNumber(from)?.toNumber();
        const s0 = parseNumber(step)?.toNumber();
        const out: string[][] = [];
        if (row?.fn && f0 !== undefined && s0 !== undefined && s0 !== 0) {
          for (const r of tableRows(row.fn, f0, s0, 25)) out.push([String(r.x), r.y === null ? "—" : String(r.y)]);
        }
        table.setRows(out);
      };
      body.append(kit.Text({ kind: "hint", text: row ? `f(x) = ${stripLhs(row.text)}` : "", ltr: true }).el, h("div", { class: "grid2" }, fromIn.el, stepIn.el), table.el);
      paint();
    });
  }

  function render(): void {
    clear(el);
    const kit = ctx.kit;
    const list = h("div", { class: "fn-list" });
    const buildList = (): void => {
      clear(list);
      rows.forEach((r, i) => {
        const field: FieldHandle = kit.Field({
          ariaLabel: `f${i + 1}`,
          placeholder: t("graph_fx_ph"),
          maxLength: 200,
          value: r.text,
          onInput: (v) => {
            rows[i] = compileRow(v);
            field.setInvalid(!rows[i].valid, t("graph_invalid"));
            persist();
            trace = null;
            invalidate();
          },
        });
        field.input.classList.add("fn-input");
        field.setInvalid(!r.valid, t("graph_invalid"));
        list.appendChild(
          h(
            "div",
            { class: "fn-row" },
            h("span", { class: "dot", style: { "--c": COLORS[i % COLORS.length] } }),
            field.el,
            rows.length > 1
              ? kit.IconButton({
                  icon: "close",
                  label: t("graph_remove"),
                  size: 18,
                  onClick: () => {
                    rows.splice(i, 1);
                    persist();
                    buildList();
                    invalidate();
                  },
                }).el
              : null,
          ),
        );
      });
    };
    buildList();
    const frame = kit.PlotFrame({ ariaLabel: "graph" });
    canvas = frame.canvas;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", resetView);
    const tools = h(
      "div",
      { class: "graph-tools" },
      kit.Button({ icon: "plus", label: t("graph_add"), onClick: () => { if (rows.length < MAX_FUNCS) { rows.push(compileRow("")); buildList(); } } }).el,
      kit.Button({ icon: "table", label: t("graph_table"), onClick: openTable }).el,
      kit.Button({ icon: "reset", label: t("graph_reset"), onClick: resetView }).el,
    );
    el.append(list, frame.el, kit.Text({ kind: "hint", align: "center", text: `${t("graph_hint")} · ${t("graph_note")}` }).el, tools);
    w = 0;
    g2d = null;
    window.requestAnimationFrame(() => {
      readColors();
      resize();
    });
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); }) : null;

  render();
  if (ro) ro.observe(el);
  return {
    el,
    render,
    onShow: () => {
      visible = true;
      readColors();
      resize();
      invalidate();
    },
    onHide: () => {
      visible = false;
    },
  };
}
