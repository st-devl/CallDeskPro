# CALL CENTER — Hafif Web Tabanlı Görüşme ve Kuruluş Takip Sistemi

## 0. SUNUCU GÜVENLİK KURALLARI — EN ÖNCELİKLİ, İSTİSNASIZ

Bu uygulama, üzerinde **başka ve çok önemli projelerin çalıştığı** bir Ubuntu 24.04 LTS sunucuya kurulacak. Bu projeler hiçbir koşulda etkilenmemeli. Aşağıdaki kurallar bu prompttaki diğer her şeyden önce gelir. Bir kural ile bir gereksinim çelişirse kural kazanır; işlemi durdur ve bana sor.

### 0.1. Asla yapılmayacaklar
- Mevcut projelerin dosyalarına, klasörlerine, veritabanlarına, servislerine, cron işlerine, kullanıcılarına **dokunma; okuma dışında hiçbir işlem yapma**.
- Mevcut web sunucusu (Nginx/Apache/Caddy vb.) yapılandırma dosyalarını **düzenleme, silme, yeniden adlandırma**. Yalnızca bu uygulama için **yeni, ayrı bir dosya** eklenebilir.
- Web sunucusunu veya herhangi bir servisi **restart etme**. Yalnızca yapılandırma testi (`nginx -t` vb.) başarılıysa **reload** yapılabilir.
- `apt upgrade`, `apt dist-upgrade`, `do-release-upgrade`, `apt autoremove` çalıştırma. Sistem paketlerini kurma, güncelleme, kaldırma.
- Sistem genelindeki Node.js, npm, Python, PHP veya başka bir çalışma ortamının sürümünü değiştirme; global paket kurma (`npm i -g` yasak).
- Docker kurma. Docker zaten kuruluysa bile bu uygulama için kullanma; mevcut container/volume/network işlemleri ve `docker system prune` kesinlikle yasak.
- Güvenlik duvarı (ufw/iptables/nftables) kurallarını değiştirme. Uygulama dışarıya yeni port açmaz.
- Mevcut kullanılan portları kullanma; 80 ve 443'ü dinleme.
- `/etc` altında, bu uygulamaya ait yeni dosyalar dışında hiçbir şeyi değiştirme. Sistem geneli ayarları (saat dilimi, journald, sysctl, sshd, hostname, DNS) değiştirme.
- Sunucuyu yeniden başlatma.
- Uygulama klasörleri dışında `rm -rf` veya joker karakterli (`*`) silme yapma.
- Mevcut sertifikalara dokunma; yalnızca bu uygulamanın alt alan adı için yeni sertifika alınabilir.

### 0.2. Uygulamanın sunucuda kaplayacağı alan (izin verilenlerin tam listesi)
| Öğe | Değer |
|---|---|
| Uygulama klasörü | `/opt/callcenter/` (kod, uygulamaya özel Node.js kopyası, `.env`) |
| Veri klasörü | `/var/lib/callcenter/` (veritabanı + yedekler) |
| Linux kullanıcısı | `callcenter` (yeni sistem kullanıcısı, giriş kabuğu yok, sudo yetkisi yok) |
| Servis dosyası | `/etc/systemd/system/callcenter.service` (yeni dosya) |
| Web sunucusu dosyası | mevcut web sunucusunun site klasöründe yeni tek dosya (ör. `/etc/nginx/sites-available/callcenter.conf` + `sites-enabled` bağlantısı) |
| Port | `127.0.0.1` üzerinde kullanılmayan bir port (kurulumda kontrol edilir; varsayılan öneri 3100) |
| Sertifika | yalnızca `arama.<domain>` alt alan adı için |

Bu listenin dışında sunucuda hiçbir şey oluşturulmaz veya değiştirilmez.

### 0.3. Kaynak sınırları ve servis izolasyonu
systemd servisinde: `MemoryMax=512M`, `CPUQuota=50%`, `TasksMax=64`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `ReadWritePaths=/var/lib/callcenter`, `Environment=TZ=Europe/Istanbul` (saat dilimi yalnızca bu süreç için; sistem saat dilimi değiştirilmez). Uygulama bir hata durumunda bile diğer projelerin kaynaklarını tüketemez.

### 0.4. Kurulum yöntemi: önce oku, sonra sor, sonra yap
1. **Ön kontrol (yalnızca okuma):** `deploy/preflight.sh` hiçbir şeyi değiştirmeden şunları raporlar: işletim sistemi, boş disk ve RAM, dinlenen portlar (`ss -tlnp`), 80/443'ü hangi web sunucusunun kullandığı, sistemdeki Node sürümü (değiştirilmeyecek), certbot varlığı, önerilen portun boş olup olmadığı, `/opt/callcenter`, `/var/lib/callcenter` ve `callcenter` kullanıcısının zaten var olup olmadığı. Script içinde değişiklik yapan hiçbir komut bulunmaz.
2. Rapor bana gösterilir. Çakışma varsa (port dolu, klasör/kullanıcı zaten var) kurulum durur.
3. **Kurulum adım adım:** her adımdan önce çalıştırılacak komut ve ne değiştireceği yazılır, onayım alınır. Hiçbir adım toplu ve sessizce çalıştırılmaz.
4. Web sunucusu yapılandırması eklenmeden önce mevcut yapılandırma test edilir; yeni dosya eklendikten sonra tekrar test edilir. Test başarısızsa yeni dosya geri alınır ve reload yapılmaz.
5. Her adımın **geri alma** komutu da yazılır. `deploy/uninstall.sh` yalnızca 0.2'deki öğeleri kaldırır (veri klasörünü silmeden önce ayrıca onay ister).

---

## 1. ROL VE ÖNCELİKLER

Sen Node.js, TypeScript, SQLite, Linux sunucu yönetimi ve güvenli web uygulaması geliştirme konusunda deneyimli, sade mimariyi önemseyen kıdemli bir yazılım geliştiricisisin.

Görevin: bir yöneticinin ve birkaç aramacının internet üzerinden kullanacağı, hafif, güvenli ve tamamen işlevsel bir Call Center web uygulaması geliştirmek ve bunu 0. bölümdeki kurallara harfiyen uyarak mevcut sunucuya kurulabilir hâle getirmek.

Öncelik sırası:
1. Sunucudaki diğer projelerin güvenliği (0. bölüm)
2. Uygulama güvenliği ve veri gizliliği (kişisel veri içerir)
3. Kararlılık ve güvenilir veri saklama
4. Hız ve düşük kaynak tüketimi
5. Az tıklamayla kullanım (masaüstü ve telefon)
6. Sade, okunaklı kod

Bu bir kurumsal CRM değildir. İstenmeyen hiçbir özelliği kendiliğinden ekleme.

---

## 2. PROJE TANIMI

Uygulama adı: **CALL CENTER**

Uluslararası STK, dernek, vakıf ve şirketlerle WhatsApp veya telefonla iletişim kuran küçük bir ekip kullanacak (1 yönetici + yaklaşık 2–15 aramacı).

### 2.1. Roller

**Yönetici (admin)**
- Sisteme tam hakimdir.
- Aramacı hesaplarını oluşturur, düzenler, pasifleştirir, şifrelerini sıfırlar.
- Excel/CSV listelerini yükler; her yükleme bir "liste" olarak havuza girer.
- Listeleri havuzda açar/kapatır.
- Bütün kayıtları, kimin kimi aradığını ve görüşme geçmişini görür.
- Kayıtları aramacılara atar, başka aramacıya devreder veya havuza geri bırakır.
- Kayıtları ekler, düzenler, siler, dışa aktarır, yedek indirir.

**Aramacı (agent)**
- Yalnızca kendisine atanmış kayıtları görür.
- "Sıradakini Al" ile havuzdan yeni kayıt çeker.
- WhatsApp ile iletişime geçer, görüşme sonucunu ve notunu kaydeder.
- Kendi kayıtlarını filtreler ve HTML olarak dışa aktarır.
- Liste yükleyemez, yeni kayıt ekleyemez, başkasının kaydını göremez, kayıt silemez, kullanıcı yönetemez.

### 2.2. Temel iş akışı

1. Yönetici bir Excel/CSV dosyası yükler, listeye ad verir (ör. "İngiltere STK – Ekim"). Kayıtlar havuza girer.
2. Aramacı giriş yapar, "Sıradakini Al" butonuna basar. Açık listelerdeki atanmamış ilk kayıt **atomik olarak** ona atanır; iki aramacı aynı kaydı asla alamaz.
3. Aramacı WhatsApp ikonuna tıklar; sohbet açılır, aramayı WhatsApp içinden manuel başlatır.
4. Görüşme sonucunu (Olumlu / Olumsuz / Tekrar Görüşülecek) ve notunu kaydeder; gerekirse tekrar görüşme tarihi girer.
5. Her kayıt işlemi görüşme geçmişine (kim, ne zaman, hangi sonuç, not) yazılır.
6. "Kaydet ve Sıradakini Al" ile sıradaki kayda geçer.
7. Tekrar görüşülecek kayıtlar aynı aramacıda kalır; "Bugün ve Geciken" filtresiyle bulunur.
8. Yönetici aramacı bazında özet sayıları ve tüm görüşme geçmişini izler.

---

## 3. TEKNOLOJİ

| Bileşen | Teknoloji |
|---|---|
| Sunucu | Node.js 22 LTS (uygulamaya özel kopya, `/opt/callcenter/node/`) + TypeScript |
| Web framework | Fastify (+ @fastify/cookie, @fastify/static) |
| Veritabanı | SQLite — `better-sqlite3`, WAL modu |
| Ön yüz | Vanilla TypeScript + Vite (tek sayfalık uygulama) |
| Tasarım | Düz CSS, tek dosya (`web/styles.css`), CSS değişkenleriyle |
| İkonlar | Satır içi sade SVG, tek modülde (`web/icons.ts`) |
| XLSX okuma | `read-excel-file` (sunucuda, yalnızca içe aktarmada) |
| CSV okuma | `papaparse` (sunucuda) |
| Şifre hash | Node `crypto.scrypt` (ek paket yok) |
| Oturum | HttpOnly + Secure + SameSite=Strict çerez, oturumlar SQLite'ta |
| Süreç yönetimi | systemd servisi (PM2, Docker vb. yok) |
| HTTPS | Sunucudaki mevcut web sunucusu ters vekil olarak (0. bölüm kurallarıyla) |

### 3.1. Genel kurallar
- React, Vue, Angular, Svelte, Next.js, jQuery, Tailwind, Bootstrap veya herhangi bir UI/CSS kütüphanesi KULLANMA.
- ORM KULLANMA; parametreli SQL yaz.
- PostgreSQL, MySQL, Redis, mesaj kuyruğu, microservice, Docker, PM2 KULLANMA.
- Sunucu bağımlılıkları yukarıdaki tabloyla sınırlıdır. Başka bir paket gerekiyorsa önce gerekçesini yaz, onayımı bekle.
- Ön yüzde yalnızca Vite (geliştirme bağımlılığı) olsun; çalışma zamanında hiçbir harici kütüphane yüklenmez.
- Uygulama tek bir Node süreci olarak çalışır, yalnızca `127.0.0.1:<PORT>` dinler; hem API'yi hem derlenmiş ön yüzü sunar.
- Fastify `trustProxy: '127.0.0.1'` ile çalışır; `X-Forwarded-*` başlıklarına yalnızca yerel ters vekilden gelen isteklerde güvenir.

### 3.2. Dış ağ kuralı
- Sunucu tarafı uygulama çalışırken dışarıya **hiçbir ağ isteği yapmaz** (telemetri, güncelleme kontrolü, harici API dahil). Sunucu kodunda dış adrese `fetch`, `http.request` vb. çağrı bulunmaz.
- Ön yüz yalnızca kendi sunucusundan kaynak yükler: CDN, Google Fonts, harici ikon/görsel, analitik ve üçüncü taraf script YASAK. Sistem font yığını kullanılır. CSP `default-src 'self'` ile bu tarayıcı tarafında da zorlanır.
- HTML raporlar tek dosyadır ve internetsiz açılır.
- İstisnalar (uygulamanın kendisi yapmaz): kullanıcının tıkladığı WhatsApp linkleri kullanıcının cihazında açılır; HTTPS sertifikası mevcut web sunucusu tarafından yönetilir; npm paketleri yalnızca derleme ortamında indirilir, sunucuda indirilmez.

### 3.3. Ön yüz kuralları
- **XSS koruması zorunlu:** Ekrana veri basan her yerde otomatik escape yapan küçük bir etiketli şablon yardımcısı (`html\`...\``) kullanılır. Kullanıcıdan veya veritabanından gelen metin hiçbir zaman ham hâliyle `innerHTML`'e yazılmaz. Güvenli olduğu bilinen içerik (ikon SVG'leri) yalnızca açıkça işaretlenerek (`raw(...)`) eklenir. `eval`, `new Function`, satır içi olay öznitelikleri (`onclick="..."`) kullanılmaz; olaylar `addEventListener` ile bağlanır.
- CSS tek dosyada, CSS değişkenleri (renkler, boşluklar, köşe yarıçapı) ile düzenli tutulur. Animasyon yok; yalnızca gerekli yerlerde kısa geçişler (ör. panel açılışı, 150 ms) olabilir.
- İkonlar `web/icons.ts` içinde tek yerde tanımlanır; ikon fontu veya harici ikon seti yok. Kullanılmayan ikon eklenmez.
- Yönlendirme basit hash router ile (`#/kayitlar`, `#/listeler` …); kütüphane yok.
- Her sayfa kendi modülünde; ortak tablo, filtre, toast ve onay penceresi bileşenleri tek kez yazılıp tekrar kullanılır.

---

## 4. KURULUM VE YAPILANDIRMA

- Hedef: mevcut Ubuntu 24.04 LTS sunucu, mevcut domain altında yeni bir alt alan adı (ör. `arama.<domain>`). Alt alan adının DNS kaydını kullanıcı kendisi ekler; README'de nasıl yapılacağı kısaca anlatılır.
- Kurulum 0.4'teki akışla yapılır.
- Derleme (TypeScript, Vite) **sunucuda değil**, geliştirme bilgisayarında veya GitHub Actions'ta yapılır. Sunucuya yalnızca derlenmiş çıktı + production `node_modules` + uygulamaya özel Node.js kopyası gönderilir. Sunucuda derleyici veya global araç kurulmaz.
  - `better-sqlite3` yerel modülü Linux x64 / Node 22 için hazır derlenmiş olarak gelmelidir; sunucuda `build-essential` gibi paketler KURULMAZ. Hazır derlenmiş paket bulunamazsa dur ve bana sor.
- Yapılandırma `/opt/callcenter/.env` (izin 600, sahibi `callcenter`): `PORT`, `PUBLIC_ORIGIN` (ör. `https://arama.<domain>`), `DATA_DIR=/var/lib/callcenter`, `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `SESSION_DAYS`. `.env.example` verilir.
- İlk çalıştırmada kullanıcı tablosu boşsa `.env`'deki bilgilerle ilk yönetici oluşturulur ve ilk girişte şifresini değiştirmeye zorlanır. Ardından `INITIAL_ADMIN_PASSWORD` satırının `.env`'den silinmesi gerektiği README'de belirtilir.
- Güncelleme: `deploy/update.sh` yeni sürümü `/opt/callcenter/releases/<tarih>/` altına koyar, `current` sembolik bağlantısını değiştirir ve **yalnızca `callcenter` servisini** yeniden başlatır. Önceki sürüme dönüş tek komutla yapılabilir.

---

## 5. VERİ MODELİ

`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`
Migration aracı kullanma; `CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version` ile basit sürümleme yap.

### 5.1. Zaman kuralları
- Zaman damgaları (`created_at`, `updated_at`, `calls.created_at` vb.) **UTC ISO 8601** olarak saklanır; arayüzde ve raporlarda Türkiye saatiyle gösterilir.
- Gün bilgisi taşıyan alanlar (`last_contact_date`, `follow_up_date`) `YYYY-MM-DD` olarak saklanır ve **Europe/Istanbul** gününe göre hesaplanır. "Bugün", "Geciken", "Bugün Görüşülen" hesapları sunucuda tek bir `todayIstanbul()` yardımcısıyla yapılır; tarayıcının saatine güvenilmez.
- Arayüzde tarih biçimi `GG.AA.YYYY`, saat `SS:DD`.

### 5.2. `users`
| Alan | Açıklama |
|---|---|
| id | INTEGER PK |
| username | TEXT UNIQUE NOT NULL (küçük harf) |
| full_name | TEXT NOT NULL |
| password_hash | TEXT NOT NULL (scrypt + salt) |
| role | `admin` / `agent` |
| active | INTEGER 0/1 |
| must_change_password | INTEGER 0/1 |
| created_at, last_login_at | TEXT |

### 5.3. `sessions`
id (rastgele 32 bayt, hex; veritabanında SHA-256 hash'i saklanır), user_id, created_at, expires_at. Kullanıcı pasifleştirilince veya şifresi sıfırlanınca oturumları silinir. Süresi dolan oturumlar günlük temizlenir.

### 5.4. `lists` (havuz listeleri)
| Alan | Açıklama |
|---|---|
| id | INTEGER PK |
| name | TEXT NOT NULL |
| is_open | INTEGER 0/1 — kapalı listeden "Sıradakini Al" kayıt vermez |
| created_by | users.id |
| created_at | TEXT |

### 5.5. `organizations`
| Alan | Açıklama |
|---|---|
| id | INTEGER PK |
| list_id | lists.id (manuel eklenenler için "Manuel Kayıtlar" listesi) |
| organization_name | TEXT NOT NULL |
| country, city | TEXT |
| whatsapp, phone | TEXT (girildiği hâliyle, + korunur) |
| contact_person | TEXT |
| assigned_to | users.id veya NULL (havuzda) |
| assigned_at | TEXT |
| status | `positive` / `negative` / `follow_up` / NULL (Görüşülmedi) |
| note | TEXT — güncel not |
| last_contact_date | TEXT `YYYY-MM-DD` |
| last_contact_by | users.id |
| follow_up_date | TEXT `YYYY-MM-DD` |
| created_at, updated_at | TEXT |
| search_text | **Gizli.** Türkçe kurallarla küçük harfe çevrilmiş, aksansız ad + kişi + şehir |
| name_sort | **Gizli.** Türk alfabesine göre sıralama anahtarı |
| whatsapp_normalized | **Gizli.** Yalnızca rakamlar (00 → ülke kodu), tekrar kontrolü için |

`status` için CHECK kısıtı. `whatsapp_normalized` üzerinde partial UNIQUE index (`WHERE whatsapp_normalized IS NOT NULL`).
İndeksler: `assigned_to`, `list_id`, `status`, `country`, `city`, `follow_up_date`, havuz sorgusu için `(assigned_to, list_id, id)`.

### 5.6. `calls` (görüşme geçmişi — kim kimi aradı)
| Alan | Açıklama |
|---|---|
| id | INTEGER PK |
| organization_id | organizations.id (ON DELETE CASCADE) |
| user_id | users.id |
| status | o görüşmede seçilen sonuç |
| note | o anda kaydedilen not |
| follow_up_date | TEXT |
| created_at | TEXT |

İndeksler: `(organization_id, created_at)`, `(user_id, created_at)`.

Her görüşme kaydında `organizations` satırı güncellenir **ve** `calls` tablosuna yeni satır eklenir; ikisi tek transaction içinde.

### 5.7. Türkçe metin kuralları
SQLite `LOWER()`/`NOCASE` Türkçe'de çalışmaz. Bu yüzden:
- `search_text` = `toLocaleLowerCase('tr-TR')` + aksan sadeleştirme (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, é→e …). Arama terimine de aynı işlem uygulanır; "ISIK", "ışık", "Işık" aynı sonucu verir.
- `name_sort`: Türk alfabesi sırası (c < ç < d, h < ı < i, o < ö < p, s < ş < t, u < ü < v).
- Bu alanlar her kayıt/güncellemede sunucuda tek bir yardımcı fonksiyonla hesaplanır.

Bunların dışında veri alanı ekleme.

---

## 6. HAVUZ VE DAĞITIM

- **Sıradakini Al**: tek SQL transaction içinde, açık listelerdeki `assigned_to IS NULL` olan en küçük id'li kayıt aramacıya atanır (`UPDATE … WHERE id = (SELECT …) AND assigned_to IS NULL RETURNING …`). Aynı anda basan iki aramacı farklı kayıt alır.
- Aramacının üzerinde görüşülmemiş (status NULL) en fazla N kayıt olabilir (varsayılan 1, yönetici ayarlardan değiştirebilir). Limit doluysa "Sıradakini Al" önce mevcut görüşülmemiş kaydı gösterir.
- Görüşülen kayıt aramacıda kalır.
- Yönetici: tek tek veya filtrelenmiş toplu seçimle kayıtları aramacıya atar, devreder, havuza bırakır. Devirde görüşme geçmişi korunur.
- Pasifleştirilen aramacının kayıtları otomatik değişmez; yönetici ekranında "pasif kullanıcıdaki kayıtları havuza bırak" butonu bulunur.
- Liste kapatılırsa yalnızca havuzdan kayıt verilmesi durur; atanmış kayıtlar etkilenmez.

---

## 7. EKRANLAR

Tasarım: modern, sade, profesyonel. Beyaz / açık gri zemin, ince kenarlıklar, okunaklı sistem fontu, sade SVG ikonlar. Arayüz dili Türkçe.

### 7.0. Ortak web kuralları
- **Responsive:** 768px altında tablolar kart listesine dönüşür, görüşme paneli tam ekran açılır. Dokunma hedefleri en az 44px. `viewport` meta etiketi.
- **Tarayıcı desteği:** Chrome, Edge, Firefox, Safari'nin son iki sürümü; iOS Safari ve Android Chrome. Internet Explorer desteklenmez.
- **Oturum süresi dolarsa:** API 401 döner, ön yüz kullanıcıyı giriş ekranına yönlendirir; giriş sonrası kaldığı sayfaya döner. Formda kaydedilmemiş değişiklik varsa kaybolmadan önce uyarı verilir.
- **Kaydedilmemiş değişiklik:** görüşme paneli değişiklik varken kapatılmak istenirse onay sorulur.
- **Yükleniyor ve hata durumları:** her istek sırasında ilgili buton pasifleşir (çift tıklama ile çift kayıt oluşmaz); hata mesajları Türkçe ve anlaşılır.
- **Erişilebilirlik (temel):** her form alanının etiketi var, klavyeyle gezilebilir, renkler yalnız başına anlam taşımaz (durum etiketlerinde metin de yazar).

### 7.1. Giriş
Kullanıcı adı + şifre. Hatalı denemede genel mesaj ("Kullanıcı adı veya şifre hatalı"). Şifre değiştirme zorunluysa önce o ekran gelir.

### 7.2. Aramacı — Kayıtlarım
- Kartlar: Kayıtlarım · Bugün Görüşülen · Olumlu · Bugün ve Geciken
- Büyük **Sıradakini Al** butonu
- Filtreler: arama (ad/kişi/şehir, 300 ms gecikmeli), Ülke, Şehir, Görüşme Sonucu, Bugün ve Geciken, Filtreleri Temizle
- Tablo: Sıra · Kuruluş · Ülke · Şehir · WhatsApp (yeşil ikon) · Telefon (kopyala ikonu) · Görüşülen Kişi · Sonuç (renkli etiket) · Son Görüşme · Tekrar Görüşme
- Satıra tıklayınca görüşme paneli açılır
- HTML Dışa Aktar (yalnızca kendi kayıtları)

### 7.3. Görüşme paneli (sağdan açılan panel / mobilde tam ekran)
- Kuruluş bilgileri (aramacı ülke, şehir, telefonlar, görüşülen kişiyi düzeltebilir; kuruluş adını yalnızca yönetici değiştirir)
- Sonuç: 3 büyük buton — Olumlu (yeşil), Olumsuz (kırmızı), Tekrar Görüşülecek (turuncu)
- Not alanı
- Tekrar Görüşme Tarihi — yalnızca "Tekrar Görüşülecek" seçiliyken görünür
- Son görüşme tarihi otomatik bugün olur
- **Görüşme geçmişi**: önceki görüşmeler (tarih-saat, aramacı, sonuç, not), en yenisi üstte
- Butonlar: **Kaydet** · **Kaydet ve Sıradakini Al** · Kapat
- Kısayollar (masaüstü): Ctrl/Cmd+S kaydet, Ctrl/Cmd+Enter kaydet ve sıradaki, Esc kapat, 1/2/3 sonuç seçimi (not alanı dışındayken)

### 7.4. Yönetici — Kayıtlar
- Kartlar: Toplam · Havuzda Bekleyen · Olumlu · Tekrar Görüşülecek · Bugün Görüşülen
- Filtreler: aramacının bütün filtreleri + **Aramacı** (Tümü / Havuzda / kişi) + **Liste**
- Tablo: ek olarak **Atanan Aramacı** ve **Son Görüşen** sütunları, Düzenle / Sil
- Toplu işlem: seçili veya filtrelenmiş kayıtları aramacıya ata / havuza bırak / sil (onaylı; işlem öncesi etkilenecek kayıt sayısı gösterilir)
- Yeni Kayıt, HTML Dışa Aktar

### 7.5. Yönetici — Listeler
- Liste Yükle (bölüm 10)
- Tablo: ad, yükleme tarihi, toplam, havuzda bekleyen, görüşülen, açık/kapalı anahtarı, sil (onaylı; görüşmesi olan listede ek uyarı)

### 7.6. Yönetici — Kullanıcılar
- Ekle (ad soyad, kullanıcı adı, geçici şifre, rol), düzenle, pasifleştir/aktifleştir, şifre sıfırla
- Yönetici kendi hesabını pasifleştiremez veya rolünü düşüremez

### 7.7. Yönetici — Görüşme Kayıtları
- `calls` sayfalı liste: tarih-saat, aramacı, kuruluş, ülke, sonuç, not
- Filtreler: aramacı, tarih aralığı, sonuç, liste; HTML dışa aktarma

### 7.8. Yönetici — Özet
- Grafik yok, yalnızca tablo. Tarih aralığı (varsayılan bugün). "Yenile" butonu (otomatik yenileme yok).
- Her aramacı için: görüşme sayısı, olumlu, olumsuz, tekrar görüşülecek, üzerindeki görüşülmemiş kayıt, son aktivite.

### 7.9. Ayarlar
- Herkes: kendi şifresini değiştirme; WhatsApp açma modu (Masaüstü uygulaması / WhatsApp Web) — tarayıcıda (`localStorage`, try/catch ile) saklanır.
- Yönetici: aramacı başına görüşülmemiş kayıt limiti; Yedek İndir.

---

## 8. GÖRÜŞME SONUÇLARI

| Kod | Metin | Renk |
|---|---|---|
| `positive` | Olumlu | Yeşil |
| `negative` | Olumsuz | Kırmızı |
| `follow_up` | Tekrar Görüşülecek | Turuncu |
| NULL | Görüşülmedi | Gri |

Seçimde yalnızca ilk üçü bulunur. Türkçe metinler arayüzde tutulur. Sonuç değişince not silinmez.

---

## 9. WHATSAPP

- **Telefonda**: `https://wa.me/<rakamlar>` → WhatsApp uygulaması açılır.
- **Bilgisayarda**, kullanıcının ayarına göre:
  - Masaüstü uygulaması (varsayılan): `whatsapp://send?phone=<rakamlar>`
  - WhatsApp Web: `https://web.whatsapp.com/send?phone=<rakamlar>` (`target="whatsapp"` ve `rel="noopener noreferrer"` ile aynı sekme)
- Doğrulama (kütüphanesiz): boşluk, tire, parantez, nokta temizlenir; `00` → `+`; geçerli biçim `+` ve 8–15 rakam. Ülke kodu yoksa link açılmaz, uyarı gösterilir. Ülke kodu tahmin edilip eklenmez.
- Numara yoksa ikon pasif. Telefon yanında kopyala ikonu (Clipboard API; HTTPS gerektirir).
- Otomatik arama, otomatik mesaj, WhatsApp API, arama kaydı YOK.

---

## 10. LİSTE İÇE AKTARMA (yalnızca yönetici)

1. Liste adı girilir, `.xlsx` veya `.csv` seçilir (maks. 10 MB).
2. Dosya **ham veri olarak** (`Content-Type: application/octet-stream`, dosya adı ayrı bir başlıkta) gönderilir; ek multipart paketi kullanılmaz. Yalnızca bu uç noktada gövde sınırı 10 MB, diğer uç noktalarda 1 MB.
3. Sunucu dosyayı bellekte okur, biçimi uzantıya ve içeriğe göre doğrular (XLSX için ZIP imzası), başlıkları ve ilk 10 satırı döner. Dosya kalıcı olarak diske yazılmaz; önizleme ile onay arasında en fazla 15 dakika bellekte tutulur.
4. Sütunlar otomatik eşleştirilir; yalnızca eşleşmeyenler için açılır menü gösterilir.
   - Kuruluş Adı: organization, organization name, ngo, ngo name, name, company, kuruluş, kuruluş adı, dernek, dernek adı, şirket, firma
   - Ülke: country, ülke · Şehir: city, şehir, il
   - WhatsApp: whatsapp, whatsapp number, wa, whatsapp no
   - Telefon: phone, telephone, tel, telefon, phone number
   - Görüşülen Kişi: contact, contact person, contact name, yetkili, görüşülen kişi, ilgili kişi
5. Onayla → tek transaction içinde yazılır.
6. Sonuç: eklenen, tekrar olduğu için atlanan, hatalı satırlar (satır no + neden; ilk 200).

Veri kontrolü:
- Boş satırlar atlanır; hücreler kırpılır, fazla boşluklar sadeleştirilir.
- CSV: UTF-8 BOM temizlenir, ayırıcı otomatik algılanır; UTF-8 değilse Windows-1254 olarak çözülür.
- Excel'de sayı olarak saklanan telefonlar bilimsel gösterime dönüşmeden metne çevrilir; `.0` ve `'` ön eki temizlenir. CSV'de bozulmuş bilimsel gösterim (`9.05E+11`) hatalı satır olarak raporlanır.
- Kuruluş adı boş satır hatalıdır.
- Tekrar kontrolü (tüm sistemde): `whatsapp_normalized` aynıysa tekrar; WhatsApp yoksa normalize ad + ülke. Dosya içi tekrarlar da yakalanır. Tekrarlar atlanır; mevcut kayıtlar değiştirilmez.
- Bozuk dosya sunucuyu çökertmez; anlaşılır hata döner.

---

## 11. TABLO, FİLTRE, SAYFALAMA, EŞZAMANLI DÜZENLEME

- Filtreleme, sıralama ve sayfalama SQLite'ta: `LIMIT 50 OFFSET ?` + ayrı `COUNT(*)`.
- Asla bütün kayıtları istemciye gönderme.
- Aramacı sorgularına sunucuda **her zaman** `assigned_to = <oturumdaki kullanıcı>` eklenir; istemciden gelen hiçbir parametre bunu aşamaz.
- Filtre değişince 1. sayfaya dönülür. Aktif filtre URL'de tutulur; sayfa yenilenince ve geri tuşunda korunur.
- Sıralama: kuruluş adı (`name_sort`), son görüşme, tekrar görüşme.
- Ülke/Şehir menüleri `SELECT DISTINCT` ile (aramacıda yalnızca kendi kayıtlarından).
- **Eşzamanlı düzenleme:** kayıt kaydedilirken istemci, paneli açtığı andaki `updated_at` değerini gönderir. Sunucudaki değer farklıysa güncelleme yapılmaz (409), kullanıcıya "Bu kayıt siz düzenlerken başka biri tarafından değiştirildi" uyarısı ve güncel hâli gösterilir; yazdığı not kaybolmaz, kopyalayabilir.
- Yönetici bir kaydı başka aramacıya devrettiyse, eski aramacının o kayda yaptığı istekler 404 döner ve listeden kalkar.

---

## 12. HTML DIŞA AKTARMA

- Aktif filtreye uyan **bütün** kayıtlar; yetki kuralları geçerli.
- Sunucu tek HTML dosyası üretir, büyük raporlarda belleği şişirmemek için **akış (stream)** olarak yazar, `Content-Disposition: attachment` ile indirir: `call-center-rapor-YYYY-MM-DD.html`.
- Üst bölüm: başlık, tarih-saat, raporu alan kullanıcı, filtreler, toplam kayıt.
- Sütunlar: Kuruluş, Ülke, Şehir, WhatsApp, Telefon, Görüşülen Kişi, Sonuç, Son Görüşme, Tekrar Görüşme, Not; yöneticide ek olarak Atanan Aramacı.
- CSS gömülü, JavaScript ve harici kaynak yok, internetsiz açılır, yazdırılabilir, UTF-8.
- Bütün metinler HTML-escape edilir; satır sonları `<br>` olur.

---

## 13. UYGULAMA GÜVENLİĞİ VE KVKK

- HTTPS mevcut web sunucusu tarafından sağlanır; yalnızca bu alt alan adının yapılandırmasında HTTP → HTTPS yönlendirme ve HSTS.
- Şifreler `crypto.scrypt` + rastgele salt; karşılaştırma `timingSafeEqual`. Minimum şifre uzunluğu 10.
- Giriş denemesi sınırı: kullanıcı adı + IP başına 15 dakikada 5 hatalı deneme (bellek içi sayaç).
- Oturum çerezi: HttpOnly, Secure, SameSite=Strict; süre `.env`'den (varsayılan 7 gün). Çıkışta oturum silinir.
- CSRF: SameSite=Strict + durum değiştiren her istekte `Origin` = `PUBLIC_ORIGIN` kontrolü.
- Her API uç noktasında sunucu tarafı rol ve sahiplik kontrolü. Aramacı başkasının kaydını id tahmin ederek açamaz (404).
- Parametreli SQL, girdi doğrulama (ad 300, not 10.000 karakter vb.), istek gövdesi boyut sınırları (bölüm 10).
- Güvenlik başlıkları (uygulama tarafından): sıkı CSP (`default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Ön yüzde XSS koruması 3.3'teki kurallarla.
- Hata mesajlarında iç detay gösterilmez. Loglar journald'ye gider; şifre, oturum id'si, telefon numarası loglanmaz. Log miktarı düşük tutulur.
- Kişisel veri yalnızca bu sunucuda tutulur. README'de KVKK açısından veri sorumlusunun yapması gerekenlere kısa not; ayrı KVKK modülü EKLEME.

---

## 14. YEDEKLEME

- Uygulama her gün saat 03:30'da (Türkiye saati) `better-sqlite3` `backup()` API'siyle `/var/lib/callcenter/backups/callcenter-YYYY-MM-DD.db` oluşturur, son 14 yedeği tutar (uygulama içi zamanlayıcı; sistem cron'una dokunulmaz).
- Yönetici "Yedek İndir" ile anlık yedeği indirebilir.
- Geri yükleme web arayüzünden yapılmaz; README'de adım adım (yalnızca `callcenter` servisini durdur → dosyayı değiştir → başlat).
- README'de yedeklerin sunucu dışına da kopyalanmasının önemi belirtilir.

---

## 15. PERFORMANS

- 100.000 kuruluş ve 200.000 görüşme kaydıyla liste, filtre ve "Sıradakini Al" akıcı çalışmalı; 0.3'teki kaynak sınırları içinde kalmalı.
- Ön yüz paketi küçük tutulur (framework yok).
- **Önbellek:** Vite çıktısındaki JS/CSS dosyaları içerik hash'li adlarla üretilir ve `Cache-Control: public, max-age=31536000, immutable` ile sunulur; `index.html` `no-cache` ile sunulur. Böylece güncellemeden sonra herkes yeni sürümü görür.
- Statik dosyalar önceden üretilmiş `.gz`/`.br` hâlleriyle sıkıştırılmış sunulur.
- Gerçek ölçüm yapmadan milisaniye/RAM garantisi verme; ölçtüysen nasıl ölçtüğünü yaz.

---

## 16. KAPSAM DIŞI

Kayıt olma ekranı, e-posta ile şifre sıfırlama, iki adımlı doğrulama, çoklu şirket, mobil uygulama, PWA/çevrimdışı mod, WhatsApp API / otomatik arama / mesaj, ses kaydı, yapay zekâ, grafik/dashboard, teklif/fatura/ödeme, takvim, anlık bildirim, websocket/canlı güncelleme, karanlık tema, çoklu dil, web üzerinden geri yükleme, Docker, "ileride lazım olur" diye eklenen kullanılmayan kod.

---

## 17. DOSYA YAPISI (öneri, zorunlu değil)

    server/
      index.ts          // Fastify kurulumu, statik dosyalar, güvenlik başlıkları
      db.ts             // bağlantı, şema, sürümleme
      auth.ts           // şifre hash, oturum, giriş sınırı, rol kontrolü
      text.ts           // Türkçe normalize, sıralama anahtarı, telefon, HTML escape
      time.ts           // todayIstanbul(), UTC ⇄ Türkiye saati
      routes/
        auth.ts
        organizations.ts
        admin.ts
        import.ts
        export.ts
      backup.ts
    web/
      index.html
      main.ts           // hash router, oturum durumu
      api.ts            // fetch sarmalayıcı, 401/409 yönetimi
      html.ts           // otomatik escape yapan html`` ve raw()
      icons.ts          // satır içi SVG ikonlar
      ui.ts             // tablo, toast, onay penceresi, panel
      pages/
        login.ts
        records.ts
        call-panel.ts
        lists.ts
        users.ts
        calls.ts
        summary.ts
        settings.ts
      styles.css
    test/
    scripts/
      generate-sample.ts      // 100.000 sahte kayıt
    samples/
      ornek-liste.xlsx
      ornek-liste.csv
    deploy/
      preflight.sh            // yalnızca okuma, rapor
      install.md              // adım adım: komut + ne değiştirdiği + geri alma
      callcenter.service      // systemd (0.3 sınırlarıyla)
      nginx-callcenter.conf   // yalnızca bu alt alan adı için server bloğu
      apache-callcenter.conf  // sunucuda Apache varsa
      update.sh
      uninstall.sh
    .github/workflows/release.yml   // derleme ve sunucuya gidecek paketi üretme
    .env.example
    README.md

---

## 18. TESTLER

Node'un yerleşik test çalıştırıcısı (`node --test`) ile:
- Türkçe normalize ve sıralama
- Telefon doğrulama ve normalize
- HTML escape ve ön yüz `html` yardımcısı (`<script>`, `"`, `'` içeren veri ekranda metin olarak görünür)
- Zaman: `todayIstanbul()` UTC 21:00–24:00 arasında doğru günü veriyor
- İçe aktarma: tekrar tespiti, Windows-1254 CSV, bilimsel gösterim, sahte uzantılı dosya reddi
- **Yetki**: aramacı başkasının kaydını okuyamıyor/güncelleyemiyor; yönetici uç noktalarına erişemiyor; pasif kullanıcı giriş yapamıyor; devredilen kayda eski aramacı erişemiyor
- **Eşzamanlılık**: aynı anda 20 "Sıradakini Al" → 20 farklı kayıt; bayat `updated_at` ile kaydetme 409 dönüyor
- Görüşme kaydı: `organizations` güncelleniyor ve `calls`'a satır ekleniyor (tek transaction)
- Giriş sınırı ve CSRF (`Origin` uyuşmazlığında 403)
- **Dış ağ**: sunucu kodunda dış ağ çağrısı yok; derlenmiş ön yüzde harici `http(s)://` kaynak yok (WhatsApp link şablonları hariç)
- `deploy/preflight.sh` içinde değişiklik yapan komut bulunmadığının kontrolü

Elle kontrol listesi README'de (masaüstü ve telefon tarayıcısı).

---

## 19. GELİŞTİRME AŞAMALARI

Her aşamanın sonunda dur, yerelde nasıl çalıştırılacağını ve neyi test etmem gerektiğini yaz, onayımı bekle.

**Aşama 1 — Temel ve güvenlik:** İskelet, şema, giriş/çıkış, oturumlar, şifre değiştirme, rol kontrolü, `html` yardımcısı, kullanıcı yönetimi, ilk yönetici.

**Aşama 2 — Havuz ve görüşme:** Liste içe aktarma, havuz, Sıradakini Al, aramacı tablosu, filtreler, görüşme paneli, görüşme geçmişi, eşzamanlı düzenleme kontrolü, WhatsApp, mobil kart görünümü.

**Aşama 3 — Yönetim:** Yönetici kayıt ekranı, atama/devir, listeler, görüşme kayıtları, özet, HTML dışa aktarma.

**Aşama 4 — Yayın hazırlığı:** Yedekleme, testler, `deploy/` klasörü, GitHub Actions, örnek dosyalar, README.

**Aşama 5 — Sunucuya kurulum (0. bölüm kurallarıyla):** Önce `preflight.sh` çıktısı incelenir; ardından her adım tek tek, onayımla.

Her aşamada gerçek çalışan kod üret. Sahte buton veya "TODO" bırakma.

---

## 20. TESLİMAT

1. Tam kaynak kod.
2. `deploy/` klasörü (ön kontrol, kurulum talimatı, servis dosyası, web sunucusu yapılandırması, güncelleme, kaldırma).
3. GitHub Actions ile üretilen, sunucuya yüklenecek hazır paket.
4. Örnek `.xlsx` ve `.csv` (Türkçe karakterli, ülke kodlu, birkaç tekrar ve hatalı satır).
5. README:
   - **Yönetici için:** alt alan adı DNS kaydı, ilk giriş, kullanıcı ekleme, liste yükleme.
   - **Aramacı için:** giriş, Sıradakini Al, görüşme kaydetme (yarım sayfa).
   - **Bakım:** güncelleme, eski sürüme dönüş, yedek indirme, yedekten geri yükleme, log görme, kaldırma.
   - **Geliştirici için:** yerelde çalıştırma, testler, test verisi üretme.

Hazırlanmamış dosyayı hazırlanmış gibi gösterme. Test edemediğin bir şey varsa açıkça yaz.

---

## 21. SON HEDEF

Aramacı giriş yapınca tek tuşla sıradaki kuruluşu almalı, tek dokunuşla WhatsApp'ı açmalı, sonucu birkaç işlemle kaydedip sıradakine geçebilmeli. Yönetici kimin kimi aradığını, hangi sonucu aldığını ve havuzda ne kaldığını tek bakışta görebilmeli.

Bunların hepsi, sunucudaki diğer projelere hiçbir şekilde dokunulmadan gerçekleşmeli.