// Techno (HUD) pack entry. `?url` is the pack stylesheet as a CSP-safe file: the production build emits it as
// pack-<hash>.css (miniapp/build.mjs, "pack-css" plugin); the registry links it when the style is applied.

import { STYLE_META } from "../meta";
import type { StylePack } from "../../contract/types";
import { technoKit } from "./kit";
import cssHref from "./pack.css?url";
import { drawTechnoShareCard } from "./share";
import { technoTokens } from "./tokens";

const pack: StylePack = { meta: STYLE_META.techno, kit: technoKit, cssHref, tokens: technoTokens, drawShareCard: drawTechnoShareCard };
export default pack;
