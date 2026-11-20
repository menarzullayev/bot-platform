export interface Page {
  el: HTMLElement;
  /** Rebuilds the page DOM (language/theme change); page state lives in the factory closure. */
  render(): void;
  onShow?(): void;
  onHide?(): void;
}
