# CALL CENTER — Hafif Web Tabanlı Görüşme ve Kuruluş Takip Sistemi

CALL CENTER; uluslararası STK, dernek, vakıf ve şirketlerle WhatsApp veya telefonla iletişim kuran ekipler için geliştirilmiş, mikro kaynak tüketen, yüksek güvenlikli ve sade bir çağrı/görüşme yönetim platformudur.

Harici UI kütüphanesi, harici veritabanı sunucusu, CDN ve dış ağ bağımlılığı bulunmaz.

---

## 🚀 Hızlı Başlangıç (Geliştirici)

### Gereksinimler
- Node.js 22 LTS
- npm 10+

### Yerelde Çalıştırma
```bash
# 1. Bağımlılıkları kurun
npm install

# 2. Örnek ortam dosyasını kopyalayın
cp .env.example .env

# 3. Geliştirme sunucusunu başlatın
npm run dev
```

Tarayıcınızda açın: **`http://localhost:3100`**

- **İlk Giriş Bilgileri:** `admin` / `Degistir1234!`
- İlk girişte sistem güvenliğiniz için sizi otomatik olarak şifre değiştirmeye yönlendirecektir.

### Testleri Çalıştırma
```bash
# Tüm birim ve entegrasyon testlerini çalıştırır
npm test
```

### 100.000 Test Kaydı Üretme (Performans Testi)
```bash
npx tsx scripts/generate-sample.ts 100000
```

---

## 👤 Yönetici Kılavuzu

### 1. Alt Alan Adı (DNS) Yapılandırması
1. Alan adı sağlayıcınızın (Cloudflare, GoDaddy vb.) DNS yönetim paneline girin.
2. Yeni bir `A` kaydı ekleyin:
   - **Ad:** `arama` (veya istediğiniz bir alt alan adı, ör: `arama.dernek.org`)
   - **Hedef IP:** Ubuntu sunucunuzun statik IP adresi.
   - **TTL:** Otomatik veya 300 saniye.

### 2. İlk Giriş ve Kullanıcı Tanımlama
1. Tarayıcınızdan `https://arama.dernek.org` adresine gidin.
2. `admin` kullanıcısı ve kurulumda belirlenen geçici şifreyle giriş yapın.
3. Yeni kalıcı şifrenizi belirleyin.
4. Sol menüden **Kullanıcılar** sayfasına (`#/kullanicilar`) giderek:
   - **"Yeni Kullanıcı Ekle"** butonuyla aramacı personellerinizi tanımlayın.
   - Personellere verilen geçici şifreler ilk girişlerinde zorunlu olarak değiştirilecektir.
   - Personel ayrıldığında tek tıkla hesabını pasife alabilir ve **"Kayıtlarını Havuza Bırak"** diyerek üzerinde kalan kayıtları boşa çıkarabilirsiniz.

### 3. Liste Yükleme (Havuz Oluşturma)
1. **Listeler** (`#/listeler`) sayfasına gidin.
2. **"Yeni Liste Yükle"** butonuna tıklayın.
3. Listenize bir isim verin (örn: `Almanya STK - 2026`) ve `.xlsx` veya `.csv` dosyanızı seçin.
4. Sütunlar otomatik eşleştirilir. Gerekirse açılır menülerden düzeltin ve **"Onayla ve Havuza Aktar"** butonuna basın.
5. Tekrar eden veya hatalı satırlar sistem tarafından raporlanır ve mükerrer kayıtlar havuza eklenmez.

---

## 🎧 Aramacı Kılavuzu (Yarım Sayfa Özet)

1. **Giriş:** Size verilen kullanıcı adı ve geçici şifre ile sisteme girin; ilk girişte yeni şifrenizi belirleyin.
2. **Sıradaki Kuruluşu Alma:**
   - **Kayıtlarım** sayfasında mavi büyük **"Sıradakini Al"** butonuna tıklayın.
   - Açık havuzdan size özel bir kuruluş otomatik çekilir ve sağdan **Görüşme Paneli** açılır.
3. **İletişim:**
   - **"WhatsApp'ı Aç"** butonuna tıklayarak doğrudan WhatsApp uygulamasını veya WhatsApp Web'i açın ve aramanızı başlatın.
   - Gerekirse telefon numarasının yanındaki kopyala simgesini kullanarak numarayı panoya kopyalayın.
4. **Sonucu Kaydetme:**
   - Görüşme sonucuna göre 3 büyük butondan birini seçin:
     - **Olumlu (Klavye: 1)**
     - **Olumsuz (Klavye: 2)**
     - **Tekrar Görüşülecek (Klavye: 3)** → Yarın veya belirlenen takip tarihini seçin.
   - Görüşme notunuzu yazın.
5. **Tamamlama:**
   - **"Kaydet ve Sıradakini Al" (Ctrl+Enter)** butonuna basarak bir sonraki kuruluşa geçin.
   - Tekrar görüşülecek kayıtlarınız sizde kalır; **"Bugün ve Geciken"** filtresiyle günü gelen aramalarınızı kolayca takip edebilirsiniz.

---

## 🛠️ Sunucu Bakım ve İşletim

### Güncelleme (Update)
Yeni sürüm yayınlandığında sunucudaki diğer hiçbir servisi etkilemeden tek komutla güncelleyin:
```bash
sudo ./deploy/update.sh callcenter-release-v1.1.0.tar.gz
```

### Eski Sürüme Geri Dönüş (Rollback)
```bash
sudo ln -sfn /opt/callcenter/releases/<onceki-tarih> /opt/callcenter/current
sudo systemctl restart callcenter
```

### Yedekleme ve Geri Yükleme
- **Otomatik Yedek:** Uygulama her gece saat **03:30**'da (Türkiye saati) `/var/lib/callcenter/backups/callcenter-YYYY-MM-DD.db` yedeği alır ve son 14 yedeği saklar.
- **Anlık Yedek İndir:** Yönetici olarak **Ayarlar** (`#/ayarlar`) sayfasından **"Anlık Yedek İndir (.db)"** butonuna tıklayarak tek tıkla indirebilirsiniz.
- **Yedekten Geri Yükleme:**
  ```bash
  sudo systemctl stop callcenter
  sudo cp /var/lib/callcenter/backups/callcenter-2026-10-15.db /var/lib/callcenter/callcenter.db
  sudo chown callcenter:callcenter /var/lib/callcenter/callcenter.db
  sudo systemctl start callcenter
  ```

### Logları İzleme
```bash
sudo journalctl -u callcenter -f
```

### Kaldırma (Uninstall)
Yalnızca bu uygulamayı ve yapılandırmasını güvenle kaldırmak için:
```bash
sudo ./deploy/uninstall.sh
```

---

## ⚖️ KVKK ve Veri Güvenliği Notu

Bu yazılım; telefon numarası, yetkili adı ve görüşme notları gibi kişisel verileri yalnızca yerel SQLite veritabanında saklar.
- Dışarıya hiçbir analitik, telemetri veya bulut çağrısı yapılmaz.
- Veri sorumlusu kurumun; sunucu erişim şifrelerini güvenli tutması, `/opt/callcenter/.env` dosyasını koruması ve sunucu dışı güvenli ortamlara periyodik yedek alması KVKK ve GDPR uyumu açısından zorunludur.
