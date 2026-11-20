#!/usr/bin/env node
// Botni platformaga qo'shadi: POST /admin/bots.
// Bot tokeni terminalda YASHIRIN so'raladi (ekranga chiqmaydi, argumentga yozilmaydi).
// ADMIN_TOKEN va manzil: ~/.bot-platform/secrets.env (production) yoki .dev.vars (--local).
//
// Misol:
//   node scripts/register-bot.mjs --id tezcalc --template forcesub --channels @kanalim
//   node scripts/register-bot.mjs --id tezcalc --config '{"channels":["@kanalim"]}'
//   node scripts/register-bot.mjs --id test --local --channels @kanalim
//
// Bayroqlar: --id (majburiy) --template (forcesub) --channels a,b | --config JSON
//            --local (http://localhost:8787 va .dev.vars) --url <asos URL> --yes (so'ramasdan)
// Token avtomatlashtirish uchun BOT_TOKEN env o'zgaruvchisidan ham olinadi (shell tarixiga yozmang).

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error("noma'lum argument: " + a);
    const k = a.slice(2);
    if (["local", "yes"].includes(k)) o[k] = true;
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error("--" + k + " qiymati yo'q");
      o[k] = v;
    }
  }
  return o;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("TTY yo'q: BOT_TOKEN env o'zgaruvchisidan foydalaning"));
    process.stdout.write(prompt);
    let buf = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch) => {
      for (const c of ch) {
        if (c === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.id || !/^[A-Za-z0-9_-]{1,32}$/.test(a.id)) throw new Error("--id majburiy (1-32 belgi: harf, raqam, _ -)");
  const template = a.template ?? "forcesub";

  let config;
  if (a.config) config = JSON.parse(a.config);
  else if (a.channels) config = { channels: a.channels.split(",").map((s) => s.trim()).filter(Boolean) };
  else config = {};

  let base, adminToken;
  if (a.local) {
    const v = readEnvFile(join(here, "..", ".dev.vars"));
    base = a.url ?? v.PUBLIC_BASE_URL ?? "http://localhost:8787";
    adminToken = v.ADMIN_TOKEN;
  } else {
    const v = readEnvFile(join(homedir(), ".bot-platform", "secrets.env"));
    base = a.url ?? v.PUBLIC_BASE_URL ?? "https://bot-platform.tezbot-lab.workers.dev";
    adminToken = v.ADMIN_TOKEN;
  }
  if (!adminToken) throw new Error("ADMIN_TOKEN topilmadi (" + (a.local ? ".dev.vars" : "~/.bot-platform/secrets.env") + ")");
  base = base.replace(/\/$/, "");

  const token = process.env.BOT_TOKEN?.trim() || (await askHidden("Bot tokenini kiriting (ko'rinmaydi): "));
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new Error("token shakli noto'g'ri (123456:ABC...)");

  console.log(`Manzil: ${base}\nBot id: ${a.id}\nShablon: ${template}\nSozlama: ${JSON.stringify(config)}`);
  if (!a.yes && process.stdin.isTTY && !process.env.BOT_TOKEN) {
    const ans = await askHidden("Davom etamizmi? (y/N): ");
    if (ans.toLowerCase() !== "y") throw new Error("bekor qilindi");
  }

  const res = await fetch(base + "/admin/bots", {
    method: "POST",
    headers: { authorization: "Bearer " + adminToken, "content-type": "application/json" },
    body: JSON.stringify({ id: a.id, token, template, config }),
  });
  const text = await res.text();
  // Javobda token bo'lmasligi kerak; baribir tokenni niqoblaymiz.
  console.log(`HTTP ${res.status}\n` + text.split(token).join("***"));
  if (res.status !== 201) process.exit(1);
}

main().catch((e) => {
  console.error("Xato: " + e.message);
  process.exit(1);
});
