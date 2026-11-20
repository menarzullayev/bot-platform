export interface BuildResult {
  outDir: string;
  files: { name: string; bytes: number; gzip: number }[];
  total: { raw: number; gzip: number };
  entryJs: string;
  entryCss: string;
  bootJs: string;
}
export function buildApp(opts?: { outDir?: string; minify?: boolean }): Promise<BuildResult>;
