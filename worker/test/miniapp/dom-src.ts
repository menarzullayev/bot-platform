// Loads Mini App sources that use DOM types. Those files cannot be imported statically from a worker test: the worker
// tsconfig has no DOM lib (adding it breaks the Workers types), so `tsc --noEmit` must not follow the imports.
// `import.meta.glob` is vite-only and untyped here on purpose; modules are loaded lazily and typed as any.

// @ts-ignore vite-only API
const files: Record<string, () => Promise<any>> = import.meta.glob("../../../miniapp/src/**/*.ts");

export async function loadSrc(rel: string): Promise<any> {
  const load = files[`../../../miniapp/src/${rel}`];
  if (!load) throw new Error(`no such Mini App source: ${rel}`);
  return load();
}

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const STYLES_DIR = resolve(import.meta.dirname, "../../../miniapp/src/styles");

/** Folder names of the style packs under miniapp/src/styles (every folder with an index.ts). The reference `_template` is last. */
export function packDirs(): string[] {
  const dirs = readdirSync(STYLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(STYLES_DIR, d.name, "index.ts")))
    .map((d) => d.name);
  return [...dirs.filter((d) => !d.startsWith("_")).sort(), ...dirs.filter((d) => d.startsWith("_"))];
}

/**
 * Packs covered by the contract and registry tests: built from the styles/ folders, so a style made with
 * `npm run new-style` is covered the moment it exists (the generator also adds its `vi.mock` line to contract.test.ts).
 */
export const PACKS: ReadonlyArray<readonly [name: string, entry: string]> = packDirs().map((d) => [d, `styles/${d}/index.ts`] as const);

/** [pack name, its StyleTokens, path of its pack.css under miniapp/src] for the contrast gate; tokens are the `*Tokens` export of tokens.ts. */
export async function loadTokenPacks(): Promise<Array<readonly [string, any, string]>> {
  const out: Array<readonly [string, any, string]> = [];
  for (const d of packDirs()) {
    const mod = await loadSrc(`styles/${d}/tokens.ts`);
    const key = Object.keys(mod).find((k) => /Tokens$/.test(k));
    if (!key) throw new Error(`styles/${d}/tokens.ts exports no *Tokens constant`);
    out.push([d, mod[key], `styles/${d}/pack.css`]);
  }
  return out;
}
