// Creates the skeleton of a new TezCalc style (DEC-010).
//
//   npm run new-style -- <id> "<Name>" [--dry-run]       (in worker/)
//
// Copies miniapp/src/styles/_template/ to miniapp/src/styles/<id>/ (index.ts, kit.ts, pack.css, tokens.ts), adds the pack's
// `vi.mock` line to worker/test/miniapp/contract.test.ts (the pack lists of the contract, registry and contrast tests are
// built from the styles/ folders, so nothing else is needed there) and prints the list of manual registration steps.
// The skeleton is a complete working pack: `npm run typecheck:app` and the contract/contrast tests pass before you edit it.

import { checkId, createStyle, parseTokensTs, printManualSteps, skeletonFiles, titleCase } from "./lib/style-tools.mjs";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry-run");
const pos = argv.filter((a) => !a.startsWith("--"));
const [id, nameArg] = pos;

if (argv.includes("--help") || argv.includes("-h") || !id) {
  console.log('usage: npm run new-style -- <id> "<Name>" [--dry-run]\n  id   ^[a-z][a-z0-9-]{2,20}$, not registered yet, folder must not exist\n  Name display name (English) of the style, default: the id in Title Case');
  process.exit(id ? 0 : 1);
}

const err = checkId(id);
if (err) {
  console.error(`new-style: ${err}`);
  process.exit(1);
}
const name = (nameArg ?? titleCase(id)).trim();
if (!name || /[\r\n"\\]/.test(name)) {
  console.error("new-style: the name must be a short single line without quotes or backslashes");
  process.exit(1);
}

try {
  const r = createStyle(id, name, { dry });
  console.log(`${dry ? "[dry-run] would create" : "created"} style "${id}" (${name}):`);
  for (const f of r.files) console.log(`  + ${f}`);
  console.log(`  ${r.mock === "added" ? "+" : "="} worker/test/miniapp/contract.test.ts: vi.mock line for ${id} (${dry && r.mock === "added" ? "would be added" : r.mock})`);
  printManualSteps(id, name, parseTokensTs(skeletonFiles(id, name).find((f) => f.path.endsWith("tokens.ts")).text));
  console.log(`\nNext: edit miniapp/src/styles/${id}/ (tokens.ts + the token blocks of pack.css, then kit.ts/pack.css), or run \`npm run atlas-import -- <atlas-style> --as ${id} --force\` to start from an atlas palette. Guide: docs/STYLES.md`);
} catch (e) {
  console.error(`new-style: ${e.message}`);
  process.exit(1);
}
