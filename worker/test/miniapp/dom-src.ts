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

/** Packs covered by the contract and registry tests. Add yours here (see styles/_template/README.md). */
export const PACKS: ReadonlyArray<readonly [name: string, entry: string]> = [
  ["fintech", "styles/fintech/index.ts"],
  ["_template", "styles/_template/index.ts"],
];
