# bot-platform / worker

Bitta Cloudflare Worker, ko'p Telegram bot (webhook). TypeScript + grammY, bot ro'yxati D1'da, tokenlar AES-GCM bilan shifrlangan.

## Arxitektura
- `POST /wh/:botId` Telegram webhook (`src/webhook.ts`). Tartib: bot topiladi (404) -> secret_token (401) -> `enabled=0` bo'lsa 200 -> `update_id` dedup (har bot uchun LRU, 1000 ta, TTL 10 daqiqa) -> per-user tezlik cheklovi (token bucket, 20 update / 10 s, kalit `botId:userId`) -> shablon. Autentifikatsiyadan o'tgach javob **har doim 200** (handler xatosi ham): aks holda Telegram cheksiz qayta yuboradi. Xatolar `log.error` bilan yoziladi, token/secret yozilmaydi.
- Shablonlar `src/templates/index.ts` registrida (`getTemplate(name)`, `registerTemplate`). Interfeys: `parseConfig`, `install(bot, ctx)`, ixtiyoriy `profile(config)`, `scheduled(env, deps)`, `rateLimit` (`false` = platforma cheklovidan tashqarida, `ctx.rateLimited(userId)` bilan o'zi cheklaydi). Hozir: `forcesub` (1-5 kanal a'zoligi, bot kanalda admin bo'lishi kerak).
- Cron (`wrangler.toml` `crons = ["0 * * * *"]`, har soat): `scheduled()` barcha yoqilgan botlar shablonlarining `scheduled()` ini chaqiradi; bitta bot xatosi boshqalarni to'xtatmaydi.
- `src/log.ts`: JSON qatorli log, `LOG_LEVEL` ni hurmat qiladi, token/secret/authorization/key kalitlari va bot token ko'rinishidagi qatorlar niqoblanadi.
- Dedup va tezlik cheklovi izolyat xotirasida (best-effort; izolyat qayta ishga tushsa tiklanadi).

## Admin API (hammasi `Authorization: Bearer ADMIN_TOKEN`)
- `GET /admin/bots` ro'yxat (token/secret yo'q); `POST /admin/bots` bot qo'shish (config shablonning `parseConfig` i bilan tekshiriladi).
- `PATCH /admin/bots/:id` `{"enabled": true|false}`: kill-switch.
- `GET /admin/bots/:id/webhook`: Telegram `getWebhookInfo` (url, pending_update_count, last_error_*, allowed_updates).
- `POST /admin/bots/:id/setup`: shablon `profile()` bo'yicha `setMyCommands/setMyName/setMyShortDescription/setMyDescription` (har til uchun), natija `[{method, language, ok}]`; profili yo'q shablon 409.
- `GET /admin/stats`: `{bots, enabled, users: {botId: soni}}`.
- `GET /health`.

## Lokal sinov (hisobsiz)
```
npm install
npm test              # vitest
npm run typecheck
npm run db:migrate:local   # migrations/ ni lokal D1 ga qo'llaydi
npx wrangler dev --local --var TOKEN_KEY:<base64 32 bayt> --var ADMIN_TOKEN:<qator>
```

## D1 migratsiyalari
`migrations/0001_init.sql` (bots, bot_users), `0002_calc.sql` (users, history, fx_rates, payments). Yangi o'zgarish = yangi raqamli fayl. Eski `schema.sql` o'chirildi; `CREATE TABLE IF NOT EXISTS` tufayli sxema allaqachon qo'llangan bazada 0001 zararsiz.
- Lokal: `npm run db:migrate:local`; masofaviy: `npm run db:migrate:remote` (deploydan oldin).

## Cloudflare'ga joylash (siz kirasiz, parolni hech kimga bermang)
1. `npx wrangler login` (brauzerda o'zingiz tasdiqlaysiz).
2. `npx wrangler d1 create bots-db` va chiqqan `database_id` ni `wrangler.toml` ga yozing.
3. `npm run db:migrate:remote`
4. Maxfiy qiymatlar: `npx wrangler secret put TOKEN_KEY` (kalit: `openssl rand -base64 32`), `npx wrangler secret put ADMIN_TOKEN`.
5. `npm run deploy`, keyin admin API orqali botni qo'shing:
```
curl -X POST https://<worker>.workers.dev/admin/bots \
  -H "authorization: Bearer <ADMIN_TOKEN>" -H "content-type: application/json" \
  -d '{"id":"bot001","token":"<BOT_TOKEN>","template":"forcesub","config":{"channels":["@kanalim"]}}'
```
**TOKEN_KEY ni yo'qotmang**: usiz D1'dagi tokenlarni ochib bo'lmaydi. Zaxira nusxasini alohida joyda saqlang.

## Bepul tarif limitlari (2026-11-20, qidiruv bilan tekshirilgan)
- 100 000 Worker so'rovi/kun (hamma botlar uchun umumiy; har bir update = 1 so'rov), 10 ms CPU, 50 subrequest/so'rov.
- D1: kuniga 5 mln o'qish, 100 ming yozish; shuning uchun foydalanuvchini faqat `/start`da yozamiz.

## Keyingi qadamlar
Qo'shimcha shablonlar (calc, konkurs, avto post), analitika.

## Production status (2026-11-20)
- Worker: https://bot-platform.tezbot-lab.workers.dev, D1 `bots-db`, migrations 0001-0002 applied.
- `tezcalc_bot` runs the `calc` template: chat, inline, guest mode, 7 languages, units/currency/finance, Pro (Stars) module, Mini App at `/app/?b=tezcalc`.
- Ops: `POST /admin/run-scheduled` (hourly job, FX rates), `POST /admin/bots/:id/sync-webhook`, `POST /admin/bots/:id/setup`, `PATCH /admin/bots/:id {enabled, template, config}`.
- Known external blocker: Telegram currently answers `INPUT_MEDIA_WIDGET_NOT_ALLOWED` to `sendWidget` for this bot (even a minimal widget), so `/widget` shows a friendly "unavailable" message. Code and tests are ready; re-test later.
- Not covered by automated tests: a real Stars payment, Mini App inside the Telegram client.
