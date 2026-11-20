#!/usr/bin/env node
// Monthly D1 backup (DEC-016): one command, no secrets printed.
//   node scripts/export-d1.mjs            -> ~/.bot-platform/backups/bots-db-YYYYMMDD-HHMM.sql (+ .sha256)
// Keeps the 12 newest backups. The dump contains the AES-GCM *encrypted* bot tokens, user settings and Stars payments:
// treat it as sensitive (the folder is created for the current Windows user only).
// See docs/RUNBOOK.md for restore steps.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = join(here, "..", "worker");
const dir = join(homedir(), ".bot-platform", "backups");
mkdirSync(dir, { recursive: true });
if (process.platform === "win32") {
  // current user only (best effort; failure is not fatal)
  spawnSync("icacls", [dir, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:(OI)(CI)F`], { stdio: "ignore" });
}

const now = new Date();
const p = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
const out = join(dir, `bots-db-${stamp}.sql`);

const r = spawnSync("npx", ["wrangler", "d1", "export", "bots-db", "--remote", "--output", out], {
  cwd: workerDir,
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (r.status !== 0 || !existsSync(out)) {
  console.error("Export failed:\n" + (r.stderr || r.stdout || "").split("\n").slice(-12).join("\n"));
  process.exit(1);
}

const sql = readFileSync(out, "utf8");
const tables = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"']?(\w+)/gi)].map((m) => m[1]);
const inserts = (sql.match(/^INSERT INTO/gm) || []).length;
const need = ["bots", "users", "payments"];
const missing = need.filter((t) => !tables.includes(t));
if (missing.length) {
  console.error("Backup looks incomplete, missing tables: " + missing.join(", "));
  process.exit(2);
}
const sha = createHash("sha256").update(sql).digest("hex");
writeFileSync(out + ".sha256", `${sha}  ${out.split(/[\\/]/).pop()}\n`);

// retention: newest 12
const all = readdirSync(dir).filter((f) => /^bots-db-\d{8}-\d{4}\.sql$/.test(f)).sort();
for (const f of all.slice(0, Math.max(0, all.length - 12))) {
  unlinkSync(join(dir, f));
  if (existsSync(join(dir, f + ".sha256"))) unlinkSync(join(dir, f + ".sha256"));
}

const kb = Math.round(statSync(out).size / 1024);
console.log(`OK ${out}\n   ${kb} KB, ${tables.length} tables (${tables.join(", ")}), ${inserts} INSERT rows, sha256 ${sha.slice(0, 12)}...`);
