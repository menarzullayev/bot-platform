# bot-platform / worker

Bitta Cloudflare Worker, ko'p Telegram bot (webhook). TypeScript + grammY, bot ro'yxati D1'da, tokenlar AES-GCM bilan shifrlangan.

## Nima bor
- `POST /wh/:botId` Telegram webhook: botni D1'dan topadi, `X-Telegram-Bot-Api-Secret-Token` ni tekshiradi (ikki qavat: o'zimiz + grammY), update'ni shablonga uzatadi.
- `POST /admin/bots` (Bearer `ADMIN_TOKEN`): token `getMe` bilan tekshiriladi, tasodifiy `secret_token` yaratiladi, `setWebhook` chaqiriladi, token shifrlanib saqlanadi.
- `GET /admin/bots`: ro'yxat (token va secret ko'rsatilmaydi).
- `GET /health`.
- Shablon `forcesub`: `/start`da 1-5 kanal a'zoligini tekshiradi, "Tekshirish" tugmasi bor. Bot kanalda **admin** bo'lishi kerak.

## Lokal sinov (hisobsiz)
```
npm install
npm test            # 20 ta birlik test
npm run typecheck
npm run db:local    # lokal D1 sxemasi
npx wrangler dev --local --var TOKEN_KEY:<base64 32 bayt> --var ADMIN_TOKEN:<qator>
```

## Cloudflare'ga joylash (siz kirasiz, parolni hech kimga bermang)
1. `npx wrangler login` (brauzerda o'zingiz tasdiqlaysiz).
2. `npx wrangler d1 create bots-db` va chiqqan `database_id` ni `wrangler.toml` ga yozing.
3. `npm run db:remote`
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
Qo'shimcha shablonlar (konkurs, avto post), bot o'chirish/yoqish endpointi, update_id dedup, Cron Triggers orqali rejalashtirilgan postlar, analitika.
