# TezCalc brand assets (DEC-008, DEC-009, DEC-011)

`node brand/build.mjs` (or `npm run brand` in `worker/`) turns `brand/src/*.svg` into `brand/out/*`.
`brand/out` is committed; copying it to the site (`/brand/<name>`) is the site build's job.

| File | Size | Use |
|---|---|---|
| avatar.jpg | 640x640 | BotFather /setuserpic (round-crop safe: glyph within the centre 50%) |
| description.jpg | 640x360 | BotFather /setdescriptionpic |
| stars-pro.jpg | 640x360 | createInvoiceLink `photo_url` (shows the default price, 150 Stars) |
| thumb-calc / convert / loan / error.jpg | 128x128 | inline results `thumbnail_url` |
| og.jpg | 1200x630 | social preview |
| mark.svg, favicon.svg | vector | logo, favicon |

- Colours: `src/tokens.json` only (DEC-009: `#ab3409` / `#ff9254`, accent-2 `#b4231f` / `#ff6f91`). SVG sources use `{{token}}` placeholders.
- Text is pre-converted to paths (`src/glyphs.json`, Roboto Medium, Apache-2.0) so output does not depend on installed fonts.
  Regenerate with `python brand/tools/text2path.py <Roboto-Medium.ttf>` only when a string changes.
- JPEG encoding is pure JS (`jpeg-js`, quality 90): byte-identical across machines. SVG rasterising: `@resvg/resvg-js`.
- `out/avatar-preview-round.png` is a git-ignored helper showing the round crop.
- If `proStars` changes from 150, edit the `star150` string in `tools/text2path.py` and rebuild.
