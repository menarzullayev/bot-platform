# Adding a style to TezCalc

The Mini App draws every screen through a **style pack** (DEC-002, DEC-003). The pages, calculation, API, i18n and Telegram
integration (the *core*) never change when a style is added; a style is its own folder of markup + paint, loaded lazily,
guarded by tests (DEC-017). A new style takes about 1-2 days (DEC-010); the skeleton below is ready in a minute.

## 1. Architecture

```
miniapp/src/
  core.css            geometry that keeps the app scroll-free down to 264x470, axis variables (--fs --fx --gap --ctl --bw)
  main.ts boot.ts     shell, tabs, session; boot.ts puts theme/style/axes on <html> before the first paint
  ui/  lib/           core: pages (calc, convert, graph, solve, finance, settings), state, API client, calculation
  contract/           the interface between core and styles (DOM-free where possible)
    types.ts            Kit (27 factories), StylePack, KIT_UI
    model.ts            STYLE_IDS, StyleTokens, TOKEN_VARS, axes
    helpers.ts axes.ts  onPress, radioGroup, resultLen, ui/part; applying the four axes
  styles/
    registry.ts         LOADERS: id -> () => import("./<id>/index")  (lazy; only the chosen pack is downloaded)
    meta.ts             swatch of every style (the picker draws them without loading a pack)
    <id>/               index.ts (StylePack) - kit.ts (markup) - pack.css (paint) - tokens.ts (colours) [- share.ts]
    _template/          the reference pack the generator copies
```

```
user picks style --> state.style --> registry.loadStyle(id) --import()--> styles/<id>/index.ts
                                           |                                   |
                       falls back to FALLBACK_STYLE                  kit (factories)  cssHref (pack-<hash>.css)
                       if the pack is missing/offline                         |
                                           +--> applyStyle(pack): <html data-style>, one <link id="style-pack">, pages re-render with the new kit
```

* Pages never create visuals: they call `ctx.kit.Button(...)`, `ctx.kit.Display(...)`, ... The kit returns `{ el, ...updaters }`.
* State is ARIA (`aria-pressed`, `aria-checked`, `aria-selected`, `aria-invalid`), not classes. Event logic comes from `contract/helpers`.
* CSP is `style-src 'self'`: no `innerHTML`, no inline style attributes, the pack stylesheet is a file (`pack.css?url`, emitted by the
  esbuild plugin of `miniapp/build.mjs` as `pack-<hash>.css`). System fonts only.
* Details of the contract: `miniapp/src/styles/_template/README.md`.

### Adaptation axes (DEC-007)

`<html>` carries `data-contrast`, `data-density`, `data-lite`, `data-fs`; `core.css` turns them into variables that a pack only *reads*:

| axis | values | variable | the pack must |
|---|---|---|---|
| contrast | normal, high | `--bw` | redefine the tokens for `[data-contrast="high"]` (text pairs 7:1) |
| density | comfortable, compact | `--gap --ctl --pad --key-gap` | use `var(--ctl)` / `var(--gap)`, never hard-code control heights or gaps |
| lite | auto, on, off | `--fx` (1 or 0) | multiply blur, shadow and long transitions by `var(--fx)`; at 0 nothing may cost GPU |
| font size | m, l, xl | `--fs` (1 / 1.12 / 1.25) | write sizes as `calc(13px * var(--fs))` |

### Brand rules (DEC-008, DEC-009)

* One brand core in every style: the mark (= and the bolt), the wordmark and the brand colour are identical everywhere; each style derives its
  palette from that colour. The share card draws the mark with `drawMark` (`styles/share-kit.ts`); the avatar and Stars cards are style-independent.
* Brand colour (vermilion): **light `#ab3409` (text on it `#ffffff`), dark `#ff9254` (text on it `#2a1202`)**. In high contrast the accent may be
  darkened (light) or lightened (dark) to reach 7:1; in normal mode it is never changed.
* The accent is the interaction colour (`--accent`); green/red are semantic (`--danger`), never the accent. A style gets its character from
  surfaces, shapes, type and motion, not from a different brand colour.

## 2. Create the skeleton: `new-style`

```
cd worker
npm run new-style -- <id> "<Name>" [--dry-run]
```

* `id` must match `^[a-z][a-z0-9-]{2,20}$`, not be registered yet and not exist as a folder. `--dry-run` prints what would happen.
* Creates `miniapp/src/styles/<id>/{index.ts,kit.ts,pack.css,tokens.ts}` from `_template` and adds the pack's `vi.mock` line to
  `worker/test/miniapp/contract.test.ts`. The pack lists of the contract, registry and contrast tests are built from the `styles/*` folders,
  so nothing else is registered in the tests.
* The skeleton is a complete working pack and passes `npm run typecheck:app`, the contract tests and the contrast gate **before you change
  anything**. It is not registered, so it is not in the picker yet.
* **Registration is manual on purpose** (DEC-010); the command prints the exact checklist with ready-to-paste lines:

  1. `miniapp/src/contract/model.ts`: add the id to `STYLE_IDS`.
  2. `miniapp/src/styles/meta.ts`: add the swatch (it must equal your tokens).
  3. `miniapp/src/styles/<id>/index.ts`: `meta: STYLE_META.<id>`.
  4. `miniapp/src/styles/registry.ts`: add the loader to `LOADERS` (this makes the style selectable and lazy).
  5. `miniapp/src/catalog-keys.json`: add `style_<id>`.
  6. `worker/src/i18n/types.ts` (two key lists) and the 7 dictionaries `worker/src/i18n/{ar,en,es,ru,tr,uz-latn,uz-cyrl}.ts`: the name `style_<id>`.
  7. `worker/src/templates/calc/style.ts`: add the id to the server-side `STYLE_IDS` (settings API, `/style`).
  8. Optional: `site/build.mjs` + `site/src/texts.mjs` (landing demo), `styles/<id>/share.ts` (share card).

## 3. Start from the atlas: `atlas-import`

```
cd worker
npm run atlas-import -- <atlas-style-id> [--as <id>] [--name "<Name>"] [--force] [--dry-run]
```

Reads `styles/<atlas-style-id>/style.json` of the design-styles atlas (`DESIGN_STYLES_DIR`, default `../design-styles`) and writes the initial
`tokens.ts` and the token blocks of `pack.css` (creating the skeleton first when the folder does not exist; `--force` overwrites the tokens of an
existing pack). Atlas entry ids longer than 21 characters need `--as`.

* Colours: `bg`, `surface`, `text`→`ink`, `muted`→`ink2`, `border`→`line`, `danger`. The atlas palette is one scheme (detected by the luminance of
  `bg`); the other scheme and both high-contrast sets are derived.
* The brand accent is forced (DEC-009, see above); the atlas accents are ignored.
* Pairs rejected by the contrast gate are repaired automatically (text moves away from its background in 1% lightness steps; for the forced accent the
  surface it sits on moves). The report lists every repair `set.token: from -> to (why)`; the import fails without writing if a pair cannot be repaired.
* `radius` becomes `--radius/--r-m/--r-s`; shadow, border width and fonts are kept in `atlasReference` (tokens.ts) and as a comment in `pack.css`.

The result is a **starting point**: the atlas draws a flowchart/dashboard/card, the Mini App needs a keypad, a display and six pages. Rewrite `kit.ts` /
`pack.css` component by component, keeping `data-ui`, `data-part` and the ARIA state.

## 4. The gates a style must pass

| gate | command | what it checks |
|---|---|---|
| types | `npx tsc --noEmit && npm run typecheck:app` | worker and Mini App compile |
| contract | `npx vitest run test/miniapp/contract.test.ts` | every Kit component: root, ARIA state, keyboard, RTL, the 4 axes in the pack CSS (font scale, `--fx`, `--ctl`, `--gap`, high contrast), light mode |
| contrast | `npx vitest run test/miniapp/contrast.test.ts` | WCAG over `tokens.ts` (light, dark, high contrast); `pack.css` repeats exactly those colours |
| registry | `npx vitest run test/miniapp/registry.test.ts` | availability, fallback, applying a pack |
| pages | `npx vitest run test/miniapp/pages.test.ts` | the six real pages drawn by the kit |
| everything | `npx tsc --noEmit && npm run typecheck:app && npx vitest run && npm run build` | the full gate (the same as CI) |
| screenshots | `npm run shots` | pixels + layout, see section 5 |

Contrast rules (`worker/test/miniapp/style-gate.ts`): normal: text pairs 4.5:1 (AA), accent on the page 3:1, accent on `soft` 4.5:1, `onAccent` on accent 4.5:1,
danger 4.5:1; high contrast: all text pairs 7:1, accent on the page 4.5:1, `line` on the page 3:1. A style that does not pass must not be registered.

## 5. Screenshot regression (DEC-017)

```
cd worker
npm run shots           # compare with miniapp/shots/baseline/<platform>/   (exit 1 on a difference or a layout violation)
npm run shots:update    # re-take the baseline (after an intentional visual change, or for a new style)
```

* Matrix: every `STYLE_IDS` style x light/dark x 264x470, 360x640, 412x915 x the six pages (calculator, converter, graph, solve, finance, settings) in
  the main state: 144 shots for four styles, about 40 s, baseline about 6 MB per platform (PNG, no alpha, re-encoded with maximum compression).
  Options: `--styles a,b --themes light --viewports 264x470 --pages calc,settings --threshold 0.001 --headed --keep-build`.
* Deterministic: the app is built into a temp dir and served locally in demo mode (no API), animations and transitions off, reduced motion, fixed `Date`,
  fixed `Math.random`, fixed language, the Telegram SDK request aborted, system fonts, DPR 1.
* Compare: `pixelmatch` (colour threshold 0.1, anti-aliasing ignored); more than **0.1 %** different pixels fails and the diff image is written to
  `miniapp/shots/diff/`. A changed size fails too. The images of the last run are in `miniapp/shots/actual/` (both folders are git-ignored).
* Layout checks run on every shot (they do not depend on fonts): the document and the visible page must not scroll sideways, the document must not be taller than
  the window, the page must not scroll vertically - **failures**; clipped or off-window elements and single words broken over several lines are printed as
  warnings.
* Baselines are **per platform** (`baseline/win32`, `baseline/linux`, ...): system fonts differ, so a Windows baseline cannot be compared on Linux. CI runs on
  Linux (job `shots`, parallel to the main CI, chromium cached). While `miniapp/shots/baseline/linux/` does not exist, CI sets `SHOTS_ALLOW_MISSING=1`
  (a warning instead of a failure); take the images from the `shots-actual` artifact of a CI run (or run `shots:update` on Linux), commit them and remove
  that variable from `.github/workflows/ci.yml`.
* First use on a machine: `npx playwright-core install chromium` (CI does it by itself).
* Update the baseline only after looking at the diff: open `miniapp/shots/diff/*.diff.png` (red = changed pixels) next to the baseline image.

## 6. Checklist for a new style

1. `npm run new-style -- <id> "<Name>"` (or `npm run atlas-import -- <atlas-id> --as <id>`).
2. Palette in `tokens.ts` + the token blocks of `pack.css` (same hex values); brand accent per DEC-009; `npx vitest run test/miniapp/contrast.test.ts`.
3. `kit.ts` component by component (keep `data-ui`, `data-part`, ARIA, helpers); `pack.css` paint only; no geometry of core-owned parts.
4. The four axes: sizes `calc(Npx * var(--fs))`, `var(--ctl)`, `var(--gap)`, effects x `var(--fx)`, high-contrast tokens.
5. Register (section 2, steps 1-7); `npx vitest run` and `npm run build` are green.
6. Look at it at 264x470 in a real Telegram window and in both themes; nothing scrolls sideways.
7. Optional share card (`share.ts`, `drawShareCard`): AA pairs, system fonts, one JPEG <= 60 KB (`share.test.ts`).
8. `npm run shots:update`, review the new images (and the warnings), commit the new baseline images with the style.
9. Add `style-<id>.test.ts` for what is specific to the style (key faces, effects), like `style-tactile.test.ts`.
10. Roles: the style is free for everyone (DEC-006); it does not change the Pro features.
