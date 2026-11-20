// Behaviour helpers shared by every kit, so a new style only writes markup and paint, not event logic.
// (A kit is free to ignore them, but the contract tests check the same behaviours for every pack.)

import { haptic } from "../ui/tg";

/** Marks a component root. */
export function ui<E extends HTMLElement>(el: E, name: string): E {
  el.dataset.ui = name;
  return el;
}

/** Marks an inner part that core CSS / other code must be able to find. */
export function part<E extends HTMLElement>(el: E, name: string): E {
  el.dataset.part = name;
  return el;
}

export interface PressOptions {
  /** Prevent the mousedown focus change (keys keep the caret in the expression field). */
  keepFocus?: boolean;
  /** Haptic flavour; null = none. Default "select". */
  haptic?: "tap" | "select" | null;
}

/** Click (pointer and keyboard activation of a <button>) -> haptic + callback, exactly once per activation. */
export function onPress(el: HTMLElement, fn: () => void, o: PressOptions = {}): void {
  if (o.keepFocus) el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", () => {
    const kind = o.haptic === undefined ? "select" : o.haptic;
    if (kind) haptic[kind]();
    fn();
  });
}

export interface RadioGroup<T extends string> {
  /** Paints the checked state (aria-checked + roving tabindex) without calling onPick. */
  set(value: T): void;
}

/**
 * Radio-group behaviour for buttons with role=radio: aria-checked, roving tabindex, click and arrow/Home/End keys
 * (arrows follow the document direction, so they mirror in Arabic). `onPick` is called for user actions only.
 */
export function radioGroup<T extends string>(items: ReadonlyMap<T, HTMLElement>, value: T, onPick: (v: T) => void, extraPaint?: (v: T) => void): RadioGroup<T> {
  const keys = [...items.keys()];
  const set = (v: T): void => {
    for (const [k, b] of items) {
      b.setAttribute("aria-checked", String(k === v));
      b.tabIndex = k === v ? 0 : -1;
    }
    extraPaint?.(v);
  };
  const pick = (v: T): void => {
    haptic.select();
    set(v);
    onPick(v);
  };
  for (const [k, b] of items) {
    b.addEventListener("click", () => pick(k));
    b.addEventListener("keydown", (e) => {
      const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
      const i = keys.indexOf(k);
      let next = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i + (e.key === "ArrowRight" && rtl ? -1 : 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i + (e.key === "ArrowLeft" && rtl ? 1 : -1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = keys.length - 1;
      else return;
      e.preventDefault();
      next = (next + keys.length) % keys.length;
      const target = items.get(keys[next]);
      pick(keys[next]);
      target?.focus();
    });
  }
  set(value);
  return { set };
}

/** Text length bucket for the calculator result (long results shrink instead of scrolling sideways). */
export function resultLen(text: string): "m" | "l" | "xl" {
  return text.length > 15 ? "xl" : text.length > 11 ? "l" : "m";
}
