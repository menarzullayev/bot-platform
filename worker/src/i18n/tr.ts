import type { Messages } from "./types";

export const tr: Messages = {
  start:
    "👋 Merhaba {name}!\n\n" +
    "Ben <b>TezCalc</b>, Telegram'ın içinde çalışan hızlı bir hesap makinesiyim. Bir ifade gönderin, cevabı hemen vereyim:\n\n" +
    "<code>12*(3+4)</code>\n<code>480 * 15%</code>\n<code>100 km to mi</code>\n<code>50 USD to EUR</code>\n\n" +
    "Satır içi (inline) modda ve her sohbette de çalışırım. Ayrıntılar: /help.",

  help:
    "<b>📖 TezCalc nasıl kullanılır</b>\n\n" +
    "<b>Hesaplamalar</b>\n" +
    "Sadece bir ifade gönderin:\n" +
    "<code>2+3*4</code> · <code>(15+5)/4</code> · <code>2^10</code>\n" +
    "Fonksiyonlar: <code>sqrt(144)</code>, <code>sin(30)</code>, <code>ln(10)</code>, <code>abs(-5)</code>, <code>5!</code>. Sabitler: <code>pi</code>, <code>e</code>.\n\n" +
    "<b>Yüzdeler</b>\n" +
    "<code>480 * 15%</code> → 72\n" +
    "<code>200 + 10%</code> → 220\n" +
    "<code>80 - 25%</code> → 60\n\n" +
    "<b>Birimler ve para birimleri</b>\n" +
    "<code>100 km to mi</code>, <code>72 kg to lb</code>, <code>30 C to F</code>\n" +
    "<code>50 USD to EUR</code>, <code>1000000 UZS to USD</code>\n" +
    "Daha fazlası: /convert\n\n" +
    "<b>Finans</b>\n" +
    "Kredi taksiti: <code>/loan 50000 18 24</code> (tutar, yıllık faiz oranı %, ay sayısı). Daha fazlası: /loan\n\n" +
    "<b>Satır içi (inline) mod</b>\n" +
    "Herhangi bir sohbette <code>@tezcalc_bot 480 * 15%</code> yazın ve göndermek için sonucu seçin.\n\n" +
    "<b>Misafir modu</b>\n" +
    "Beni eklemediğiniz bir sohbette bile <code>@tezcalc_bot</code> yazıp ardından bir ifade girin, cevap veririm.\n\n" +
    "🧾 /vat · 🧠 /solve · /derive · /integrate (Pro) · 🧮 /widget · 📱 /app\n" +
    "⚙️ /settings · 🎨 /style · 🕘 /history · 🌐 /lang · ⭐ /pro",

  lang_menu_title: "🌐 Dilinizi seçin",
  lang_changed: "✅ Dil Türkçe olarak değiştirildi.",
  settings_title: "⚙️ <b>Ayarlar</b>",
  settings_angle: "📐 Trigonometri için açı birimi: derece (<code>deg</code>) veya radyan (<code>rad</code>)",
  settings_digits: "🔢 Sonuçlardaki ondalık basamak sayısı",
  btn_back: "↩️ Geri",
  btn_cancel: "İptal",
  btn_delete: "🗑 Verilerimi sil",

  err_syntax: "⚠️ {pos}. konumun yakınında sözdizimi hatası var. Parantezleri ve işleçleri kontrol edin.",
  err_div0: "⚠️ Sıfıra bölme tanımsızdır.",
  err_domain: "⚠️ Bu değer fonksiyonun tanım kümesinin dışında (örneğin negatif sayının karekökü veya sıfırın logaritması).",
  err_overflow: "⚠️ Sonuç görüntülenemeyecek kadar büyük.",
  err_unknown: "⚠️ “{name}” ifadesini tanımıyorum. Fonksiyon, birim veya para biriminin yazımını kontrol edin.",
  err_too_long: "⚠️ İfade çok uzun. Lütfen kısaltın.",
  err_units_mismatch: "⚠️ Bu birimler birbirine dönüştürülemez (örneğin uzunluk ile kütle).",
  err_no_rate: "⚠️ Şu anda {pair} için kur bulunamıyor. Lütfen daha sonra tekrar deneyin.",
  err_generic: "⚠️ Bir şeyler ters gitti. Lütfen tekrar deneyin.",
  rate_limited: "⏳ Çok fazla istek gönderdiniz. Biraz bekleyip tekrar deneyin.",

  history_title: "🕘 <b>Geçmiş</b>",
  history_empty: "Geçmişiniz boş. Geçmiş açıkken (Pro) hesaplamalar burada saklanır.",
  history_cleared: "🗑 Geçmiş temizlendi.",

  fx_updated: "💱 Kurlar güncellendi: {date}",
  fx_stale: "⚠️ Döviz kurları güncel değil (son güncelleme: {date}). Sonuç hatalı olabilir.",

  pro_title: "⭐ <b>TezCalc Pro</b>",
  pro_features:
    "✅ Adım adım çözüm\n" +
    "✅ Fonksiyon grafikleri\n" +
    "✅ Cihazlar arasında geçmiş senkronizasyonu\n" +
    "✅ Sınırsız geçmiş\n" +
    "✅ Gelişmiş birimler ve para birimleri",
  pro_price: "💳 Fiyat: 30 gün için {stars} ⭐ Telegram Yıldızı. Ödemeyi Telegram alır, abonelik otomatik olarak yenilenir.",
  pro_active: "✅ Pro aboneliğiniz {date} tarihine kadar aktif.",
  pro_required: "🔒 Bu özellik TezCalc Pro'ya dahildir. Ayrıntılar için /pro.",
  pro_thanks: "🎉 Teşekkürler! Pro etkinleştirildi. Adım adım çözümlerin, grafiklerin ve sınırsız geçmişin keyfini çıkarın.",
  pro_already: "Zaten aktif bir Pro aboneliğiniz var.",
  pro_cancel_info:
    "İptal etmek için Telegram → Ayarlar → Yıldızlarım → Abonelikler bölümünden TezCalc Pro'yu iptal edin. " +
    "Ödediğiniz dönemin sonuna kadar Pro kullanmaya devam edersiniz.",

  privacy:
    "<b>🔒 Gizlilik politikası</b>\n\n" +
    "<b>Neleri saklıyoruz</b>\n" +
    "• Telegram kimliğiniz, diliniz ve ayarlarınız (açı birimi, ondalık basamak sayısı).\n" +
    "• Hesaplama geçmişiniz, yalnızca geçmiş açıksa (Pro).\n" +
    "• Ödeme tanımlayıcıları (Yıldız ödemesi ve abonelik kimlikleri); Pro aboneliğinizi doğrulamak ve desteklemek için.\n\n" +
    "<b>Neleri yapmıyoruz</b>\n" +
    "• Gönderdiğiniz ifadeler yalnızca cevabı hesaplamak için işlenir; geçmiş kapalıysa saklanmaz.\n" +
    "• Verilerinizi satmıyoruz, üçüncü taraflarla paylaşmıyoruz ve reklam için kullanmıyoruz. Ödemeleri Telegram işler, kart bilgilerinizi görmeyiz.\n" +
    "• Döviz kurları herkese açık bir kaynaktan alınır; oraya kişisel verileriniz gönderilmez.\n\n" +
    "<b>Kontrol sizde</b>\n" +
    "/deleteme komutuyla ayarlarınızı, geçmişinizi ve saklanan verilerinizi istediğiniz zaman silebilirsiniz.",

  terms:
    "<b>📄 Kullanım koşulları</b>\n\n" +
    "1. TezCalc bir hesaplama aracıdır. Sonuçlar “olduğu gibi” sunulur ve hata içerebilir; önemli sayıları kendiniz de kontrol edin. Döviz kurları yaklaşıktır ve finansal tavsiye niteliği taşımaz.\n" +
    "2. Pro, Telegram Yıldızları ile ödenen dijital bir hizmettir. 30 günlük bir aboneliktir ve Telegram'dan iptal edene kadar otomatik olarak yenilenir.\n" +
    "3. İade ve ödeme sorunları için: /paysupport.\n" +
    "4. Botu kötüye kullanmayın (spam, otomatik toplu istekler, botu bozmaya çalışmak). Kötüye kullanımı sınırlayabilir veya engelleyebiliriz.\n" +
    "5. Bot ve bu koşullar güncellenebilir. Kullanmaya devam etmeniz, güncel koşulları kabul ettiğiniz anlamına gelir.",

  paysupport:
    "<b>💬 Ödeme desteği</b>\n\n" +
    "Yıldız ödemenizde bir sorun mu var ya da iade mi istiyorsunuz? Aşağıdaki iletişim üzerinden yazıp sorunu anlatın. " +
    "Lütfen ödeme tarihini ve Yıldız miktarını belirtin.\n\n" +
    "Her talep ayrı ayrı incelenir. İade edilen Yıldızlar Telegram bakiyenize geri döner. " +
    "Sonraki tahsilatları durdurmak için aboneliği /pro içinde anlatıldığı gibi iptal edin.",

  deleteme_confirm:
    "⚠️ Ayarlarınız, geçmişiniz ve saklanan verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz.\n\n" +
    "Aktif Pro aboneliği otomatik olarak iptal edilmez. Önce Telegram'dan iptal edin (bkz. /pro). Devam edilsin mi?",
  deleteme_done: "✅ Verileriniz silindi.",

  unknown_command: "Bilinmeyen komut. Neler yapabildiğimi görmek için /help yazın.",

  inline_help_title: "Bir ifade yazın",
  inline_help_desc: "Örneğin: 12*(3+4) veya 100 km to mi",
  inline_result_desc: "Sonucu göndermek için dokunun",
  guest_hint: "İpucu: herhangi bir sohbette @tezcalc_bot yazıp ardından bir ifade girin, örneğin @tezcalc_bot 12*(3+4)",

  converter_help:
    "<b>🔄 Dönüştürücü</b>\n" +
    "Birimler ve para birimleri tek satırda:\n" +
    "<code>/convert 100 km mi</code>\n" +
    "<code>/convert 50 USD EUR</code>\n" +
    "Ya da doğrudan <code>100 km to mi</code> yazın.\n\n" +
    "Desteklenenler: uzunluk, kütle, hacim, sıcaklık, hız, alan, zaman, veri boyutu ve birçok dünya para birimi.",

  loan_help:
    "<b>🏦 Kredi hesaplayıcı</b>\n" +
    "<code>/loan tutar faiz ay</code>\n" +
    "Örnek: <code>/loan 50000 18 24</code>, yıllık %18 faizle 24 ay vadeli 50.000 tutarında kredidir.\n\n" +
    "Aylık taksiti, toplam ödemeyi ve toplam faizi gösteririm (eşit taksitli ödeme).",
  loan_label_monthly: "Aylık taksit",
  loan_label_total: "Toplam ödeme",
  loan_label_interest: "Toplam faiz",

  widget_open: "🧮 Widget'ı aç",
  mini_open: "📱 Mini Uygulamayı aç",

  cmd_start: "Botu başlat",
  cmd_help: "TezCalc nasıl kullanılır",
  cmd_lang: "Dili değiştir",
  cmd_settings: "Ayarlar",
  cmd_history: "Hesaplama geçmişi",
  cmd_convert: "Birim ve para birimi dönüştür",
  cmd_loan: "Kredi hesaplayıcı",
  cmd_pro: "TezCalc Pro aboneliği",
  cmd_privacy: "Gizlilik politikası",
  cmd_terms: "Kullanım koşulları",
  cmd_paysupport: "Ödeme desteği ve iade",
  cmd_deleteme: "Verilerimi sil",

  bot_name: "TezCalc: Hesap Makinesi",
  bot_short_description: "Matematik, yüzde, birim, döviz ve kredi için hızlı hesap makinesi. Satır içi modda ve her sohbette çalışır.",
  bot_description:
    "TezCalc, Telegram'ın içinde çalışan hızlı bir hesap makinesidir. Bir ifade gönderin, cevabı anında alın. " +
    "Yüzdeler, birim ve döviz dönüşümü, kredi taksitleri. Sohbette, satır içi modda (@tezcalc_bot) ve misafir modu sayesinde her grupta çalışır. " +
    "Pro; adım adım çözüm, grafik ve senkronize geçmiş ekler.",
  bot_about:
    "<b>🧮 TezCalc</b>\n\n" +
    "Telegram için hızlı ve kullanışlı bir hesap makinesi: günlük hesaplar, yüzdeler, birim ve döviz dönüşümü, kredi hesapları. " +
    "Bu sohbette, herhangi bir konuşmada satır içi modda, misafir modunda veya Mini Uygulamada kullanın.\n\n" +
    "Günlük kullanım ücretsizdir. TezCalc Pro (/pro); adım adım çözüm, grafik ve cihazlar arasında senkronize geçmiş ekler.\n\n" +
    "/help · /privacy · /terms",

  // calc template (command handlers)
  not_math_hint: "🤔 Bu bir hesaplamaya benzemiyor. <code>12*(3+4)</code> veya <code>100 km to mi</code> gibi bir ifade gönderin. Ayrıntılar: /help.",
  settings_history: "🕘 Hesaplama geçmişini kaydet",
  btn_on: "Açık",
  btn_off: "Kapalı",
  loan_schedule_title: "📅 İlk {n} ay",
  loan_row_legend: "ay. taksit = anapara + faiz → kalan",
  vat_help: "<b>🧾 KDV hesaplayıcı</b>\n<code>/vat 1000000</code> — tutara %12 KDV ekler.\n<code>/vat 1120000 remove</code> — KDV dahil tutardan KDV'yi ayırır.\n<code>/vat 1000000 15</code> — başka oran (yüzde).",
  vat_label_net: "KDV hariç tutar",
  vat_label_vat: "KDV",
  vat_label_gross: "KDV dahil tutar",
  widget_unavailable: "⚠️ Widget yalnızca botla özel sohbette gönderilebilir ve şu anda kullanılamıyor olabilir.",
  symbolic_help: "<b>🧠 Adım adım çözümler (Pro)</b>\n<code>/solve x^2-5x+6=0</code> — denklem veya ifade.\n<code>/derive x^3*sin(x)</code> — türev.\n<code>/integrate x*e^x</code> — belirsiz integral.",
  err_parse: "⚠️ İfadeyi okuyamadım. Parantezleri ve işleçleri kontrol edin.",
  err_unsupported: "⚠️ Bu tür bir problemi henüz çözemiyorum.",
  err_too_complex: "⚠️ Bu, sohbet için fazla karmaşık. Mini Uygulamada açın.",
  deleteme_payments_note: "Ödeme kayıtları ve Pro süreniz saklanır: iade ve muhasebe için gereklidir.",
  cmd_vat: "KDV hesaplayıcı",
  cmd_solve: "Adım adım çözüm (Pro)",
  cmd_derive: "Adım adım türev (Pro)",
  cmd_integrate: "Adım adım integral (Pro)",
  cmd_widget: "Hesap makinesi widget'ı",
  cmd_app: "Mini Uygulamayı aç",
  style_title: "🎨 <b>Mini Uygulama stili</b>\nTezCalc Mini Uygulamasının görünümünü seçin.",
  style_current: "Geçerli stil:",
  style_tactile: "Dokunsal 3D",
  style_glass: "Cam",
  style_fintech: "Fintech",
  style_techno: "Tekno HUD",
  style_changed: "✅ Stil kaydedildi",
  style_open_app: "📱 Mini Uygulamayı aç",
  cmd_style: "Mini Uygulama stilini değiştir",
};
