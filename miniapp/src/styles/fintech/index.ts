// Fintech pack entry. `?url` is the pack stylesheet as a CSP-safe file: the production build emits it as
// pack-<hash>.css (miniapp/build.mjs, "pack-css" plugin); the registry links it when the style is applied.

import { STYLE_META } from "../meta";
import type { StylePack } from "../../contract/types";
import { fintechKit } from "./kit";
import cssHref from "./pack.css?url";
import { drawFintechShareCard } from "./share";
import { fintechTokens } from "./tokens";

const pack: StylePack = { meta: STYLE_META.fintech, kit: fintechKit, cssHref, tokens: fintechTokens, drawShareCard: drawFintechShareCard };
export default pack;
