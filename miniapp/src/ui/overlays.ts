// Overlay and purchase behaviour shared by all pages: toast, bottom sheet, searchable picker and the Pro purchase.
// Behaviour only: the markup and paint of toast/sheet/list items come from the active style's kit.

import { currentKit, onStyleChange } from "../styles/registry";
import type { ToastHandle } from "../contract/types";
import { clear, h } from "./dom";
import { state, t, update } from "./state";
import { haptic, inTelegram, openInvoice, pushBack } from "./tg";

// ---- toast ----
let toastHandle: ToastHandle | null = null;
let toastTimer = 0;

export function toast(text: string, kind: "ok" | "error" = "ok"): void {
  if (!toastHandle) {
    toastHandle = currentKit().Toast();
    document.body.appendChild(toastHandle.el);
  }
  const handle = toastHandle;
  handle.set(text, kind, true);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => handle.set(text, kind, false), 2200);
}

// ---- bottom sheet ----
export interface Sheet {
  close(): void;
  body: HTMLElement;
}

const openSheets = new Set<{ destroy(): void }>();

// A new style brings a new kit: DOM built by the old kit (open sheets, the toast) is removed so no stale markup
// remains next to the new stylesheet.
onStyleChange(() => {
  for (const s of [...openSheets]) s.destroy();
  toastHandle?.el.remove();
  toastHandle = null;
});

export function openSheet(title: string, build: (body: HTMLElement, close: () => void) => void, onClose?: () => void): Sheet {
  const parts = currentKit().Sheet({ title, closeLabel: t("close") });
  let closed = false;
  let unback: () => void = () => undefined;
  const finish = (): void => {
    if (closed) return;
    closed = true;
    unback();
    openSheets.delete(entry);
    onClose?.();
  };
  const entry = {
    destroy(): void {
      finish();
      parts.el.remove();
    },
  };
  function close(): void {
    if (closed) return;
    finish();
    parts.setOpen(false);
    window.setTimeout(() => parts.el.remove(), 220);
  }
  openSheets.add(entry);
  unback = pushBack(close);
  parts.veil.addEventListener("click", close);
  parts.closeButton.addEventListener("click", close);
  parts.el.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") close();
  });
  document.body.appendChild(parts.el);
  build(parts.body, close);
  window.requestAnimationFrame(() => {
    if (!closed) parts.setOpen(true);
  });
  return { close, body: parts.body };
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
    const kit = currentKit();
    const search = kit.Field({ ariaLabel: opts.placeholder, placeholder: opts.placeholder, type: "search", ltr: false, onInput: () => render() });
    const list = h("div", { class: "pick-list", attrs: { role: "listbox" } });
    const render = (): void => {
      clear(list);
      const items = opts.items(search.input.value);
      if (items.length === 0) list.appendChild(kit.Text({ kind: "empty", text: t("conv_no_match") }).el);
      for (const it of items.slice(0, 200)) {
        const l = opts.label(it);
        list.appendChild(
          kit.ListItem({
            primary: l.main,
            secondary: l.sub,
            layout: "split",
            role: "option",
            selected: it === opts.selected,
            onClick: () => {
              opts.onPick(it);
              close();
            },
          }).el,
        );
      }
    };
    body.append(search.el, list);
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
