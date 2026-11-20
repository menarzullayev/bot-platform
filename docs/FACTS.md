# FACTS.md — @tezcalc_bot uchun tasdiqlangan faktlar jadvali

Loyiha: Telegram kalkulyator boti (@tezcalc_bot), Cloudflare Workers + grammY, TypeScript.
O'qilgan sana: **2026-11-20** (barcha manbalar shu kuni o'qildi). Eng so'nggi Bot API: **10.4 (2026-11-09)**.

Manbalar (qisqartma):
- [API] https://core.telegram.org/bots/api
- [CHG] https://core.telegram.org/bots/api-changelog
- [INL] https://core.telegram.org/bots/inline
- [WEB] https://core.telegram.org/bots/webapps
- [STR] https://core.telegram.org/bots/payments-stars
- [FEA] https://core.telegram.org/bots/features
- [WID] https://core.telegram.org/bots/widgets (rasmiy Widgets qo'llanmasi; topshiriq ro'yxatida yo'q edi, lekin core.telegram.org ichida, 10.4 uchun shu yerda raqamlar bor)
- [FAQ] https://core.telegram.org/bots/faq (flood limitlari uchun)

Belgilar: **TASDIQLANMADI** = ko'rsatilgan rasmiy sahifalarda topilmadi, taxmin qilinmagan.
Eslatma: bu yerdagi "rasmiy hujjatda yozilgan" so'zlar to'g'ridan-to'g'ri sahifadan olingan; "Xulosa" deb belgilanganlar mening hosilam.

---

## 1. Inline mode

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Yoqish | @BotFather `/setinline` + input maydoni placeholder matni. Aks holda inline update kelmaydi | [INL], [FEA] |
| Geolokatsiya | `/setinlinegeo` | [INL] |
| Feedback | `/setinlinefeedback` -> `chosen_inline_result` update. Ehtimollik sozlamasi: "1/10, 1/100 or 1/1000" tavsiya | [INL] |
| `inline_query` maydonlari | `id`, `from`, `query` (**<=256 belgi**), `offset`, `chat_type` (sender/private/group/supergroup/channel; secret chatda noma'lum bo'lishi mumkin), `location` (ixtiyoriy) | [API] |
| `answerInlineQuery` natijalar soni | **<=50** natija | [API] |
| `cache_time` | Serverda keshlanish sekundlari, **default 300** | [API] |
| `is_personal` | True bo'lsa kesh faqat so'rovchi foydalanuvchi uchun; aks holda bir xil so'rovga hamma uchun | [API] |
| `next_offset` | Keyingi so'rovda yuboriladigan offset; **<=64 bayt**; bo'sh qator = sahifalash yo'q | [API] |
| `button` (InlineQueryResultsButton) | Natijalar tepasida tugma; aniq bittasi: `web_app` yoki `start_parameter` (1-64 belgi, `A-Za-z0-9_-`); `text` = yorliq. (Eski `switch_pm_*` o'rniga `button`) | [API] |
| Switch to PM | Tugma shaxsiy chatni `start_parameter` bilan ochadi; qaytish uchun `switch_inline_query` tugmasi | [INL] |
| Natija turlari | 20 ta `InlineQueryResult*` turi | [API], [INL] |
| `InlineQueryResultArticle` | `type="article"`, `id` (**1-64 bayt**), `title`, `input_message_content` (majburiy), `reply_markup`, `url`, `description`, `thumbnail_url/width/height` | [API] |
| `InputMessageContent` turlari | InputTextMessageContent, InputRichMessageContent, Location, Venue, Contact, Invoice, InputWidgetMessageContent, InputSharedWidgetMessageContent | [API] |
| `InputTextMessageContent` | `message_text` **1-4096 belgi**, `parse_mode`, `entities` (parse_mode o'rniga), `link_preview_options` | [API] |
| `chosen_inline_result` maydonlari | `result_id`, `from`, `location`, `inline_message_id` (faqat natijaga inline klaviatura biriktirilgan bo'lsa), `query` | [API] |
| Kesh va feedback | Keshlash sababli natijalar soni haqiqiy so'rovlardan ko'p kelishi mumkin | [INL] |
| Monitoring | Mashhur botlar ~300 so'rov/daqiqa chegarasiga qarab kuzatiladi (o'zgarishi mumkin) | [FEA] |
| Natijadagi URL'lar | Hammasi ochiq deb hisoblanishi kerak | [API] |
| `answerInlineQuery` javob muddati (timeout) | **TASDIQLANMADI** (sahifalarda sekund ko'rsatilmagan) | — |

## 2. Guest mode (Bot API 10.0, 2026-05-08)

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Yoqish | BotFather **Mini App** sozlamalarida "Guest Mode" | [FEA] |
| Update | `Update.guest_message` (turi `Message`); `Message.guest_query_id` bilan javob beriladi | [API], [CHG] |
| Qo'shimcha Message maydonlari | `guest_query_id`, `guest_bot_caller_user`, `guest_bot_caller_chat` | [API], [CHG] |
| Javob | `answerGuestQuery(guest_query_id, result: InlineQueryResult)` -> `SentGuestMessage`. Natija turi inline natijalar bilan bir xil (jumladan `InputRichMessageContent` ruxsat etilgan) | [API], [CHG] |
| Bir marta javob | "the bot ... is able to issue **one reply**" | [FEA] |
| Qachon ishga tushadi | Foydalanuvchi `@bot` deb eslatsa yoki bot xabariga reply qilsa; update tegilgan xabarni va (bo'lsa) reply qilingan xabarni o'z ichiga oladi | [FEA] |
| Cheklovlar | Chat tarixiga va a'zolar ro'yxatiga kirish yo'q; kelajakdagi xabarlar uchun update yo'q (faqat yangi eslatma/reply); bitta xabarda **<=3** guest bot eslatish mumkin | [FEA] |
| Guest vs Inline | Inline = kontent olib o'zi yuboradi; Guest = bot o'zi nomidan mustaqil javob beradi | [FEA] |
| Maxfiy chat / himoyalangan kontent chatlari istisnosi | **TASDIQLANMADI** (rasmiy sahifalarda topilmadi) | — |
| `allowed_updates` | Hujjat: bo'sh ro'yxat = `chat_member`, `message_reaction`, `message_reaction_count` dan tashqari hammasi (default). **Xulosa:** `guest_message` defaultga kiradi, lekin aniq ro'yxat berilsa unga `"guest_message"` qo'shish shart. Bu to'g'ridan-to'g'ri guest uchun yozilmagan, umumiy qoidadan chiqarilgan | [API] |

## 3. Widgets (Bot API 10.4, 2026-11-09)

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Nima | HTML+CSS+JS hujjat; xabar bubble ichida ko'rsatiladi | [WID] |
| Hajm | `html` **1-32768 bayt** va zlib (max siqish) bilan **<=4096 bayt** | [API] (sendWidget), [WID] |
| Ishlash muhiti | JS **QuickJS** ichida (WebView emas); har tomonlama sandbox | [WID] |
| Tarmoq | **Yo'q**: fetch/XHR/WebSocket `NetworkDisabledError` tashlaydi; tashqi script/stil/shrift/rasm yuklanmaydi; navigatsiya yo'q; kutubxona bundle qilinmagan | [WID] |
| Production'da | Faqat **bot bilan shaxsiy chat**ga yuboriladi; widgetlar avtomatik `protect_content` (forward qilib bo'lmaydi); `copyMessage(s)` ishlamaydi | [API], [CHG], [WID] |
| Faqat test serverda | Guruhlar, inline rejim, forward, shared widget forwardi | [WID] |
| Kanallar | Kanalga joylab bo'lmaydi | [WID] |
| Inline natija sifatida | `InputWidgetMessageContent` / `InputSharedWidgetMessageContent` bor, lekin production'da **yuborib bo'lmaydi** | [API], [CHG] |
| Yuborish metodlari | `sendWidget` (`html`, `width` 200..bubble, `height` 50-600, `public_data`<=1024B, `chat_data`<=1024B, `caption`<=1024, `allow_queries`, `is_shared`), `sendSharedWidget(widget_id,...)` | [API] |
| So'rovlar | Widget -> bot: `widget_query` / `shared_widget_query` update; `data` **1-64 bayt**; `allow_queries=True` kerak | [API], [WID] |
| Javob | `answerWidgetQuery(widget_query_id, data<=1024B)` **15 soniya** ichida, aks holda widgetda `TIMEOUT` | [API], [WID] |
| So'rov tezligi | Har foydalanuvchi uchun **5 so'rov / 5 soniya** (barcha widgetlardan; ortig'i `RATE_LIMITED`) | [API], [WID] |
| Holatni o'zgartirish | `editMessageWidgetData`, `editSharedWidgetData` (shared: **<=1/soniya**, `cache_time` 5-3600, default 30) | [API] |
| Bir vaqtda | Bitta so'rov javob kutayotganda ikkinchisi `BUSY` bilan rad etiladi | [WID] |
| Ruxsat | `can_send_other_messages` huquqi widget yuborishni ham qamrab oladi | [CHG] |
| CPU / xotira / ishlash vaqti chegaralari | **TASDIQLANMADI** (QuickJS va 32/4 KB bor, CPU/RAM raqami yo'q) | — |

## 4. Rich messages va sendMessageDraft

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Versiya | Rich: **10.1 (2026-06-11)**; tugmalar/hujjat/ephemeral: 10.3 (2026-08-24) | [CHG] |
| Metodlar | `sendRichMessage`, `sendRichMessageDraft`, `editMessageText(rich_message=...)` | [API], [CHG] |
| `InputRichMessage` | Aniq bittasi: `blocks`, `html` yoki `markdown`; `media[]` (`tg://photo|video|document|audio?id=`; id 1-64 belgi `A-Za-z0-9_-`); `is_rtl`; `skip_entity_detection` | [API] |
| Limitlar | **<=32768 UTF-8 belgi**; **<=500 blok** (ichkarilari bilan); **<=16** ichma-ich daraja; **<=50 media**; jadvalda **<=20 ustun** | [API] |
| Qaysi chatlarda | `sendRichMessage`: `chat_id` bot/supergroup/kanal/chat (+business, ephemeral). `sendRichMessageDraft` va `sendMessageDraft`: faqat **shaxsiy chat** (`chat_id` Integer, "target private chat") | [API], [FEA] |
| `sendMessageDraft` | 9.3 (2025-12-31) da qo'shilgan; **9.5 (2026-03-01)** dan **barcha botlar**; 10.0 da bo'sh `text` ruxsat; 10.3 da `can_stop`/`keep_on_stop`; `text` 0-4096; `draft_id` != 0 (bir xil id = animatsiya) | [CHG], [API] |
| Draft muddati | "temporary **30-second** preview"; yakuniy natijani `sendMessage`/`sendRichMessage` bilan yuborish shart | [API] |
| Stop | `can_stop=True` -> `stopped_message_generation` update (`MessageGenerationStopped`) | [API], [CHG] |
| Oddiy matn | `sendMessage.text` **1-4096** belgi (entity parslangandan keyin) | [API] |
| Entity / parse | `entities` parse_mode o'rniga; HTML-uslubdagi entity ichma-ich bo'lmaydi (underline, strikethrough, spoiler, blockquote, custom_emoji, date_time faqat MarkdownV2 da); MarkdownV2 da `_ * [ ] ( ) ~ \` > # + - = \| { } . !` oldiga `\` kerak | [API] |
| Rich draft chegaralari (chastota) | `sendMessageDraft` uchun aniq chastota **TASDIQLANMADI** (bu sahifalarda yo'q; avvalgi xotiradagi 20/5s va 40/30s ushbu manbalardan tasdiqlanmadi) | — |

## 5. Ephemeral messages (Bot API 10.2, 2026-07-14)

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Nima | Guruhda faqat bitta foydalanuvchi va botga ko'rinadigan xabar; ephemeral buyruqlar (`BotCommand.is_ephemeral`) foydalanuvchi xabarini boshqalardan yashiradi | [FEA], [CHG] |
| Yuborish | Oddiy send metodlarida `ephemeral_message_parameters` (`EphemeralMessageParameters`): `receiver_user_id`, `callback_query_id`, `replace_callback_query_message` (10.3) | [API], [CHG] |
| Callback'ga ephemeral javob | `callback_query_id` ni `receiver_user_id`siz bering -> faqat tugmani bosgan foydalanuvchiga; `chat_id` ixtiyoriy; kanal direct messages chatlaridan tashqari har qayerda; baribir `answerCallbackQuery` chaqirish kerak | [API], [CHG] |
| Metodlar | `editEphemeralMessageText/Media/Caption/ReplyMarkup`, `deleteEphemeralMessage`; `sendRichMessage` ham ephemeral qo'llaydi | [CHG], [API] |
| Kafolat | "It is not guaranteed that the user will receive the message", ayniqsa offline bo'lsa | [API] |
| Cheklovlar | `web_app` va `login_url` tugmalari ephemeral xabarlarda qo'llanmaydi | [API] |
| Ephemeral xabar id | Chat ichida ephemeral id, o'chirilgan/muddati o'tgandan keyin qayta ishlatilishi mumkin | [API] |
| Amal qilish muddati (TTL) | **TASDIQLANMADI** (aniq vaqt ko'rsatilmagan) | — |

## 6. Telegram Stars

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Valyuta | Raqamli tovarlar uchun faqat **`XTR`**, `provider_token` **bo'sh** | [STR], [API] |
| `prices` | Stars uchun **aniq bitta** `LabeledPrice` elementi | [API] |
| `createInvoiceLink`/`sendInvoice` | `title` 1-32, `description` 1-255, `payload` 1-128 bayt | [API] |
| `subscription_period` | Faqat **2592000** (30 kun); `currency="XTR"` bo'lishi shart; narx **<=10000** Stars; bir foydalanuvchida bir nechta obuna bo'lishi mumkin. Obuna uchun `createInvoiceLink` hujjatda bor | [API] |
| Obuna boshqaruvi | `editUserStarSubscription(user_id, telegram_payment_charge_id, is_canceled)` (+ `subscription` update, `BotSubscriptionUpdated`) | [API] |
| `pre_checkout_query` | `answerPreCheckoutQuery` **10 soniya** ichida, aks holda tranzaksiya bekor | [STR], [API] |
| `successful_payment` | Tovarni faqat shu update'dan keyin bering; `telegram_payment_charge_id` ni saqlang (refund uchun); `is_recurring`, `is_first_recurring`, `subscription_expiration_date` | [STR], [API] |
| Refund | `refundStarPayment(user_id, telegram_payment_charge_id)` | [API], [STR] |
| `/paysupport` | Bot `/paysupport` ga javob berishi shart (nizolarni tezda hal qilish); `/terms` ga ham javob (yoki shartlar) | [STR] |
| `getStarTransactions` | `offset`, `limit` 1-100 (default 100) -> `StarTransactions`; `getMyStarBalance` | [API] |
| Pay tugmasi | Invoys xabarida birinchi qatordagi birinchi tugma `pay=True`; matndagi "XTR" Stars ikonkasi bilan almashtiriladi | [API] |
| Paid broadcast | `allow_paid_broadcast`: 1000 xabar/s, xabar uchun 0.1 Star, bot balansidan | [API] |
| Stars yechish shartlari (minimum, kutish, TON/Fragment) | **TASDIQLANMADI** ([STR] va [FEA] da yo'q) | — |
| Stars narx jadvali | [STR] da faqat rasm; matn sifatida **TASDIQLANMADI** | — |

## 7. Mini App

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| initData tekshiruvi | `data_check_string` = `hash` dan tashqari barcha maydonlar alfavit tartibida `key=value`, `\n` bilan; `secret_key = HMAC_SHA256(<bot_token>, "WebAppData")` (hujjat yozuvi; amalda kalit = "WebAppData", xabar = token); `hex(HMAC_SHA256(data_check_string, secret_key)) == hash` | [WEB] |
| `auth_date` | Unix vaqt (Mini App ochilgan payt); eskirgan ma'lumotni rad etish uchun qo'shimcha tekshiring. **Maksimal yosh raqami hujjatda yo'q** (qaror o'zimizniki) | [WEB] |
| Uchinchi tomon | `signature` Ed25519; test va production ochiq kalitlari hujjatda keltirilgan | [WEB] |
| CloudStorage | Har foydalanuvchi uchun **1024 kalit**; kalit 1-128 belgi `A-Za-z0-9_-`; qiymat 0-4096 belgi (6.9+) | [WEB] |
| DeviceStorage | Qurilmada lokal, faqat shu bot uchun, foydalanuvchiga **5 MB** (9.0+) | [WEB] |
| SecureStorage | Foydalanuvchiga **10 ta element** (Keychain/Keystore) (9.0+) | [WEB] |
| `sendData` | <=4096 bayt, faqat keyboard tugmasi orqali ochilgan Mini App | [WEB] |
| Origin cheklovi | 10.2 (2026-07-14) changelog: Mini App metodlari asl Mini App domenidan boshqa origindan **bloklanadi**, "automatically enabled for all Mini Apps on **July 20, 2026**"; BotFather Mini App orqali o'chirish mumkin, bunda bot havola qilingan saytlar ishonchsiz bo'lmasligiga javobgar. [WEB] sahifasida bu haqda yozuv topilmadi | [CHG] |
| Yangi | [WEB] da "Serverless" (bot Serverless loyihasi endpointlarini chaqirish) obyekti "NEW" deb belgilangan; tafsilot o'qilmadi | [WEB] |

## 8. Webhook

| Fakt | Qiymat / qoida | Manba |
|---|---|---|
| Javob kodi | 2XX bo'lmasa Telegram so'rovni takrorlaydi va "reasonable amount of attempts"dan keyin to'xtaydi (aniq son/oraliq **TASDIQLANMADI**) | [API] |
| `secret_token` | 1-256 belgi `A-Za-z0-9_-`; sarlavha `X-Telegram-Bot-Api-Secret-Token` | [API] |
| `allowed_updates` | Bo'sh ro'yxat = `chat_member`, `message_reaction`, `message_reaction_count` dan tashqari hamma (default); berilmasa oldingi sozlama saqlanadi; o'zgarish avval yaratilgan update'larga ta'sir qilmaydi | [API] |
| Portlar | 443, 80, 88, 8443 (rasmiy server); `max_connections` 1-100, default 40 | [API], [FEA] |
| Saqlash | Olinmagan update'lar serverda **<=24 soat** saqlanadi | [API] |
| `update_id` | Har update'ning unikal id'si (to'liq ta'rif sahifada); getUpdates da offset=oxirgi+1. **Webhook'da bir xil `update_id` takrorlanishi mumkinligi hujjatda aniq yozilmagan -> idempotent ishlov (update_id dedupe) tavsiya (Xulosa)** | [API] |
| getUpdates bilan | Webhook o'rnatilgan bo'lsa getUpdates ishlamaydi | [API] |
| Javob kutish muddati (server timeout) | **TASDIQLANMADI** | — |
| Eslatma | Bitta update'da faqat bitta ixtiyoriy maydon bo'ladi | [API] |

## 9. Bot API cheklovlari

| Fakt | Qiymat | Manba |
|---|---|---|
| Matn xabari | 1-4096 belgi (entity parslangandan keyin) | [API] |
| Caption (inline photo va h.k.) | 0-1024 belgi | [API] |
| `callback_data` | **1-64 bayt** | [API] |
| Inline natija `id` | 1-64 bayt; `next_offset` <=64 bayt; `start_parameter` 1-64 | [API] |
| `setMyCommands` | <=100 buyruq; buyruq <=32 belgi `a-z0-9_` | [API], [FEA] |
| Deep link parametr | <=64 belgi `A-Za-z0-9_-` | [FEA] |
| Flood: bitta chat | ~1 xabar/soniya (qisqa portlashlar mumkin, keyin 429) | [FAQ] |
| Flood: guruh | <=20 xabar/daqiqa | [FAQ] |
| Flood: ommaviy | ~30 xabar/soniya; pullik broadcast 1000/s (0.1 Star/xabar) | [FAQ], [API] |
| Test muhiti | Flood limitlari ko'tarilmaydi, ba'zan qattiqroq | [FEA] |
| Inline tugmalar | `switch_inline_query_current_chat` kabi tugmalar kanallarda yo'q; `copy_text` bor; **bitta qatordagi/umumiy tugmalar soni limiti TASDIQLANMADI** | [API] |
| Fayllar (rasmiy server) | Yuklab olish 20 MB, yuklash 50 MB; local Bot API: 2000 MB | [FEA] |
| 429 | `retry_after` ga rioya qilish | [FAQ] |

## 10. Til va RTL

| Fakt | Qiymat | Manba |
|---|---|---|
| `language_code` | Yangilanishlarda IETF til tegi, **ixtiyoriy, bo'sh bo'lishi mumkin**; umumiy auditoriya uchun oxirgi yozilgan tegga, so'ng inglizchaga qaytish tavsiya | [FEA] |
| Mahalliylashtirish | Bot nomi/tavsifi/about va buyruqlar ro'yxati har til uchun (`setMyCommands.language_code` — ikki harfli ISO 639-1) | [FEA], [API] |
| Mini App | Foydalanuvchi `language_code` ni oladi (`initData.user`) | [WEB], [FEA] |
| `uz` lotin va kirill farqi | **TASDIQLANMADI** (hujjat `uz-Latn`/`uz-Cyrl` kabi tegni va'da qilmaydi; kutilgan qiymat "uz", ko'rsatilgan manbalarda yozuv yo'q) | — |
| RTL | Faqat rich xabarda `RichMessage.is_rtl` / `InputRichMessage.is_rtl` bor; oddiy matn uchun bunday parametr hujjatda **TASDIQLANMADI**. Widgetlarda RTL interfeysda chap-chekka (o'ng) 20 px gesturelar uchun band | [API], [WID] |
| Arabcha matn bilan eslatma | Telegram oddiy xabarda bidi'ni o'zi hal qiladi degan rasmiy bayonot **TASDIQLANMADI**; ifodani (raqam/operator) arabcha matn ichida yuborishda LRM/RLM kerakligi hujjatda yo'q |  — |

---

## Dizayn xulosalari (kalkulyator botiga ta'siri; Xulosa = mening hosilam)

1. **Asosiy kanal — inline mode.** Kalkulyator uchun eng mos: `inline_query.query` <=256 belgi, javobda 1 ta `InlineQueryResultArticle` (`id` <=64 bayt, masalan hash(ifoda)), `InputTextMessageContent` bilan natija matni. `cache_time` default 300 — ifodalar deterministik, shuning uchun keshni 300+ qoldirib, `is_personal=false` qilish Workers so'rovlarini kamaytiradi. `chosen_inline_result` kerak emas (kuzatuv yoqilmasin yoki 1/100 qilib).
2. **Workers latency/javob muddati.** Inline javob timeouti rasmiy ko'rsatilmagan (TASDIQLANMADI), shuning uchun hisoblash sinxron va tez (kutubxonasiz parser) bo'lsin; `pre_checkout_query` 10 s, widget query 15 s qoidalari bor, shu tufayli Stars/widget handlerlari 2-3 s ichida javob qaytarsin. Webhook: har doim tez 200 qaytaring, og'ir ishni `ctx.waitUntil` ga bering, 2XX bo'lmasa qayta yuboriladi; `update_id` bo'yicha dedupe (KV/DO) qo'shing.
3. **allowed_updates aniq ro'yxat.** Minimal: `message`, `inline_query`, `callback_query`, `guest_message` (Guest mode yoqilsa), `pre_checkout_query`, `chosen_inline_result` (faqat kerak bo'lsa). Stars ishlatilsa `pre_checkout_query` unutilmasin; `widget_query` faqat widget bo'lsa.
4. **Guest mode — ikkinchi kanal, bir marta javob.** Guruhda "@tezcalc_bot 12*3+4" ni `guest_message` sifatida qabul qilib `answerGuestQuery` bilan **bitta** javob (InlineQueryResultArticle) qaytarish mumkin; qayta tahrirlash/ikkinchi javob rejalashtirilmasin; tarixni o'qib bo'lmaydi, shuning uchun ifoda xabar matnida to'liq bo'lishi kerak.
5. **Widgets hozircha ixtiyoriy/kelajak.** Production'da faqat shaxsiy chat, tarmoq yo'q, 32 KB / 4 KB zlib, so'rov <=64 bayt, 5/5s. Kalkulyator tugma paneli widgetga mos nomzod (hisoblashni QuickJS'da lokal qilish mumkin, bot'ga so'rov shart emas), lekin CPU/RAM limiti TASDIQLANMAGAN va forward yo'q — avval oddiy inline/inline-klaviatura MVP, widget keyin.
6. **Til va matn.** `language_code` bo'sh bo'lishi mumkin -> `uz` (lotin) default, `ru`, `en` zaxira; `uz` kirill/lotin farqi hujjatda yo'q, shuning uchun til tanlovini foydalanuvchi sozlamasida (KV) saqlang. Arabcha/RTL: oddiy xabarda RTL bayrog'i yo'q (faqat rich `is_rtl`), natijani chap-to-o'ngda saqlash uchun ifodani `<code>` ichiga olish va Unicode LRM ishlatish xavfsizroq (sinash kerak, hujjatda tasdiq yo'q). Natija matni 4096 belgidan oshmasin; MarkdownV2 da `. - ( ) = + !` kabi belgilar kalkulyator ifodalarida ko'p, shuning uchun `parse_mode=HTML` yoki `entities` ishlatish xavfsizroq.
