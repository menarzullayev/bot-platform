// Tiny DOM helpers. No innerHTML anywhere: text is always set through textContent / createTextNode, and element
// styles through the CSSOM (style.setProperty), both of which are allowed by the page's strict CSP.

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string;
  /** CSS custom properties / properties set through the CSSOM. */
  style?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | undefined>;
  dataset?: Record<string, string>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
  text?: string;
  [k: string]: unknown;
}

function append(el: Node, kid: Child): void {
  if (kid === null || kid === undefined || kid === false) return;
  if (Array.isArray(kid)) {
    for (const k of kid) append(el, k);
    return;
  }
  el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.style) for (const [k, v] of Object.entries(props.style)) el.style.setProperty(k, v);
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (k === "style") continue; // inline style attributes are blocked by CSP
        if (v === undefined || v === false) continue;
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
    if (props.on) {
      for (const [type, fn] of Object.entries(props.on)) el.addEventListener(type, fn as EventListener);
    }
  }
  for (const k of kids) append(el, k);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function setChildren(el: Element, ...kids: Child[]): void {
  clear(el);
  for (const k of kids) append(el, k);
}

const SVG_NS = "http://www.w3.org/2000/svg";

const PATHS: Record<string, string> = {
  calc: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 4h10M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01",
  convert: "M7 7h13l-3-3M17 17H4l3 3",
  graph: "M3 3v18h18M7 15l4-5 3 3 5-7",
  solve: "M5 4h14l-7 8 7 8H5",
  finance: "M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5S9.8 10 12 10s4 1.1 4 2.5S14.2 15 12 15s-4-1.1-4-2.5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  keyboard: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm4 8h10M6 10h.01M10 10h.01M14 10h.01M18 10h.01",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  copy: "M9 9h11v11H9zM5 15V4h11",
  swap: "M8 4v16m0 0l-4-4m4 4l4-4M16 20V4m0 0l-4 4m4-4l4 4",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  check: "M5 12l5 5 9-10",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14",
  reset: "M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  chevron: "M9 6l6 6-6 6",
  share: "M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4",
};

export function icon(name: keyof typeof PATHS | string, size = 22): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ic");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", PATHS[name] ?? PATHS.close);
  svg.appendChild(p);
  return svg;
}
