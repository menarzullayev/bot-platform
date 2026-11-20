// Shared UI pieces: toast, bottom sheet, segmented control, searchable picker, Pro lock overlay.

import { openInvoice, haptic, pushBack, inTelegram } from "./tg";
import { clear, h, icon } from "./dom";
import { state, t, update } from "./state";

// ---- toast ----
let toastEl: HTMLElement | null = null;
let toastTimer = 0;

export function toast(text: string, kind: "ok" | "error" = "ok"): void {
  if (!toastEl) {
    toastEl = h("div", { class: "toast", attrs: { role: "status", "aria-live": "polite" } });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.dataset.kind = kind;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove("show"), 2200);
}

// ---- bottom sheet ----
export interface Sheet {
  close(): void;
  body: HTMLElement;
}

export function openSheet(title: string, build: (body: HTMLElement, close: () => void) => void, onClose?: () => void): Sheet {
  const body = h("div", { class: "sheet-body" });
  const veil = h("div", { class: "veil" });
  const panel = h(
    "div",
    { class: "sheet", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title } },
    h(
      "div",
      { class: "sheet-head" },
      h("div", { class: "sheet-title", text: title }),
      h("button", { class: "icon-btn", attrs: { "aria-label": t("close"), type: "button" }, on: { click: () => close() } }, icon("close", 20)),
    ),
    body,
  );
  const root = h("div", { class: "sheet-root" }, veil, panel);
  let closed = false;
  let unback: () => void = () => undefined;
  function close(): void {
    if (closed) return;
    closed = true;
    unback();
    root.classList.remove("open");
    window.setTimeout(() => root.remove(), 220);
    onClose?.();
  }
  unback = pushBack(close);
  veil.addEventListener("click", close);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.body.appendChild(root);
  build(body, close);
  window.requestAnimationFrame(() => root.classList.add("open"));
  return { close, body };
}

// ---- segmented control ----
export function segmented<T extends string>(
  options: ReadonlyArray<readonly [T, string]>,
  value: T,
  onPick: (v: T) => void,
  label?: string,
): HTMLElement {
  const wrap = h("div", { class: "seg", attrs: { role: "radiogroup", "aria-label": label } });
  const buttons = new Map<T, HTMLButtonElement>();
  const paint = (v: T): void => {
    for (const [k, b] of buttons) {
      b.setAttribute("aria-checked", String(k === v));
      b.classList.toggle("on", k === v);
    }
  };
  for (const [v, text] of options) {
    const b = h("button", {
      class: "seg-btn",
      attrs: { type: "button", role: "radio" },
      text,
      on: {
        click: () => {
          haptic.select();
          paint(v);
          onPick(v);
        },
      },
    });
    buttons.set(v, b);
    wrap.appendChild(b);
  }
  paint(value);
  return wrap;
}

// ---- chooser: wrapping chip grid on roomy screens, one compact native select on short ones (CSS decides which) ----
export function chooser<T extends string>(
  options: ReadonlyArray<readonly [T, string]>,
  value: T,
  onPick: (v: T) => void,
  label: string,
  opts: { roomy?: boolean; langs?: ReadonlyArray<string> } = {},
): HTMLElement {
  const grid = h("div", { class: "choose-grid", attrs: { role: "radiogroup", "aria-label": label } });
  const select = h("select", { class: "choose-select", attrs: { "aria-label": label } });
  const chips = new Map<T, HTMLButtonElement>();
  const paint = (v: T): void => {
    for (const [k, b] of chips) {
      b.setAttribute("aria-checked", String(k === v));
      b.classList.toggle("on", k === v);
    }
    select.value = v;
  };
  options.forEach(([v, text], i) => {
    const lang = opts.langs?.[i];
    const b = h("button", {
      class: "chip",
      attrs: { type: "button", role: "radio", lang },
      text,
      on: {
        click: () => {
          haptic.select();
          paint(v);
          onPick(v);
        },
      },
    });
    chips.set(v, b);
    grid.appendChild(b);
    select.appendChild(h("option", { attrs: { value: v, lang }, text }));
  });
  select.addEventListener("change", () => {
    haptic.select();
    const v = select.value as T;
    paint(v);
    onPick(v);
  });
  paint(value);
  return h("div", { class: "choose" + (opts.roomy ? " lo" : "") }, grid, h("div", { class: "choose-sel" }, select));
}

// ---- searchable picker (units / currencies) ----
export function openPicker(opts: {
  title: string;
  placeholder: string;
  items: (query: string) => string[];
  label: (item: string) => { main: string; sub?: string };
  selected: string;
  onPick: (item: string) => void;
}): void {
  openSheet(opts.title, (body, close) => {
    const input = h("input", {
      class: "field search",
      attrs: { type: "search", placeholder: opts.placeholder, autocomplete: "off", spellcheck: false, "aria-label": opts.placeholder },
    });
    const list = h("div", { class: "pick-list", attrs: { role: "listbox" } });
    const render = (): void => {
      clear(list);
      const items = opts.items(input.value);
      if (items.length === 0) list.appendChild(h("div", { class: "empty", text: t("conv_no_match") }));
      for (const it of items.slice(0, 200)) {
        const l = opts.label(it);
        list.appendChild(
          h(
            "button",
            {
              class: "pick-item" + (it === opts.selected ? " on" : ""),
              attrs: { type: "button", role: "option", "aria-selected": it === opts.selected },
              on: {
                click: () => {
                  haptic.select();
                  opts.onPick(it);
                  close();
                },
              },
            },
            h("span", { class: "pick-main ltr", text: l.main }),
            l.sub ? h("span", { class: "pick-sub", text: l.sub }) : null,
          ),
        );
      }
    };
    input.addEventListener("input", render);
    body.append(input, list);
    render();
  });
}

// ---- Pro purchase ----
let buying = false;

/** Creates the Stars invoice on the server and opens Telegram's payment sheet; refreshes entitlement afterwards. */
export async function buyPro(refresh: () => Promise<void>): Promise<void> {
  if (buying) return;
  if (!inTelegram || !state.api) {
    toast(t("pro_need_telegram"), "error");
    return;
  }
  buying = true;
  try {
    const { link } = await state.api.invoice();
    const status = await openInvoice(link);
    if (status === "paid") {
      haptic.result("success");
      toast(t("pro_pending"));
      // Telegram delivers successful_payment to the bot webhook asynchronously: poll until entitlement flips.
      for (let i = 0; i < 8 && !state.isPro; i++) {
        await new Promise((r) => window.setTimeout(r, 1500));
        await refresh();
      }
      if (state.isPro) toast(t("pro_paid"));
    } else if (status === "cancelled") {
      toast(t("pro_cancelled"));
    } else if (status === "failed") {
      toast(t("pro_failed"), "error");
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "already_pro") await refresh();
    else toast(t("pro_failed"), "error");
  } finally {
    buying = false;
    update({});
  }
}

/** Overlay shown over blurred Pro content. */
export function proLock(refresh: () => Promise<void>): HTMLElement {
  return h(
    "div",
    { class: "pro-lock" },
    h("div", { class: "pro-lock-icon" }, icon("lock", 26)),
    h("div", { class: "pro-lock-title", text: t("pro_locked_title") }),
    h("div", { class: "pro-lock-text", text: t("pro_locked_text") }),
    h("button", { class: "btn primary", attrs: { type: "button" }, text: t("pro_upgrade", { stars: state.proStars }), on: { click: () => void buyPro(refresh) } }),
  );
}
