#!/usr/bin/env node
// Enables automatic production deploys (GitHub Actions "Deploy" workflow).
// It asks for a Cloudflare API token with a HIDDEN prompt and stores it as a GitHub Actions secret via
// `gh secret set` (the token never reaches the screen, shell history or this repo).
//
// 1) Create the token: https://dash.cloudflare.com/profile/api-tokens -> "Create Token" -> template
//    "Edit Cloudflare Workers" (account: your account; add "D1: Edit" if you want migrations in CI).
// 2) Run:  node scripts/enable-cd.mjs --account <CLOUDFLARE_ACCOUNT_ID>
//
// Flags: --repo owner/name (default: menarzullayev/bot-platform), --account <id> (required)

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf("--" + k);
  return i >= 0 ? args[i + 1] : d;
};
const repo = get("repo", "menarzullayev/bot-platform");
const account = get("account");
if (!account || !/^[0-9a-f]{32}$/.test(account)) {
  console.error("Error: --account <32-hex Cloudflare account id> is required");
  process.exit(1);
}

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("a TTY is required"));
    process.stdout.write(prompt);
    let buf = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === "\u0003") {
          process.stdin.setRawMode(false);
          process.exit(130);
        } else if (c === "\r" || c === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(buf.trim());
        } else if (c === "\u007f" || c === "\b") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    process.stdin.on("data", onData);
  });
}

function gh(argv, input) {
  const r = spawnSync("gh", argv, { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gh ${argv.slice(0, 3).join(" ")} failed: ${(r.stderr || "").trim()}`);
}

try {
  const token = await askHidden("Cloudflare API token (hidden): ");
  if (token.length < 30) throw new Error("token looks too short");
  // Verify the token before storing it.
  const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { authorization: "Bearer " + token },
  });
  const j = await res.json();
  if (!j.success || j.result?.status !== "active") throw new Error("Cloudflare says the token is not active");
  gh(["secret", "set", "CLOUDFLARE_API_TOKEN", "--repo", repo], token);
  gh(["secret", "set", "CLOUDFLARE_ACCOUNT_ID", "--repo", repo], account);
  gh(["variable", "set", "DEPLOY_ENABLED", "--repo", repo, "--body", "true"]);
  console.log("OK: secrets stored, DEPLOY_ENABLED=true. Every green push to main now deploys to production.");
} catch (e) {
  console.error("Error: " + e.message);
  process.exit(1);
}
