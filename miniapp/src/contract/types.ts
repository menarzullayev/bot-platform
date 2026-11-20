// The style contract (DEC-002/003): every visual style ("pack") implements `Kit`, a set of factory functions that
// build DOM for the headless core. Pages (calc, convert, graph, solve, finance, settings) never create visual
// elements themselves; they call `ctx.kit.*` and read/update the returned handles.
//
// RULES FOR EVERY KIT (enforced by worker/test/miniapp/contract.test.ts):
//  1. A factory returns a handle `{ el, ...updaters }`. `el` is the component root and carries `data-ui="<name>"`
//     (names in this file's comments). Inner parts that core CSS or other code must find carry `data-part="<name>"`.
//  2. State lives in ARIA attributes, never in style-only classes: aria-pressed (toggle buttons), aria-checked
//     (radio/switch/check), aria-selected (tabs, listbox options), aria-invalid (fields), aria-busy.
//     CSS in the pack selects on those attributes.
//  3. Interactive roots are real focusable elements (button/input/select) with an accessible name
//     (visible text or aria-label). Pointer + keyboard activation both call the callback exactly once.
//  4. No innerHTML, no inline style attributes (CSP: style-src 'self'); use `h()`/`icon()` from ui/dom and the CSSOM.
//  5. Colours come from the CSS custom properties of `StyleTokens`; geometry-critical layout (the "no page scroll at
//     264x470" rules) lives in core.css keyed on data-ui/data-part, so a pack only paints.
//  6. Honour the axes (see `Axes`): `--fx` (0 = no blur/shadow/animation effects), `--fs` (font scale),
//     `--gap`/`--ctl` (density), `data-contrast` (token override) — read them from CSS, do not branch in JS.

import type { Child } from "../ui/dom";
import type { ShareData, ShareSize, StyleId, StyleMeta, StyleTokens, TokenSet } from "./model";

export * from "./model";
export type { Child };

/** Name of an icon known to ui/dom `icon()`. */
export type IconName = string;

export interface Handle<E extends HTMLElement = HTMLElement> {
  /** Component root (`data-ui` is set on it). */
  readonly el: E;
}

// ---------- buttons ----------

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonOptions {
  /** Visible text. Rendered inside `[data-part="label"]` so core CSS can hide it on very short screens. */
  label?: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: "normal" | "slim";
  /** Full-width button. */
  block?: boolean;
  /** Required when there is no `label`. */
  ariaLabel?: string;
  title?: string;
  onClick(): void;
}
export interface ButtonHandle extends Handle<HTMLButtonElement> {
  setLabel(text: string): void;
  setDisabled(disabled: boolean): void;
}

export interface IconButtonOptions {
  icon: IconName;
  /** Accessible name (there is no visible text). */
  label: string;
  /** Present => toggle button: `aria-pressed` is maintained. */
  pressed?: boolean;
  shape?: "plain" | "round";
  /** Icon size in px (default 20). */
  size?: number;
  onClick(): void;
}
export interface IconButtonHandle extends Handle<HTMLButtonElement> {
  setPressed(pressed: boolean): void;
}

export type KeyKind = "digit" | "op" | "fn" | "eq" | "ctl";
export interface KeyOptions {
  /** Stable id of the key (`data-key`), e.g. "7", "add", "ac", "eq". Packs may style single keys through it. */
  id: string;
  kind: KeyKind;
  label: string;
  ariaLabel?: string;
  /** Called on press. Keys must not steal focus from the expression field (mousedown is prevented). */
  onPress(): void;
}
export type KeyHandle = Handle<HTMLButtonElement>;

export interface ChipOptions {
  label: string;
  ariaLabel?: string;
  /** Present => toggle chip with aria-pressed. */
  pressed?: boolean;
  /** Keep focus where it is (calculator toolbar chips). */
  keepFocus?: boolean;
  onClick(): void;
}
export interface ChipHandle extends Handle<HTMLButtonElement> {
  setLabel(text: string): void;
  setPressed(pressed: boolean): void;
}

// ---------- calculator display ----------

export type ResultKind = "none" | "preview" | "final" | "error";
export interface DisplayOptions {
  placeholder: string;
  /** aria-label of the expression input. */
  inputLabel: string;
  onInput(): void;
  onEnter(): void;
  /** Click on the result line (used to copy a final result). */
  onResultClick(): void;
}
export interface DisplayHandle extends Handle<HTMLElement> {
  /** The expression `<input>` (core owns its value and selection). */
  readonly input: HTMLInputElement;
  /** Small line above the input ("2+2 ="). */
  setPrev(text: string): void;
  /** Result line (role=status, aria-live=polite, tabindex=0). Must set `data-kind` and `data-len` (m|l|xl by text length). */
  setResult(text: string, kind: ResultKind): void;
}

// ---------- surfaces ----------

export interface CardOptions {
  tone?: "plain" | "error";
  /** Extra layout hook classes owned by core.css (e.g. "form fgrid"). */
  class?: string;
}

export interface Stat {
  label: string;
  value: string;
}
export interface ResultData {
  /** Small caption above the main value(s). */
  title?: string;
  /** Caption of the (first) main value, e.g. "Monthly payment". */
  mainLabel?: string;
  /** Main value lines (the hero number, or several result lines). */
  main?: string[];
  /** Secondary label/value cells. */
  stats?: Stat[];
  /** Muted single line below (rate line). */
  hint?: string;
  /** Status line below; `warn` styles it as a warning, `busy` shows a spinner before the text. null/undefined clears it. */
  note?: { text: string; warn?: boolean; busy?: boolean } | null;
}
export interface ResultCardOptions {
  /**
   * hero = one big accented number with a caption, then stat cells (finance);
   * value = one big plain value (converter output);
   * lines = several equal result lines under a caption (solve).
   */
  variant?: "hero" | "value" | "lines";
  /** Main text is a live region and focusable (converter output). */
  live?: boolean;
  /** Click on the main value (copy). */
  onMainClick?(): void;
  class?: string;
}
export interface ResultCardHandle extends Handle<HTMLElement> {
  update(data: ResultData): void;
  /** Slot at the bottom for action buttons (empty by default). */
  readonly actions: HTMLElement;
}

export interface NoticeOptions {
  kind: "info" | "error" | "warn";
  /** Strong first part. */
  title?: string;
  text?: string;
}
export interface NoticeHandle extends Handle<HTMLElement> {
  update(o: NoticeOptions): void;
}

export interface ToastHandle extends Handle<HTMLElement> {
  /**
   * Sets text/kind (`data-kind` ok|error) and shows or hides the toast. While visible the root has the attribute
   * `data-show` (core.css positions and fades it on that). Core owns the timer and appends `el` to document.body once.
   */
  set(text: string, kind: "ok" | "error", visible: boolean): void;
}

export interface BadgeOptions {
  label: string;
  tone: "pro" | "free";
}

export interface LockedOverlayOptions {
  /** Teaser content shown blurred/dimmed behind the lock. */
  preview: Node;
  title: string;
  text: string;
  actionLabel: string;
  onAction(): void;
}

export interface SpinnerOptions {
  /** Accessible name (role=status). */
  label: string;
}

export type TextKind = "hint" | "label" | "empty";
export interface TextOptions {
  kind: TextKind;
  text?: string;
  tone?: "warn";
  align?: "center";
  /** Isolate as left-to-right (numbers, formulas). */
  ltr?: boolean;
}
export interface TextHandle extends Handle<HTMLElement> {
  setText(text: string): void;
}

// ---------- form controls ----------

export interface FieldOptions {
  /** Visible label above the input; omit for an input named only by `ariaLabel`. */
  label?: string;
  ariaLabel: string;
  value?: string;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "search" | "numeric";
  type?: "text" | "search";
  size?: "normal" | "big";
  maxLength?: number;
  /** Isolate input direction as LTR (math, numbers). Default true. */
  ltr?: boolean;
  onInput?(value: string): void;
  onEnter?(): void;
}
export interface FieldHandle extends Handle<HTMLLabelElement> {
  readonly input: HTMLInputElement;
  setValue(value: string): void;
  /** Sets aria-invalid and an optional tooltip/message. */
  setInvalid(invalid: boolean, message?: string): void;
}

export interface SelectOptions {
  ariaLabel: string;
  text: string;
  /** Opens a picker (the control is a button, not a native select). */
  onClick(): void;
}
export interface SelectHandle extends Handle<HTMLButtonElement> {
  setText(text: string): void;
}

export interface ChooserOptions<T extends string> {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  /** Accessible name of the group. */
  label: string;
  /** Larger chips (language list). */
  roomy?: boolean;
  /** BCP-47 `lang` per option, same order as `options`. */
  langs?: ReadonlyArray<string>;
  onPick(value: T): void;
}
export interface ChooserHandle<T extends string> extends Handle<HTMLElement> {
  setValue(value: T): void;
}
// A chooser root has exactly two children: `[data-part="grid"]` (role=radiogroup of chips, aria-checked) and
// `[data-part="select"]` (a native <select> with the same options). core.css shows one or the other by window height.

export interface SegmentedOptions<T extends string> {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  label?: string;
  onPick(value: T): void;
}
export interface SegmentedHandle<T extends string> extends Handle<HTMLElement> {
  setValue(value: T): void;
}

export interface ToggleOptions {
  label: string;
  checked: boolean;
  /** switch = settings row; check = inline checkbox. */
  kind?: "switch" | "check";
  onChange(checked: boolean): void;
}
export interface ToggleHandle extends Handle<HTMLLabelElement> {
  readonly input: HTMLInputElement;
  setChecked(checked: boolean): void;
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Live while dragging. */
  onInput?(value: number): void;
  /** On release. */
  onChange(value: number): void;
}
export interface SliderHandle extends Handle<HTMLElement> {
  readonly input: HTMLInputElement;
  setValue(value: number): void;
}

export interface RowOptions {
  /** Row caption (text or nodes, e.g. caption + value). */
  label?: Child;
  class?: string;
}

// ---------- navigation ----------

export interface TabSpec {
  id: string;
  icon: IconName;
  label: string;
  /** Small badge on the tab (Pro). */
  badge?: string;
}
export interface TabsOptions {
  tabs: ReadonlyArray<TabSpec>;
  active: string;
  onSelect(id: string): void;
}
export interface TabsHandle extends Handle<HTMLElement> {
  setActive(id: string): void;
}
// Tabs: root `<nav role=tablist>`; each tab is a `<button role=tab aria-label aria-selected data-tab=id>` with
// `[data-part="label"]` (text) and optional `[data-part="badge"]`. On very narrow windows core.css hides the label of
// inactive tabs visually (aria-label remains), so six tabs always fit.

// ---------- overlays ----------

export interface SheetOptions {
  title: string;
  closeLabel: string;
}
export interface SheetParts extends Handle<HTMLElement> {
  /** Scrollable content area. */
  readonly body: HTMLElement;
  /** Backdrop; core closes the sheet on click. */
  readonly veil: HTMLElement;
  /** Close button; core closes the sheet on click. */
  readonly closeButton: HTMLElement;
  /** Show/hide transition hook (set `data-open`). */
  setOpen(open: boolean): void;
}
// The sheet root is `role=dialog aria-modal=true aria-label=title`. core owns behaviour (Escape, Telegram BackButton,
// removal) in ui/overlays.ts; the kit only supplies markup/paint.

export interface TableOptions {
  columns: ReadonlyArray<string>;
  rows?: ReadonlyArray<ReadonlyArray<string>>;
}
export interface TableHandle extends Handle<HTMLElement> {
  setRows(rows: ReadonlyArray<ReadonlyArray<string>>): void;
}
// Table root is the scroll wrapper; inside is a <table dir=ltr> whose cells carry `data-l` = column label, which
// core.css uses to turn rows into labelled blocks on narrow windows.

export interface ListItemOptions {
  primary: string;
  secondary?: string;
  /** split: primary left, secondary right. stacked: secondary line above, primary line below (history). */
  layout: "split" | "stacked";
  ariaLabel?: string;
  /** Pass "option" inside a listbox (picker). */
  role?: "option";
  selected?: boolean;
  primaryLtr?: boolean;
  secondaryLtr?: boolean;
  onClick(): void;
}
export type ListItemHandle = Handle<HTMLButtonElement>;

export interface StepItem {
  name: string;
  body: Node[];
}
export type StepListHandle = Handle<HTMLOListElement>;

export interface PlotFrameHandle extends Handle<HTMLElement> {
  /** The drawing surface; core attaches pointer/wheel handlers and paints with the token colours. */
  readonly canvas: HTMLCanvasElement;
}

export interface StyleOption {
  id: StyleId;
  name: string;
  swatch: StyleMeta["swatch"];
  available: boolean;
}
export interface StylePickerOptions {
  options: ReadonlyArray<StyleOption>;
  value: StyleId;
  label: string;
  /** Text of the badge on styles that are not available yet. */
  soonLabel: string;
  onPick(id: StyleId): void;
}
export interface StylePickerHandle extends Handle<HTMLElement> {
  setValue(id: StyleId): void;
}
// Style picker: `role=radiogroup`; each card is a `<button role=radio aria-checked data-style-id>`; unavailable
// styles are `aria-disabled=true` (not clickable) and show `soonLabel`. The mini preview is drawn from the swatch of
// the option itself (not of the current style) with custom properties set through the CSSOM.

// ---------- the Kit ----------

export interface Kit {
  Button(o: ButtonOptions): ButtonHandle; // data-ui="button"
  IconButton(o: IconButtonOptions): IconButtonHandle; // "icon-button"
  Key(o: KeyOptions): KeyHandle; // "key"
  Chip(o: ChipOptions): ChipHandle; // "chip"
  Display(o: DisplayOptions): DisplayHandle; // "display"
  Card(o: CardOptions, ...children: Child[]): Handle<HTMLElement>; // "card"
  ResultCard(o: ResultCardOptions): ResultCardHandle; // "result-card"
  Notice(o: NoticeOptions): NoticeHandle; // "notice"
  Toast(): ToastHandle; // "toast"
  ProBadge(o: BadgeOptions): Handle<HTMLElement>; // "pro-badge"
  LockedOverlay(o: LockedOverlayOptions): Handle<HTMLElement>; // "locked-overlay"
  Spinner(o: SpinnerOptions): Handle<HTMLElement>; // "spinner"
  Text(o: TextOptions): TextHandle; // "text"
  Field(o: FieldOptions): FieldHandle; // "field"
  Select(o: SelectOptions): SelectHandle; // "select"
  Chooser<T extends string>(o: ChooserOptions<T>): ChooserHandle<T>; // "chooser"
  Segmented<T extends string>(o: SegmentedOptions<T>): SegmentedHandle<T>; // "segmented"
  Toggle(o: ToggleOptions): ToggleHandle; // "toggle"
  Slider(o: SliderOptions): SliderHandle; // "slider"
  Row(o: RowOptions, ...children: Child[]): Handle<HTMLElement>; // "row"
  Tabs(o: TabsOptions): TabsHandle; // "tabs"
  Sheet(o: SheetOptions): SheetParts; // "sheet"
  Table(o: TableOptions): TableHandle; // "table"
  ListItem(o: ListItemOptions): ListItemHandle; // "list-item"
  StepList(items: ReadonlyArray<StepItem>): StepListHandle; // "step-list"
  PlotFrame(o: { ariaLabel: string }): PlotFrameHandle; // "plot-frame"
  StylePicker(o: StylePickerOptions): StylePickerHandle; // "style-picker"
}

/** `data-ui` value of each component root (the contract tests and core.css rely on these names). */
export const KIT_UI = {
  Button: "button",
  IconButton: "icon-button",
  Key: "key",
  Chip: "chip",
  Display: "display",
  Card: "card",
  ResultCard: "result-card",
  Notice: "notice",
  Toast: "toast",
  ProBadge: "pro-badge",
  LockedOverlay: "locked-overlay",
  Spinner: "spinner",
  Text: "text",
  Field: "field",
  Select: "select",
  Chooser: "chooser",
  Segmented: "segmented",
  Toggle: "toggle",
  Slider: "slider",
  Row: "row",
  Tabs: "tabs",
  Sheet: "sheet",
  Table: "table",
  ListItem: "list-item",
  StepList: "step-list",
  PlotFrame: "plot-frame",
  StylePicker: "style-picker",
} as const satisfies Record<keyof Kit, string>;

export const KIT_COMPONENTS = Object.keys(KIT_UI) as Array<keyof Kit>;

// ---------- the pack ----------

export interface StylePack {
  meta: StyleMeta;
  kit: Kit;
  /**
   * URL of the pack stylesheet. The CSP (style-src 'self') forbids inline <style>, so a pack's pack.css always ships
   * as its own file: `import cssHref from "./pack.css?url"`. The production build (build.mjs, "pack-css" plugin)
   * minifies it and emits pack-<hash>.css; the registry loads it with a <link id="style-pack"> on top of core.css.
   */
  cssHref: string;
  tokens: StyleTokens;
  /**
   * Optional (DEC-011): paints the share card of this style onto a 2D context of `size` (the whole canvas, opaque: JPEG has
   * no alpha). `tokens` is the token set of the scheme being shown (light/dark, high contrast already applied) and `dark`
   * says which scheme that is. Must only use the system font stack, keep text AA-readable and isolate `data.main` as LTR.
   * A pack without it simply offers no share button.
   */
  drawShareCard?(ctx: CanvasRenderingContext2D, data: ShareData, size: ShareSize, tokens: TokenSet, dark: boolean): void;
}
