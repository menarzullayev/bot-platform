import type { Kit } from "../../contract/types";

export interface Page {
  el: HTMLElement;
  /** Rebuilds the page DOM (language/theme/style change); page state lives in the factory closure. */
  render(): void;
  onShow?(): void;
  onHide?(): void;
}

/** What the core hands to every page. `kit` is read at render time, so it always is the active style's kit. */
export interface PageCtx {
  readonly kit: Kit;
}
