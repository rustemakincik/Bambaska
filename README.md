# Bambaşka Kafe Restoran — Yönetim Uygulaması

Telefonda çalışan (iPhone ve Android) kafe yönetim uygulaması. Kurulum gerektirmez; tarayıcıdan açılıp **Ana Ekrana Ekle** ile uygulama gibi kullanılır.

**Adres:** https://rustemakincik.github.io/Bambaska/

## Neler var
- **Stok ve sayım:** Bölüm sorumlusu (nargile, bar, mutfak…) elindeki malzemeyi girer.
- **Sipariş:** Minimumun altına düşen malzemeler tedarikçiye göre otomatik listelenir. Sorumlu onaya gönderir, yönetici düzenleyip onaylar ya da reddeder. Sipariş WhatsApp ile gönderilir, PDF sipariş formu alınır.
- **Demirbaş:** TV, uydu alıcısı, okey masası gibi eşyalar karekodlu etiketlerle takip edilir. Durumlar: aktif, arızalı, tamirde, kayıp, hurda.
- **Bulut senkronu (Firebase):** Tüm telefonlar aynı veriyi görür. İnternet yokken çalışmaya devam eder, bağlantı gelince gönderir.
- Temalar, kafe logosu ve adı, PIN ile giriş.

## Bulut kurulumu (bir kez)
1. Firebase'de proje aç, **Anonymous** girişi ve **Firestore**'u etkinleştir.
2. `firestore.rules` dosyasındaki kuralları Firestore → Rules sekmesine yapıştırıp yayınla.
3. `config.js` dosyasına `firebaseConfig` bilgilerini yaz.
4. Yönetici telefonunda: **Ayarlar → Bulutu kur**. Ardından **Cihaz ekle** karekodunu diğer telefonlarda okut.

## Dosyalar
| Dosya | Görevi |
|---|---|
| `index.html`, `style.css` | Sayfa ve tasarım |
| `app.js` | Ekranlar |
| `store.js` | Veri modeli |
| `sync.js` | Bulut senkron motoru (kayıt bazlı fark gönderme, çevrimdışı kuyruk) |
| `firebase-backend.js` | Firestore bağlantısı |
| `firestore.rules` | Güvenlik kuralları |
| `sw.js`, `manifest.webmanifest` | Çevrimdışı çalışma ve ana ekran simgesi |
| `vendor/qr.js` | Karekod üretici (Kazuhiko Arase, MIT) |
