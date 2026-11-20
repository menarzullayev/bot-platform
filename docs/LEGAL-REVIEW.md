# Legal text review pack: @tezcalc_bot

Generated from the live i18n catalog (`src/i18n`). Texts are sent as Telegram HTML (`<b>`, `<code>`); tags are shown as-is.

## What the reviewer should verify

1. **Accuracy against the real system** (see "Facts about the system" below): nothing is promised that the bot does not do.
2. **Legal adequacy** for the jurisdictions of the users (Uzbekistan, CIS, EU/Turkey/LatAm): personal data notice, consumer refund rules, subscription terms, limitation of liability.
3. **Telegram requirements for Stars bots:** privacy policy reachable via `/privacy`, `/terms`, `/paysupport` with a working contact, refunds via Telegram.
4. **Language quality** (native reader), especially Arabic (RTL), Turkish, Spanish and the automatic Uzbek Cyrillic transliteration.
5. Telegram UI names used in the texts (e.g. "My Stars", "Subscriptions") match each language's Telegram app.

## Facts about the system (for the reviewer)

- Stored per user (D1 database on Cloudflare): Telegram user id, language, calculator settings (angle unit, digits, history on/off), calculation history only if the user turned it on, Pro subscription period, Stars payment identifiers (charge id, amount, dates).
- Not stored: message text outside history, phone numbers, contacts. Exchange rates come from the Central Bank of Uzbekistan (cbu.uz) with open.er-api.com as fallback; no user data is sent to them.
- `/deleteme` removes settings, history and bot-user rows; payment records are kept (accounting/refunds).
- Pro = 150 Telegram Stars per 30 days (configurable), billed and renewed by Telegram; refunds by the owner via `refundStarPayment`.
- Support contact shown in the texts: @menarzullayev.


---

## `privacy`

### English (source)

```html
<b>🔒 Privacy policy</b>

<b>What we store</b>
• Your Telegram ID, your language and your settings (angle unit, decimal places).
• Your calculation history, only if history is on (Pro).
• Payment identifiers (Stars payment and subscription IDs) so we can confirm and support your Pro subscription.

<b>What we don't do</b>
• Expressions you send are processed only to compute the answer and are not kept when history is off.
• We never sell your data and we don't share it with third parties or use it for advertising. Payments are processed by Telegram; we never see your card details.
• Exchange rates are loaded from a public rate source; none of your personal data is sent there.

<b>Your control</b>
Send /deleteme to delete your settings, history and stored data at any time.
```

### O'zbekcha (lotin)

```html
<b>🔒 Maxfiylik siyosati</b>

<b>Nimalar saqlanadi</b>
• Telegram identifikatoringiz, tilingiz va sozlamalaringiz (burchak birligi, kasr xonalari soni).
• Hisob-kitoblar tarixi — faqat tarix yoqilgan boʻlsa (Pro).
• Toʻlov identifikatorlari (Stars toʻlovi va obuna identifikatorlari) — Pro obunangizni tasdiqlash va qoʻllab-quvvatlash uchun.

<b>Nimalar qilinmaydi</b>
• Yuborgan ifodalaringiz faqat javobni hisoblash uchun qayta ishlanadi, tarix oʻchiq boʻlsa saqlanmaydi.
• Maʼlumotlaringiz sotilmaydi, uchinchi shaxslarga berilmaydi va reklama uchun ishlatilmaydi. Toʻlovlarni Telegram qayta ishlaydi, karta maʼlumotlaringizni biz koʻrmaymiz.
• Valyuta kurslari ochiq manbadan olinadi, u yerga shaxsiy maʼlumotlaringiz yuborilmaydi.

<b>Nazorat sizda</b>
Sozlamalar, tarix va saqlangan maʼlumotlarni istalgan vaqtda /deleteme buyrugʻi bilan oʻchirishingiz mumkin.
```

### Ўзбекча (кирилл)

```html
<b>🔒 Махфийлик сиёсати</b>

<b>Нималар сақланади</b>
• Telegram идентификаторингиз, тилингиз ва созламаларингиз (бурчак бирлиги, каср хоналари сони).
• Ҳисоб-китоблар тарихи — фақат тарих ёқилган бўлса (Pro).
• Тўлов идентификаторлари (Stars тўлови ва обуна идентификаторлари) — Pro обунангизни тасдиқлаш ва қўллаб-қувватлаш учун.

<b>Нималар қилинмайди</b>
• Юборган ифодаларингиз фақат жавобни ҳисоблаш учун қайта ишланади, тарих ўчиқ бўлса сақланмайди.
• Маълумотларингиз сотилмайди, учинчи шахсларга берилмайди ва реклама учун ишлатилмайди. Тўловларни Telegram қайта ишлайди, карта маълумотларингизни биз кўрмаймиз.
• Валюта курслари очиқ манбадан олинади, у ерга шахсий маълумотларингиз юборилмайди.

<b>Назорат сизда</b>
Созламалар, тарих ва сақланган маълумотларни исталган вақтда /deleteme буйруғи билан ўчиришингиз мумкин.
```

### Русский

```html
<b>🔒 Политика конфиденциальности</b>

<b>Что мы храним</b>
• Ваш Telegram ID, язык и настройки (единица угла, число знаков после запятой).
• Историю вычислений — только если история включена (Pro).
• Идентификаторы платежей (ID платежей и подписок в Stars), чтобы подтверждать и поддерживать вашу подписку Pro.

<b>Чего мы не делаем</b>
• Отправленные вами выражения обрабатываются только для получения ответа и не сохраняются, если история выключена.
• Мы не продаём ваши данные, не передаём их третьим лицам и не используем для рекламы. Платежи проводит Telegram, данные вашей карты нам недоступны.
• Курсы валют загружаются из открытого источника, ваши персональные данные туда не передаются.

<b>Контроль у вас</b>
Команда /deleteme в любой момент удалит ваши настройки, историю и сохранённые данные.
```

### Türkçe

```html
<b>🔒 Gizlilik politikası</b>

<b>Neleri saklıyoruz</b>
• Telegram kimliğiniz, diliniz ve ayarlarınız (açı birimi, ondalık basamak sayısı).
• Hesaplama geçmişiniz, yalnızca geçmiş açıksa (Pro).
• Ödeme tanımlayıcıları (Yıldız ödemesi ve abonelik kimlikleri); Pro aboneliğinizi doğrulamak ve desteklemek için.

<b>Neleri yapmıyoruz</b>
• Gönderdiğiniz ifadeler yalnızca cevabı hesaplamak için işlenir; geçmiş kapalıysa saklanmaz.
• Verilerinizi satmıyoruz, üçüncü taraflarla paylaşmıyoruz ve reklam için kullanmıyoruz. Ödemeleri Telegram işler, kart bilgilerinizi görmeyiz.
• Döviz kurları herkese açık bir kaynaktan alınır; oraya kişisel verileriniz gönderilmez.

<b>Kontrol sizde</b>
/deleteme komutuyla ayarlarınızı, geçmişinizi ve saklanan verilerinizi istediğiniz zaman silebilirsiniz.
```

### العربية (RTL)

```html
<b>🔒 سياسة الخصوصية</b>

<b>ما الذي نحفظه</b>
• معرّف تيليجرام الخاص بك ولغتك وإعداداتك (وحدة الزاوية وعدد المنازل العشرية).
• سجل عملياتك الحسابية، فقط إذا كان السجل مفعّلًا (Pro).
• معرّفات الدفع (معرّفات مدفوعات الاشتراك بالنجوم) لتأكيد اشتراكك في Pro ودعمه.

<b>ما الذي لا نفعله</b>
• تتم معالجة العمليات التي ترسلها فقط لحساب النتيجة، ولا تُحفظ إذا كان السجل معطّلًا.
• لا نبيع بياناتك ولا نشاركها مع أطراف ثالثة ولا نستخدمها للإعلانات. يعالج تيليجرام المدفوعات ولا نطّلع على بيانات بطاقتك.
• تُجلب أسعار الصرف من مصدر عام، ولا يُرسل إليه أي شيء من بياناتك الشخصية.

<b>التحكم بيدك</b>
أرسل /deleteme في أي وقت لحذف إعداداتك وسجلك وبياناتك المحفوظة.
```

### Español

```html
<b>🔒 Política de privacidad</b>

<b>Qué guardamos</b>
• Tu ID de Telegram, tu idioma y tus ajustes (unidad de ángulo, número de decimales).
• Tu historial de cálculos, solo si el historial está activado (Pro).
• Identificadores de pago (ID de pagos y suscripciones con Estrellas) para confirmar y atender tu suscripción Pro.

<b>Qué no hacemos</b>
• Las expresiones que envías se procesan solo para calcular la respuesta y no se guardan si el historial está desactivado.
• No vendemos tus datos, no los compartimos con terceros ni los usamos para publicidad. Los pagos los procesa Telegram; nunca vemos los datos de tu tarjeta.
• Los tipos de cambio se obtienen de una fuente pública; no se envía ningún dato personal tuyo.

<b>El control es tuyo</b>
Con /deleteme puedes borrar en cualquier momento tus ajustes, tu historial y los datos guardados.
```

---

## `terms`

### English (source)

```html
<b>📄 Terms of use</b>

1. TezCalc is a calculation tool. Results are provided as is and may contain errors; check important numbers yourself. Exchange rates are indicative and are not financial advice.
2. Pro is a digital service paid with Telegram Stars. It is a 30-day subscription that renews automatically until you cancel it in Telegram.
3. Refunds and payment problems: see /paysupport.
4. Don't abuse the bot (flooding, automated mass requests, attempts to break it). We may limit or block abusive use.
5. We may update the bot and these terms. Continued use means you accept the current terms.
```

### O'zbekcha (lotin)

```html
<b>📄 Foydalanish shartlari</b>

1. TezCalc — hisoblash vositasi. Natijalar “boricha” taqdim etiladi va xato boʻlishi mumkin; muhim raqamlarni oʻzingiz ham tekshiring. Valyuta kurslari taxminiy va moliyaviy maslahat hisoblanmaydi.
2. Pro — Telegram Stars bilan toʻlanadigan raqamli xizmat. U 30 kunlik obuna boʻlib, Telegram orqali bekor qilmaguningizcha avtomatik yangilanadi.
3. Qaytarish va toʻlov muammolari: /paysupport.
4. Botdan suiisteʼmol qilmang (spam, avtomatik ommaviy soʻrovlar, buzishga urinish). Bunday holatda foydalanishni cheklashimiz yoki toʻxtatishimiz mumkin.
5. Bot va shartlar yangilanishi mumkin. Foydalanishni davom ettirsangiz, amaldagi shartlarga rozi boʻlgan hisoblanasiz.
```

### Ўзбекча (кирилл)

```html
<b>📄 Фойдаланиш шартлари</b>

1. TezCalc — ҳисоблаш воситаси. Натижалар “борича” тақдим этилади ва хато бўлиши мумкин; муҳим рақамларни ўзингиз ҳам текширинг. Валюта курслари тахминий ва молиявий маслаҳат ҳисобланмайди.
2. Pro — Telegram Stars билан тўланадиган рақамли хизмат. У 30 кунлик обуна бўлиб, Telegram орқали бекор қилмагунингизча автоматик янгиланади.
3. Қайтариш ва тўлов муаммолари: /paysupport.
4. Ботдан суиистеъмол қилманг (спам, автоматик оммавий сўровлар, бузишга уриниш). Бундай ҳолатда фойдаланишни чеклашимиз ёки тўхтатишимиз мумкин.
5. Бот ва шартлар янгиланиши мумкин. Фойдаланишни давом эттирсангиз, амалдаги шартларга рози бўлган ҳисобланасиз.
```

### Русский

```html
<b>📄 Условия использования</b>

1. TezCalc — инструмент для вычислений. Результаты предоставляются «как есть» и могут содержать ошибки; важные числа проверяйте самостоятельно. Курсы валют ориентировочные и не являются финансовой рекомендацией.
2. Pro — цифровая услуга, оплачиваемая Telegram Stars. Это подписка на 30 дней, которая продлевается автоматически, пока вы не отмените её в Telegram.
3. Возвраты и проблемы с оплатой: /paysupport.
4. Не злоупотребляйте ботом (флуд, автоматические массовые запросы, попытки взлома). Мы можем ограничить или заблокировать такое использование.
5. Бот и эти условия могут обновляться. Продолжая пользоваться ботом, вы принимаете действующие условия.
```

### Türkçe

```html
<b>📄 Kullanım koşulları</b>

1. TezCalc bir hesaplama aracıdır. Sonuçlar “olduğu gibi” sunulur ve hata içerebilir; önemli sayıları kendiniz de kontrol edin. Döviz kurları yaklaşıktır ve finansal tavsiye niteliği taşımaz.
2. Pro, Telegram Yıldızları ile ödenen dijital bir hizmettir. 30 günlük bir aboneliktir ve Telegram'dan iptal edene kadar otomatik olarak yenilenir.
3. İade ve ödeme sorunları için: /paysupport.
4. Botu kötüye kullanmayın (spam, otomatik toplu istekler, botu bozmaya çalışmak). Kötüye kullanımı sınırlayabilir veya engelleyebiliriz.
5. Bot ve bu koşullar güncellenebilir. Kullanmaya devam etmeniz, güncel koşulları kabul ettiğiniz anlamına gelir.
```

### العربية (RTL)

```html
<b>📄 شروط الاستخدام</b>

1. TezCalc أداة للحساب. تُقدَّم النتائج «كما هي» وقد تحتوي على أخطاء، لذا تحقق بنفسك من الأرقام المهمة. أسعار الصرف تقريبية وليست نصيحة مالية.
2. Pro خدمة رقمية تُدفع بنجوم تيليجرام. وهو اشتراك لمدة 30 يومًا يتجدد تلقائيًا إلى أن تلغيه من تيليجرام.
3. للاسترداد ومشكلات الدفع: /paysupport.
4. لا تسئ استخدام البوت (الرسائل المزعجة، الطلبات الآلية الكثيفة، محاولات اختراقه). يحق لنا تقييد هذا الاستخدام أو حظره.
5. قد يتم تحديث البوت وهذه الشروط. استمرارك في الاستخدام يعني موافقتك على الشروط الحالية.
```

### Español

```html
<b>📄 Condiciones de uso</b>

1. TezCalc es una herramienta de cálculo. Los resultados se ofrecen «tal cual» y pueden contener errores; comprueba por tu cuenta las cifras importantes. Los tipos de cambio son orientativos y no constituyen asesoramiento financiero.
2. Pro es un servicio digital que se paga con Estrellas de Telegram. Es una suscripción de 30 días que se renueva automáticamente hasta que la canceles en Telegram.
3. Reembolsos y problemas de pago: consulta /paysupport.
4. No abuses del bot (spam, solicitudes masivas automatizadas, intentos de vulnerarlo). Podemos limitar o bloquear un uso abusivo.
5. El bot y estas condiciones pueden actualizarse. Si sigues usándolo, aceptas las condiciones vigentes.
```

---

## `paysupport`

### English (source)

```html
<b>💬 Payment support</b>

Having a problem with a Stars payment or want a refund? Write to the contact below and describe the issue. Please include the payment date and the number of Stars.

Each request is reviewed individually. Refunded Stars return to your Telegram balance. To stop future charges, cancel the subscription as described in /pro.
```

### O'zbekcha (lotin)

```html
<b>💬 Toʻlov boʻyicha yordam</b>

Stars toʻlovida muammo bormi yoki pulni qaytarmoqchimisiz? Quyidagi aloqa orqali yozib, muammoni bayon qiling. Toʻlov sanasi va Stars miqdorini ham koʻrsating.

Har bir murojaat alohida koʻrib chiqiladi. Qaytarilgan Stars Telegram balansingizga qaytadi. Keyingi yechib olishlarni toʻxtatish uchun /pro dagi koʻrsatma boʻyicha obunani bekor qiling.
```

### Ўзбекча (кирилл)

```html
<b>💬 Тўлов бўйича ёрдам</b>

Stars тўловида муаммо борми ёки пулни қайтармоқчимисиз? Қуйидаги алоқа орқали ёзиб, муаммони баён қилинг. Тўлов санаси ва Stars миқдорини ҳам кўрсатинг.

Ҳар бир мурожаат алоҳида кўриб чиқилади. Қайтарилган Stars Telegram балансингизга қайтади. Кейинги ечиб олишларни тўхтатиш учун /pro даги кўрсатма бўйича обунани бекор қилинг.
```

### Русский

```html
<b>💬 Поддержка по платежам</b>

Проблема с оплатой Stars или нужен возврат? Напишите по контакту ниже и опишите ситуацию. Укажите дату платежа и количество Stars.

Каждое обращение рассматривается индивидуально. Возвращённые Stars поступают на ваш баланс в Telegram. Чтобы прекратить дальнейшие списания, отмените подписку, как описано в /pro.
```

### Türkçe

```html
<b>💬 Ödeme desteği</b>

Yıldız ödemenizde bir sorun mu var ya da iade mi istiyorsunuz? Aşağıdaki iletişim üzerinden yazıp sorunu anlatın. Lütfen ödeme tarihini ve Yıldız miktarını belirtin.

Her talep ayrı ayrı incelenir. İade edilen Yıldızlar Telegram bakiyenize geri döner. Sonraki tahsilatları durdurmak için aboneliği /pro içinde anlatıldığı gibi iptal edin.
```

### العربية (RTL)

```html
<b>💬 دعم المدفوعات</b>

هل تواجه مشكلة في دفع بالنجوم أو ترغب في الاسترداد؟ راسلنا عبر جهة الاتصال أدناه واشرح المشكلة،مع ذكر تاريخ الدفع وعدد النجوم.

تتم مراجعة كل طلب على حدة. تعود النجوم المستردة إلى رصيدك في تيليجرام. لإيقاف أي خصومات لاحقة ألغِ الاشتراك كما هو موضح في /pro.
```

### Español

```html
<b>💬 Soporte de pagos</b>

¿Tienes un problema con un pago con Estrellas o quieres un reembolso? Escríbenos al contacto de abajo y describe el problema. Indica la fecha del pago y la cantidad de Estrellas.

Cada solicitud se revisa de forma individual. Las Estrellas reembolsadas vuelven a tu saldo de Telegram. Para evitar cargos futuros, cancela la suscripción como se explica en /pro.
```
