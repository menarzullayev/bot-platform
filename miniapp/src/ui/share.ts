// Share button behaviour shared by the calculator, converter and finance pages: when the button is offered, what a tap does
// and how failures are told to the user. The logic itself is lib/share.ts; this file injects the real environment.

import type { ShareData } from "../contract/types";
import { canShare, failKey, shareCard, type ShareDeps } from "../lib/share";
import { currentPack } from "../styles/registry";
import { toast } from "./overlays";
import { state, t, update } from "./state";
import { haptic, inTelegram, openTelegramLink, shareMessage } from "./tg";

function scheme(): { dark: boolean; high: boolean } {
  const root = document.documentElement;
  const attr = root.getAttribute("data-theme");
  const dark = attr === "dark" || (attr !== "light" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
  return { dark, high: root.getAttribute("data-contrast") === "high" };
}

function deps(): ShareDeps {
  return {
    makeCanvas: () => document.createElement("canvas"),
    api: state.api,
    pack: currentPack(),
    scheme,
    signedIn: inTelegram && state.mode === "telegram" && !state.authError,
    degraded: state.degraded,
    shareMessage,
    openLink: openTelegramLink,
  };
}

/** The button exists only where a card can really be sent (never in demo mode, never in light mode). */
export function shareAvailable(): boolean {
  return canShare(deps());
}

/** Makes the card for `data` and opens Telegram's share picker; tells the user what went wrong otherwise. */
export async function runShare(data: ShareData, button?: HTMLElement): Promise<void> {
  button?.setAttribute("aria-busy", "true");
  try {
    const r = await shareCard(data, deps());
    if (r.ok) {
      haptic.result("success");
      if (r.via === "message" && r.sent) toast(t("share_sent"));
      return;
    }
    // the server is the authority on light mode: remember it so the buttons disappear on the next paint
    if (r.reason === "light") update({ degraded: Math.max(1, state.degraded) });
    const key = failKey(r.reason);
    if (key) {
      haptic.result("error");
      toast(t(key), "error");
    }
  } finally {
    button?.removeAttribute("aria-busy");
  }
}
