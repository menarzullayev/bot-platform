# Runbook: TezCalc / bot-platform

Maqsad: nimadir buzilsa, kim bo'lishidan qat'i nazar (siz yoki yangi agent) tiklay olishi. Qarorlar: `design-hub/decisions` (DEC-013, DEC-016).
Hamma buyruqlar `D:\Linux\Projects\bot-platform` da, PowerShell yoki Git Bash.

## 1. Tizim xaritasi
| Qism | Qayerda | Eslatma |
|---|---|---|
| Worker (bot, Mini App, landing, API) | Cloudflare Workers `bot-platform` (`https://bot-platform.tezbot-lab.workers.dev`) | `main` ga push -> GitHub Actions (CI, keyin Deploy) |
| Ma'lumotlar bazasi | D1 `bots-db` (id `6d4f369a-0081-464f-a64d-bbfda716ed9b`) | migratsiyalar `worker/migrations` (hozir 0001-0005) |
| Kod | https://github.com/menarzullayev/bot-platform | public repo; maxfiy qiymat yo'q |
| Bot | `@tezcalc_bot` (id `tezcalc`) | tokeni D1 da AES-GCM bilan shifrlangan |
| Operator sirlari | `C:\Users\nsn\.bot-platform\secrets.env` (`TOKEN_KEY`, `ADMIN_TOKEN`) | Cloudflare secretlarining nusxasi |
| Zaxira | `C:\Users\nsn\.bot-platform\backups\` (oylik eksport) | `node scripts/export-d1.mjs` |

## 2. Maxfiy qiymatlar va yo'qotish oqibatlari
| Qiymat | Qayerda turadi | Yo'qolsa |
|---|---|---|
| `TOKEN_KEY` (32 bayt, base64) | Cloudflare secret + `secrets.env` | D1 dagi bot tokenlarini ochib bo'lmaydi. Chora: BotFather da tokenni qayta yarating (`/revoke`), botni qayta qo'shing (`scripts/register-bot.mjs`). **`secrets.env` nusxasini parol menejeriga saqlang.** |
| `ADMIN_TOKEN` | Cloudflare secret + `secrets.env` | Yangisini yarating: `openssl rand -hex 32`, `wrangler secret put ADMIN_TOKEN`, `secrets.env` ni yangilang. |
| Bot tokeni | BotFather | `/revoke` bilan almashtirish, `register-bot.mjs` bilan qayta qo'shish. |
| `CLOUDFLARE_API_TOKEN` (GitHub secret) | GitHub Actions secretlari | Yangisini yarating (`worker/scripts/enable-cd.mjs`); eskisini Cloudflare'da o'chiring. Muddati: 2027-11-20. |

## 3. Oylik zaxira (DEC-016)
```powershell
node scripts/export-d1.mjs
```
Natija: `~\.bot-platform\backups\bots-db-YYYYMMDD-HHMM.sql` + `.sha256`. Oxirgi 12 ta saqlanadi. Dump `payments` (Stars to'lovlari), foydalanuvchi sozlamalari va shifrlangan bot tokenini o'z ichiga oladi: maxfiy deb hisoblang, internetga qo'ymang. Oyiga bir marta (har oyning 1-sanasi) bajaring va faylni boshqa diskka yoki shifrlangan joyga ham nusxalang.
Eslatma: avtomatik eslatma yo'q (DEC-016). Ixtiyoriy: Windows Task Scheduler'da oyiga bir marta shu buyruqni ishga tushirish mumkin.

## 4. Tiklash
**A. Yaqinda (30 kun ichida) noto'g'ri o'zgarish/o'chirish:** D1 Time Travel.
```powershell
cd worker
npx wrangler d1 time-travel info bots-db                       # hozirgi bookmark
npx wrangler d1 time-travel restore bots-db --timestamp "2026-11-21T10:00:00Z"   # yoki --bookmark <id>
```
Tiklash joyida bo'ladi (bazaning o'zi qaytadi). Avval `export-d1.mjs` bilan hozirgi holatni saqlab oling.

**B. Dump'dan (yangi baza yoki akkaunt yo'qolsa):**
```powershell
cd worker
npx wrangler d1 create bots-db                      # yangi id chiqadi -> wrangler.toml dagi database_id ni almashtiring
npx wrangler d1 execute bots-db --remote --file C:\Users\nsn\.bot-platform\backups\bots-db-YYYYMMDD-HHMM.sql
```
Sinov (2026-11-21): dump toza lokal bazaga yuklandi va bots/users/payments/fx_rates/metrics_daily qator sonlari productionniki bilan mos chiqdi.
So'ng: worker deploy (`npm run deploy`), `TOKEN_KEY` va `ADMIN_TOKEN` secretlarini qayta qo'ying (`wrangler secret put`), webhookni qayta bog'lang (4-band).

**C. Butun Cloudflare akkaunti yo'qolsa:** yangi akkaunt -> `wrangler login` -> B bandi -> `workers.dev` subdomenini tanlang (URL o'zgaradi!) -> `PUBLIC_BASE_URL` (`wrangler.toml [vars]`) ni yangilang -> deploy -> BotFather da Mini App/menyu URL ni, `/setup` ni qayta bajaring -> GitHub secretlarini (CD) yangilang.

## 5. Bot holatini tiklash (webhook, profil)
```powershell
$h = @{ authorization = "Bearer $((Select-String -Path $HOME\.bot-platform\secrets.env -Pattern '^ADMIN_TOKEN=').Line.Split('=',2)[1])" }
$b = "https://bot-platform.tezbot-lab.workers.dev"
Invoke-RestMethod -Method Post -Headers $h "$b/admin/bots/tezcalc/sync-webhook"   # webhook + allowed_updates
Invoke-RestMethod -Method Post -Headers $h "$b/admin/bots/tezcalc/setup"          # buyruqlar, nom, tavsiyalar, menyu tugmasi
Invoke-RestMethod -Headers $h "$b/admin/bots/tezcalc/webhook"                     # tekshiruv: url, pending, last_error
```
Eslatma: BotFather'da **Serverless** (beta) ni yoqmang: u webhookni o'chiradi.

## 6. Deploy va qaytarish
- Odatda: `main` ga push -> CI yashil -> Deploy (GitHub Actions). Migratsiya avtomatik EMAS: yangi migratsiya bo'lsa avval `cd worker; npx wrangler d1 migrations apply bots-db --remote` (qo'shimcha o'zgarishlar eski kod bilan mos), keyin push.
- Yomon deploy: `cd worker; npx wrangler deployments list` -> `npx wrangler rollback <version-id>`.
- CD ni to'xtatish: GitHub -> Settings -> Variables: `DEPLOY_ENABLED` ni `false` qiling (qo'lda: `npm run deploy`).

## 7. Degradatsiya (DEC-013)
Kunlik so'rovlar 70 000 dan oshsa rasm-karta o'chadi (daraja 1); 90 000 dan oshsa Mini App sinxron/tarix yozuvi ham to'xtaydi (daraja 2). Hisob oddiy ishlayveradi. UTC 00:00 da nolga tushadi. Holatni ko'rish: `GET /admin/stats` (`today.degraded`, `today.counters.req`), tarix: `GET /admin/metrics?days=7`. Chegaralar: `DEGRADE_L1/L2` (env). Pullik rejaga o'tish (Workers Paid, $5/oy) faqat egasining qarori bilan.

## 8. Hodisa tekshiruv ro'yxati
1. `GET /health` 200 mi? Yo'q bo'lsa: Cloudflare status, `wrangler tail` (xato matni), oxirgi deploy (`gh run list`).
2. Bot javob bermasa: `GET /admin/bots/tezcalc/webhook` -> `last_error_message`, `pending_update_count`; kerak bo'lsa 5-band.
3. Mini App ochilmasa: `/app/` 200 mi, CSP xatosi (brauzer konsoli), `PUBLIC_BASE_URL` va BotFather menyu URL mosligi.
4. To'lov muammosi: `/paysupport` matnidagi `charge_id` bilan `payments` jadvali; qaytarish: `POST /admin/bots/tezcalc/refund {user_id, charge_id}`.
5. Ma'lumot buzilsa: 4-band A (Time Travel), avval eksport.
6. Hodisadan keyin: nima bo'ldi, sabab, chora (`design-hub/decisions` ga qisqa yozuv).

## 9. Ma'lum cheklovlar
- Widget (`/widget`): Telegram faqat oq ro'yxatdagi botlarga ruxsat beradi; kod tayyor, hozir Mini App'ga yo'naltiradi.
- Avatar `setMyProfilePhoto` bilan o'rnatiladi; "tavsif rasmi" (`/setdescriptionpic`) BotFather orqali qo'lda yuklanadi (`brand/out/description.jpg`).
- Huquqiy matnlar mutaxassis ko'rigidan o'tmagan (`docs/LEGAL-REVIEW.md`).
