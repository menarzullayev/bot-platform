// Tactile pack entry (the default style, DEC-009). `?url` is the pack stylesheet as a CSP-safe file: the production build
// emits it as pack-<hash>.css (miniapp/build.mjs, "pack-css" plugin); the registry links it when the style is applied.

import { STYLE_META } from "../meta";
import type { StylePack } from "../../contract/types";
import { tactileKit } from "./kit";
import cssHref from "./pack.css?url";
import { drawTactileShareCard } from "./share";
import { tactileTokens } from "./tokens";

const pack: StylePack = { meta: STYLE_META.tactile, kit: tactileKit, cssHref, tokens: tactileTokens, drawShareCard: drawTactileShareCard };
export default pack;
