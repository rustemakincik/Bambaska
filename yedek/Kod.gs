/**
 * Bambaşka — günlük otomatik yedek (Google Apps Script)
 * bambaska.yedek@gmail.com hesabında çalışır. Her gece 04:00'te kafe verisini Firestore'dan okur,
 * JSON dosyası olarak bu adrese e-postayla gönderir ve 30 günden eski işlem geçmişi / çöp kutusu kayıtlarını temizler.
 *
 * Kurulum: 1) Bu kodu yapıştır  2) appsscript.json'u yapıştır  3) "kur" fonksiyonunu bir kez çalıştır, izin ver.
 */
var PROJE = 'bambaska-kafe';
var KAFE = 'bambaska';
var ALICI = 'bambaska.yedek@gmail.com';
var SAAT = 4;          // her gece 04:00 (İstanbul)
var SAKLA_GUN = 30;    // işlem geçmişi ve çöp kutusu kaç gün tutulur
var KOLEKSIYONLAR = ['depts', 'suppliers', 'items', 'movements', 'orders', 'users', 'assets', 'assetLog', 'services', 'tickets', 'trash', 'audit'];
var KOK = 'https://firestore.googleapis.com/v1/projects/' + PROJE + '/databases/(default)/documents';
var KAFE_YOLU = KOK + '/cafes/' + KAFE;

/** Bir kez çalıştır: zamanlayıcıyı kurar ve hemen bir deneme yedeği gönderir. */
function kur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('gunlukYedek').timeBased().atHour(SAAT).everyDays(1).inTimezone('Europe/Istanbul').create();
  gunlukYedek();
}

/** Her gece zamanlayıcı bunu çalıştırır. */
function gunlukYedek() {
  var basla = new Date();
  try {
    var veri = { version: 1, cafe: {}, yedekTarihi: basla.toISOString() };
    KOLEKSIYONLAR.forEach(function (c) {
      veri[c] = hepsiniOku(c).map(function (d) { var o = cozMap(d.fields || {}); delete o._t; return o; });
    });
    var meta = hepsiniOku('meta').filter(function (d) { return sonParca(d.name) === 'cafe'; })[0];
    if (meta) { veri.cafe = cozMap(meta.fields || {}); delete veri.cafe._t; }

    var json = JSON.stringify(veri);
    var tarih = Utilities.formatDate(basla, 'Europe/Istanbul', 'yyyy-MM-dd');
    var saat = Utilities.formatDate(basla, 'Europe/Istanbul', 'HH:mm');
    var ad = 'bambaska-yedek-' + tarih + '.json';
    var ozet = veri.items.length + ' malzeme · ' + veri.orders.length + ' sipariş · ' + veri.assets.length + ' demirbaş · ' + veri.users.length + ' kullanıcı';
    var guzelTarih = Utilities.formatDate(basla, 'Europe/Istanbul', 'd MMMM yyyy');

    var govde =
      '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">' +
      '<h2 style="margin:0 0 4px">Bambaşka günlük yedek</h2>' +
      '<div style="color:#666">' + guzelTarih + ' ' + saat + ' · ' + ozet + '</div>' +
      '<h3 style="margin:18px 0 6px">Sorun olursa geri yüklemek için</h3>' +
      '<ol style="margin:0;padding-left:20px">' +
      '<li>Bu e-postadaki <b>' + ad + '</b> dosyasını telefona indir.</li>' +
      '<li>Bambaşka uygulamasını <b>yönetici telefonundan</b> aç.</li>' +
      '<li><b>Ayarlar → Yedekten geri yükle</b> → indirdiğin dosyayı seç.</li>' +
      '<li>Onay kutusuna <b>GERİ YÜKLE</b> yaz.</li></ol>' +
      '<p style="margin-top:18px;padding:10px;background:#fff4d6;border-radius:8px">⚠️ Bu dosyada kullanıcı PIN\'leri de var. <b>Kimseyle paylaşma.</b></p>' +
      '</div>';

    MailApp.sendEmail({
      to: ALICI,
      subject: 'Bambaşka yedek · ' + tarih,
      htmlBody: govde,
      attachments: [Utilities.newBlob(json, 'application/json', ad)],
    });

    var silinen = temizle();
    durumYaz(true, ozet + (silinen ? ' · ' + silinen + ' eski kayıt temizlendi' : ''), json.length);
  } catch (e) {
    try { durumYaz(false, String(e && e.message || e), 0); } catch (x) {}
    MailApp.sendEmail({
      to: ALICI,
      subject: '⚠️ Bambaşka yedeği alınamadı',
      htmlBody: '<p>Bugünkü otomatik yedek alınamadı.</p><p><b>Hata:</b> ' + String(e && e.message || e) + '</p>' +
        '<p>Tekrar denemek için Apps Script\'te <b>gunlukYedek</b> fonksiyonunu çalıştırabilirsin. Uygulamadan da elle yedek alabilirsin: Ayarlar → Yedek indir.</p>',
    });
  }
}

// ---- 30 günden eski işlem geçmişi ve çöp kutusu kayıtlarını sil (yedeklerde durmaya devam eder)
function temizle() {
  var sinir = Date.now() - SAKLA_GUN * 864e5, silinecek = [];
  ['audit', 'trash'].forEach(function (c) {
    hepsiniOku(c).forEach(function (d) {
      var o = cozMap(d.fields || {});
      if (typeof o.at === 'number' && o.at < sinir) silinecek.push(d.name);
    });
  });
  for (var i = 0; i < silinecek.length; i += 400) {
    istek('post', KOK + ':commit', { writes: silinecek.slice(i, i + 400).map(function (n) { return { 'delete': n }; }) });
  }
  return silinecek.length;
}

// uygulamadaki "Son otomatik yedek" bilgisi
function durumYaz(ok, not, boyut) {
  istek('patch', KAFE_YOLU + '/sys/backup', { fields: {
    at: { integerValue: String(Date.now()) }, ok: { booleanValue: ok }, note: { stringValue: not || '' }, size: { integerValue: String(boyut || 0) },
  } });
}

// ---- Firestore REST (bu hesap projenin sahibi olduğu için tüm veriyi okuyabilir)
function istek(yontem, url, govde) {
  var r = UrlFetchApp.fetch(url, {
    method: yontem, contentType: 'application/json', muteHttpExceptions: true,
    payload: govde ? JSON.stringify(govde) : undefined,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJE },
  });
  var kod = r.getResponseCode(), metin = r.getContentText();
  if (kod === 404 && yontem === 'get') return null;
  if (kod >= 300) throw new Error('Firestore ' + kod + ': ' + metin.slice(0, 300));
  return metin ? JSON.parse(metin) : {};
}
function hepsiniOku(c) {
  var sonuc = [], sayfa = '';
  do {
    var j = istek('get', KAFE_YOLU + '/' + c + '?pageSize=300' + (sayfa ? '&pageToken=' + encodeURIComponent(sayfa) : ''));
    sonuc = sonuc.concat((j && j.documents) || []);
    sayfa = j && j.nextPageToken;
  } while (sayfa);
  return sonuc;
}
function coz(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(coz);
  if ('mapValue' in v) return cozMap(v.mapValue.fields || {});
  return null;
}
function cozMap(f) { var o = {}; Object.keys(f).forEach(function (k) { o[k] = coz(f[k]); }); return o; }
function sonParca(n) { return n.slice(n.lastIndexOf('/') + 1); }
