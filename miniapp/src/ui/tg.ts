// Thin wrapper over Telegram.WebApp (https://core.telegram.org/bots/webapps). Every call is feature-checked because
// older clients lack newer methods, and outside Telegram (plain browser) the whole object is absent: the app then
// runs in demo mode.

interface HapticApi {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

interface BackButtonApi {
  show(): void;
  hide(): void;
  onClick(fn: () => void): void;
  offClick(fn: () => void): void;
}

export interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { language_code?: string }; start_param?: string };
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  BackButton?: BackButtonApi;
  HapticFeedback?: HapticApi;
  openInvoice?(url: string, cb?: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
  onEvent(type: string, fn: () => void): void;
  offEvent?(type: string, fn: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export const tg: WebApp | null = typeof window !== "undefined" ? (window.Telegram?.WebApp ?? null) : null;
/** True only when Telegram handed us signed initData (opened as a real Mini App). */
export const inTelegram: boolean = !!tg && typeof tg.initData === "string" && tg.initData.length > 0;

function atLeast(v: string): boolean {
  try {
    return !!tg && tg.isVersionAtLeast(v);
  } catch {
    return false;
  }
}

export function initTelegram(): void {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    // Pan gestures on the graph must not collapse the Mini App (Bot API 7.7+).
    if (atLeast("7.7")) tg.disableVerticalSwipes?.();
  } catch {
    /* an old client: nothing else to do */
  }
}

/** Matches the Telegram chrome to the app background (6.1+ header/background, 7.10+ bottom bar). */
export function syncChrome(bg: string): void {
  if (!tg) return;
  try {
    if (atLeast("6.1")) {
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
    }
    if (atLeast("7.10")) tg.setBottomBarColor?.(bg);
  } catch {
    /* ignore */
  }
}

let lastTick = 0;

export const haptic = {
  /** Light tap for key presses; throttled so fast typing does not queue vibrations. */
  tap(): void {
    const now = Date.now();
    if (now - lastTick < 35) return;
    lastTick = now;
    try {
      if (atLeast("6.1")) tg?.HapticFeedback?.impactOccurred("light");
    } catch {
      /* ignore */
    }
  },
  select(): void {
    try {
      if (atLeast("6.1")) tg?.HapticFeedback?.selectionChanged();
    } catch {
      /* ignore */
    }
  },
  result(kind: "success" | "error" | "warning"): void {
    try {
      if (atLeast("6.1")) tg?.HapticFeedback?.notificationOccurred(kind);
    } catch {
      /* ignore */
    }
  },
};

// ---- BackButton: a stack of "undo" actions (close sheet, leave tab, ...) ----
const backStack: Array<() => void> = [];
let backBound = false;

function onBack(): void {
  const fn = backStack.pop();
  refreshBack();
  fn?.();
}

function refreshBack(): void {
  if (!tg || !atLeast("6.1") || !tg.BackButton) return;
  try {
    if (backStack.length > 0) tg.BackButton.show();
    else tg.BackButton.hide();
  } catch {
    /* ignore */
  }
}

/** Registers an action for the Telegram BackButton; returns a function that unregisters it. */
export function pushBack(fn: () => void): () => void {
  if (tg && atLeast("6.1") && tg.BackButton && !backBound) {
    backBound = true;
    try {
      tg.BackButton.onClick(onBack);
    } catch {
      /* ignore */
    }
  }
  backStack.push(fn);
  refreshBack();
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
    refreshBack();
  };
}

/** Opens a Stars invoice link. Resolves with the final status ("failed" when the client cannot open invoices). */
export function openInvoice(link: string): Promise<"paid" | "cancelled" | "failed" | "pending"> {
  return new Promise((resolve) => {
    if (!tg || !atLeast("6.1") || !tg.openInvoice) {
      resolve("failed");
      return;
    }
    try {
      tg.openInvoice(link, (status) => resolve(status));
    } catch {
      resolve("failed");
    }
  });
}

export function onTelegramEvent(type: string, fn: () => void): void {
  try {
    tg?.onEvent(type, fn);
  } catch {
    /* ignore */
  }
}
