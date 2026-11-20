// @@NAME@@ pack entry (style id "@@ID@@"). This file is the generator's template: `npm run new-style -- <id> "<Name>"` copies it.
// After copying: point `meta` at your own entry of styles/meta.ts (add the swatch there),
// import your tokens, and register the loader in styles/registry.ts (replace the `null` of your id).
// `?url` is the pack stylesheet as a CSP-safe file (emitted as pack-<hash>.css by the production build).

import { STYLE_META } from "../meta";
import type { StylePack } from "../../contract/types";
import { templateKit } from "./kit";
import cssHref from "./pack.css?url";
import { templateTokens } from "./tokens";

const pack: StylePack = {
  meta: STYLE_META.techno, // placeholder id: use your own style id here (the generator replaces this note)
  kit: templateKit,
  cssHref,
  tokens: templateTokens,
};
export default pack;
