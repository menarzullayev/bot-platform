import { transliterateMessages } from "./translit";
import type { Messages } from "./types";
import { uzLatn } from "./uz-latn";

// Never hand-edit: derived deterministically from uz-latn.ts.
export const uzCyrl: Messages = transliterateMessages(uzLatn);
