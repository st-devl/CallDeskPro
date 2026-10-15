# CALL CENTER — Sunucu Kurulum Kılavuzu (Adım Adım)

Bu kurulum, üzerinde başka önemli projelerin çalıştığı Ubuntu 24.04 LTS sunucuya **sıfır riskle** kurulum yapmak üzere tasarlanmıştır.

> **ÖNEMLİ:** Her adımdan önce ne yapacağını okuyun, komutu tek tek çalıştırın. Beklenmeyen bir durumda her adımın **Geri Alma** komutunu uygulayın.

---

## 0. Ön Kontrol (Salt Okuma)

Hiçbir şeyi değiştirmeden sunucunun durumunu raporlar:

```bash
sudo ./deploy/preflight.sh
```

- **Ne yapar?** Portları, RAM/disk durumunu, web sunucusunu, `/opt/callcenter` ve `callcenter` kullanıcısının durumunu kontrol eder.
- **Değişiklik:** Hiçbir şey değiştirilmez.
- **Karar:** 3100 portu veya önerilen port boşta ve çakışma yoksa Adım 1'e geçin.

---

## 1. Linux Kullanıcısı Oluşturma

Uygulamanın çalışacağı kısıtlı sistem kullanıcısını oluşturur:

```bash
sudo useradd -r -s /usr/sbin/nologin -d /opt/callcenter callcenter
```

- **Ne değiştirir?** `callcenter` adında, giriş kabuğu (`nologin`) olmayan ve `sudo` yetkisi bulunmayan bir sistem kullanıcısı ekler.
- **Geri alma:** `sudo userdel callcenter`

---

## 2. Klasörlerin Hazırlanması

```bash
sudo mkdir -p /opt/callcenter/releases
sudo mkdir -p /var/lib/callcenter/backups
sudo chown -R callcenter:callcenter /opt/callcenter /var/lib/callcenter
sudo chmod 750 /opt/callcenter /var/lib/callcenter
```

- **Ne değiştirir?** Yalnızca `/opt/callcenter` ve `/var/lib/callcenter` dizinlerini açar.
- **Geri alma:** `sudo rm -rf /opt/callcenter /var/lib/callcenter`

---

## 3. Uygulama Paketinin Açılması ve İzinler

GitHub Actions'tan veya yerel derlemeden üretilen `callcenter-release.tar.gz` paketini sunucuya kopyalayın:

```bash
RELEASE_TAG=$(date +%Y%m%d_%H%M%S)
sudo mkdir -p /opt/callcenter/releases/$RELEASE_TAG
sudo tar -xzf callcenter-release.tar.gz -C /opt/callcenter/releases/$RELEASE_TAG
sudo ln -sfn /opt/callcenter/releases/$RELEASE_TAG /opt/callcenter/current
sudo chown -R callcenter:callcenter /opt/callcenter
```

- **Ne değiştirir?** Derlenmiş kodu `/opt/callcenter/releases/` altına koyar ve `current` sembolik linki oluşturur.
- **Geri alma:** `sudo rm -rf /opt/callcenter/releases/$RELEASE_TAG /opt/callcenter/current`

---

## 4. Yapılandırma Dosyası (.env)

```bash
sudo cp /opt/callcenter/current/.env.example /opt/callcenter/.env
sudo chown callcenter:callcenter /opt/callcenter/.env
sudo chmod 600 /opt/callcenter/.env
sudo nano /opt/callcenter/.env
```

`.env` dosyasında şu değerleri tanımlayın:
```ini
PORT=3100
PUBLIC_ORIGIN=https://arama.alanadiniz.com
DATA_DIR=/var/lib/callcenter
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=GuvenliIlkSifre123!
SESSION_DAYS=7
```

- **Ne değiştirir?** Yalnızca `/opt/callcenter/.env` dosyasını oluşturur (izin: 600, sadece `callcenter` kullanıcısı okuyabilir).
- **Geri alma:** `sudo rm -f /opt/callcenter/.env`

---

## 5. Systemd Servis Dosyası

```bash
sudo cp /opt/callcenter/current/deploy/callcenter.service /etc/systemd/system/callcenter.service
sudo systemctl daemon-reload
sudo systemctl enable callcenter
sudo systemctl start callcenter
```

- **Ne değiştirir?** `/etc/systemd/system/callcenter.service` yeni dosyasını ekler ve servisi başlatır. Servis 512MB RAM ve %50 CPU ile sınırlandırılmıştır; sunucu sistem saat dilimini değiştirmeden sadece bu süreç için `TZ=Europe/Istanbul` kullanır.
- **Durum Kontrolü:** `sudo systemctl status callcenter`
- **Geri alma:**
  ```bash
  sudo systemctl stop callcenter
  sudo systemctl disable callcenter
  sudo rm -f /etc/systemd/system/callcenter.service
  sudo systemctl daemon-reload
  ```

---

## 6. Nginx Yapılandırması (Mevcut Dosyalara Dokunmadan)

> **DİKKAT:** Mevcut siteleri bozmamak için önce `nginx -t` ile sunucunun sağlamlığı doğrulanır!

1. **Mevcut Durumu Test Edin:**
   ```bash
   sudo nginx -t
   ```
2. **Yeni Dosyayı Ekleyin:**
   ```bash
   sudo cp /opt/callcenter/current/deploy/nginx-callcenter.conf /etc/nginx/sites-available/callcenter.conf
   sudo nano /etc/nginx/sites-available/callcenter.conf # domain adınızı güncelleyin
   sudo ln -s /etc/nginx/sites-available/callcenter.conf /etc/nginx/sites-enabled/callcenter.conf
   ```
3. **Yeni Dosyayı Test Edin:**
   ```bash
   sudo nginx -t
   ```
   *(Eğer test başarılı ise Adım 4'e geçin. Hata verirse hemen geri alın!)*
4. **Yalnızca Reload Yapın (Restart Yasaktır):**
   ```bash
   sudo systemctl reload nginx
   ```
5. **Certbot ile Yalnızca Bu Alt Alan Adı İçin SSL Alın:**
   ```bash
   sudo certbot --nginx -d arama.alanadiniz.com
   ```

- **Geri alma:**
  ```bash
  sudo rm -f /etc/nginx/sites-enabled/callcenter.conf /etc/nginx/sites-available/callcenter.conf
  sudo nginx -t && sudo systemctl reload nginx
  ```

---

## 7. İlk Giriş ve Güvenlik Adımı

1. Tarayıcınızdan `https://arama.alanadiniz.com` adresini açın.
2. `admin` ve belirlediğiniz `INITIAL_ADMIN_PASSWORD` ile giriş yapın.
3. Sistem sizi şifre değiştirmeye zorlayacaktır; yeni kalıcı şifrenizi girin.
4. Sunucudaki `.env` dosyasından `INITIAL_ADMIN_PASSWORD` satırını silin:
   ```bash
   sudo nano /opt/callcenter/.env
   ```

Kurulum tamamlanmıştır!
