export const LANGS: readonly string[];
export const LEGAL: readonly string[];
export const TOKENS: Record<string, Record<"light" | "dark", Record<string, string>>>;
export function homePath(lang: string): string;
export function legalPath(lang: string, page: string): string;
export function inlineHtml(src: string): string;
export function telegramToHtml(src: string, opts?: { headingLevel?: number }): { title: string; html: string; firstText: string };
export interface SiteBuildResult {
  outDir: string;
  base: string;
  files: { name: string; bytes: number; gzip: number }[];
  total: { raw: number; gzip: number };
  cssName: string;
  bootName: string;
  appName: string;
  ogImage: boolean;
}
export function buildSite(opts?: { outDir?: string; minify?: boolean; base?: string; writeReview?: boolean }): Promise<SiteBuildResult>;
