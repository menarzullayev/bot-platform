// Builds the Mini App: esbuild bundle (ESM, code-split, minified, hashed names, no source maps) + generated index.html.
// Output: worker/public/app/  (served by the Worker through the ASSETS binding; ignored by git, built in CI/deploy).
//
//   node miniapp/build.mjs            (npm run build:app in worker/)
//
// The i18n plugin keeps only the catalog keys listed in src/catalog-keys.json in the bundled dictionaries.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
// esbuild is a devDependency of worker/; resolve it from there (miniapp/ has no node_modules of its own)
const requireFromWorker = createRequire(resolve(root, "worker/package.json"));
const esbuild = requireFromWorker("esbuild");

const DICTIONARY_FILE = /[\\/]worker[\\/]src[\\/]i18n[\\/](ar|en|es|ru|tr|uz-latn)\.ts$/;

/** Replaces each bot dictionary module with a literal containing only the whitelisted keys. */
function i18nSubsetPlugin(keys) {
  const wanted = new Set(keys);
  return {
    name: "i18n-subset",
    setup(build) {
      build.onLoad({ filter: DICTIONARY_FILE }, async (args) => {
        const out = await esbuild.build({ entryPoints: [args.path], bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent" });
        const mod = { exports: {} };
        new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, requireFromWorker);
        const name = Object.keys(mod.exports).find((k) => typeof mod.exports[k] === "object");
        if (!name) throw new Error("no dictionary export in " + args.path);
        const subset = Object.fromEntries(Object.entries(mod.exports[name]).filter(([k]) => wanted.has(k)));
        return { contents: `export const ${name} = ${JSON.stringify(subset)};`, loader: "js" };
      });
    },
  };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * @param {{ outDir?: string, minify?: boolean }} [opts]
 * @returns {Promise<{ outDir: string, files: {name: string, bytes: number, gzip: number}[], total: {raw: number, gzip: number}, entryJs: string, entryCss: string }>}
 */
export async function buildApp(opts = {}) {
  const outDir = resolve(opts.outDir ?? resolve(root, "worker/public/app"));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const keys = JSON.parse(readFileSync(resolve(here, "src/catalog-keys.json"), "utf8"));

  const result = await esbuild.build({
    entryPoints: { main: resolve(here, "src/main.ts") },
    outdir: outDir,
    entryNames: "[name]-[hash]",
    chunkNames: "chunk-[hash]",
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2022", "chrome100", "safari15"],
    minify: opts.minify ?? true,
    sourcemap: false,
    legalComments: "none",
    // module scripts are always decoded as UTF-8, and real characters are smaller than \uXXXX escapes
    charset: "utf8",
    metafile: true,
    tsconfig: resolve(here, "tsconfig.json"),
    plugins: [i18nSubsetPlugin(keys)],
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
  });

  let entryJs = "";
  let entryCss = "";
  for (const [file, meta] of Object.entries(result.metafile.outputs)) {
    const name = file.split(/[\\/]/).pop();
    if (meta.entryPoint && meta.entryPoint.endsWith("main.ts")) entryJs = name;
    else if (name.endsWith(".css")) entryCss = name;
  }
  if (!entryJs || !entryCss) throw new Error("build did not produce the entry script and stylesheet");

  const template = readFileSync(resolve(here, "index.html"), "utf8");
  const html = template
    .replace("<!--CSS-->", `<link rel="stylesheet" href="/app/${entryCss}">`)
    .replace("<!--JS-->", `<script type="module" src="/app/${entryJs}"></script>`);
  writeFileSync(join(outDir, "index.html"), html);

  const files = walk(outDir).map((p) => {
    const buf = readFileSync(p);
    return { name: relative(outDir, p).replace(/\\/g, "/"), bytes: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  });
  const total = files.reduce((a, f) => ({ raw: a.raw + f.bytes, gzip: a.gzip + f.gzip }), { raw: 0, gzip: 0 });
  return { outDir, files, total, entryJs, entryCss };
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildApp()
    .then((r) => {
      for (const f of r.files) console.log(`${f.name.padEnd(28)} ${String(f.bytes).padStart(8)} B  gzip ${String(f.gzip).padStart(7)} B`);
      console.log(`total ${r.total.raw} B raw, ${r.total.gzip} B gzip -> ${relative(process.cwd(), r.outDir) || "."}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
