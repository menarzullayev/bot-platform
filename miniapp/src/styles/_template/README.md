# Writing a new TezCalc style (pack)

This folder is a complete, working pack: copy it, rename it, repaint it. The core (pages, state, calculation, API,
i18n, Telegram) never changes when a style is added (DEC-002, DEC-003, DEC-010).

```
styles/<id>/
  index.ts    exports default StylePack { meta, kit, css, cssHref, tokens }
  kit.ts      the Kit: 27 factory functions (markup + paint hooks); event logic comes from contract/helpers
  pack.css    paint only: tokens for light/dark/high contrast, radii, type, borders, shadows, motion
  tokens.ts   StyleTokens: the same colours as hex (the contrast gate reads this file)
```

## Steps

1. `cp -r styles/_template styles/<id>` (id is one of `tactile | glass | fintech | techno`, see `contract/model.ts`).
2. `meta`: the style's swatch (bg / accent / key, light + dark) lives in `styles/meta.ts`. Set it there, then
   `meta: STYLE_META.<id>` in your `index.ts`. The swatch must be consistent with your tokens.
3. Replace `tokens.ts` and the token blocks at the top of `pack.css` (same hex values in both; a test checks it).
4. Rewrite `kit.ts` component by component and paint them in `pack.css`.
5. Register the loader in `styles/registry.ts`: replace the `null` of your id with `() => import("./<id>/index")`.
   From that moment the style is `available`, shows up selectable in Settings and the esbuild build ships it as its
   own lazy chunk + one CSS file (only the chosen style is downloaded).
6. Add your pack to the contract tests (see below). A style that fails them must not be registered.

## The contract (contract/types.ts)

* `Kit` has one factory per visual component. Each returns a handle `{ el, ...updaters }`; `el` carries
  `data-ui="<name>"`; named inner parts carry `data-part="<name>"`. Pages never create visuals themselves.
* State is ARIA, not classes: `aria-pressed` (toggle buttons, chips, icon buttons), `aria-checked` (radio groups:
  chooser, segmented, style picker; native `checked` for switches/checkboxes), `aria-selected` (tabs, listbox
  options), `aria-invalid` (fields). Style these attributes in CSS.
* Interactive roots are real `<button>/<input>/<select>` elements with an accessible name (text or `aria-label`).
* Use `onPress`, `radioGroup`, `resultLen`, `ui`, `part` from `contract/helpers` for behaviour: click/keyboard
  activation, roving tabindex and arrow keys for radio groups, `keepFocus` for calculator keys, haptics.
* No `innerHTML`, no inline `style` attributes (CSP `style-src 'self'`); use `h()`/`icon()` from `ui/dom` and the CSSOM
  (`el.style.setProperty` is fine; the swatch preview uses it).
* Component notes: `Chooser` root has exactly `[data-part="grid"]` (radiogroup of chips) and `[data-part="select"]`
  (native select); `Tabs` tabs have `[data-part="label"]` and optional `[data-part="badge"]`; `Sheet` has
  `[data-part="veil|panel|body"]` and a `setOpen()` that toggles `data-open`; `Table` is a scroll wrapper whose cells
  carry `data-l` (column label); `Display.setResult` sets `data-kind` (none|preview|final|error) and `data-len` (m|l|xl).

## Adaptation axes (DEC-007)

`<html>` carries `data-contrast`, `data-density`, `data-lite`, `data-fs`, `data-style` (set by `contract/axes.ts` and
`boot.ts` before the first paint). `core.css` turns them into custom properties, a pack only *reads* them:

| axis | values | what core does | what the pack must do |
|---|---|---|---|
| contrast | normal, high | `--bw: 1px / 2px`, thicker focus ring | redefine the token variables for `[data-contrast="high"]` (light, dark system, dark explicit); text pairs >= 7:1 |
| density | comfortable, compact | `--gap`, `--ctl` (control height), `--pad`, `--key-gap` | use `var(--ctl)` for control heights and `var(--gap)` for gaps; never hard-code them |
| lite | auto, on, off | `--fx: 1` or `0` (0 when on, or auto + reduced-transparency/motion or a low-memory device) | multiply every blur radius, shadow, long transition by `var(--fx)`: `blur(calc(12px * var(--fx)))`. With `--fx: 0` nothing may stay that costs GPU |
| fs | m, l, xl | `--fs: 1 / 1.12 / 1.25` | write text sizes as `calc(13px * var(--fs))` |

Tokens published as CSS variables (declare them all): `--bg --surface --ink --ink-2 --line --accent --on-accent --soft
--danger`. Shape variables `--radius --r-s --r-m` have defaults in core and may be overridden.

## CSS rules

* `core.css` owns geometry that keeps the app scroll-free down to 264x470: shell and page layout, the keypad and
  scientific grid, the chooser swap (grid <-> select by window height), tab bar and its narrow-window rule, sheet,
  toast, table, result-card cells, locked overlay. Do not override `display`, `position`, `overflow`, `flex`,
  `grid-template-*` of these (select `[data-ui=...]` and `[data-part=...]`, not the page classes `.page`, `.calc`, ...).
* A pack stylesheet loads after core.css, so equal specificity means the pack wins: keep geometry out of it.
* Right-to-left (Arabic) is automatic: use logical properties (`inline-start`, `padding-inline`, ...). Numbers and
  formulas carry `.ltr` already.
* Test at the smallest window: 264x470 (Telegram's compact window). Nothing may scroll sideways; only history,
  steps and schedules scroll inside their own panel.

## Tests

```
cd worker
npx vitest run test/miniapp/contract.test.ts   # Kit contract for every pack (happy-dom)
npx vitest run test/miniapp/contrast.test.ts   # WCAG gate over tokens.ts (light, dark, high contrast)
npx vitest run test/miniapp/registry.test.ts   # registry, fallback, applyStyle
npx vitest run test/miniapp/pages.test.ts      # the six real pages drawn by the pack's kit (and re-drawn on a style switch)
npx tsc --noEmit && npm run typecheck:app && npx vitest run && npm run build   # the full gate
```

`contract.test.ts`, `registry.test.ts` and `pages.test.ts` use `PACKS` (worker/test/miniapp/dom-src.ts) and a `vi.mock` of
your `pack.css?url` (copy the two existing lines: vite cannot serve CSS from outside the worker root, the production build can);
`contrast.test.ts` has its own `TOKEN_PACKS` list (tokens + pack.css path). Add your pack to all of them. The `_template`
pack is in the lists as the reference implementation.

## Strings

User-visible text lives in `miniapp/src/strings.ts` (7 languages). A style needs no strings except its name
(`style_<id>`), which already exists for all four ids.
