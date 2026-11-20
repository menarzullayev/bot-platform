import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite, type SiteBuildResult } from "../../../site/build.mjs";

export const BASE = "https://site.test";
export const LANGS = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"] as const;
export const PAGES = ["", "privacy", "terms", "support"] as const;

/** URL path of a page: ("ru", "") -> /ru/, ("ru", "privacy") -> /ru/privacy, ("uz-latn", "") -> / */
export function pagePath(lang: string, page: string): string {
  const prefix = lang === "uz-latn" ? "" : "/" + lang;
  return page ? `${prefix}/${page}` : prefix + "/";
}
/** File under the output dir for a page path. */
export function pageFile(lang: string, page: string): string {
  const prefix = lang === "uz-latn" ? "" : lang + "/";
  return page ? `${prefix}${page}.html` : `${prefix}index.html`;
}

export interface Built {
  dir: string;
  result: SiteBuildResult;
  read(rel: string): string;
  html(lang: string, page: string): string;
  cleanup(): void;
}

export async function buildToTmp(): Promise<Built> {
  const dir = mkdtempSync(join(tmpdir(), "site-build-"));
  const result = await buildSite({ outDir: dir, base: BASE, writeReview: false });
  const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
  return { dir, result, read, html: (l, p) => read(pageFile(l, p)), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function allFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(dir, base))) {
    const rel = base ? `${base}/${n}` : n;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...allFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}
