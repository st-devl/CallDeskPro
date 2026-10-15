#!/usr/bin/env bash
# ==============================================================================
# CALL CENTER — Kurulum Öncesi Güvenlik ve Uygunluk Kontrolü (Preflight)
# ==============================================================================
# DİKKAT: Bu script sunucuda KESİNLİKLE hiçbir değişiklik yapmaz; yalnızca okur.
# Sunucudaki mevcut diğer projelere zarar vermemek için tasarlanmıştır.
# ==============================================================================

set -u

echo "=================================================================="
echo "  CALL CENTER — SUNUCU ÖN KONTROL RAPORU"
echo "  Tarih: $(date)"
echo "=================================================================="
echo ""

# 1. İşletim Sistemi ve Çekirdek
echo "[1] İşletim Sistemi Bilgisi:"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "    Dağıtım: $PRETTY_NAME"
else
    echo "    Dağıtım: Bilinmiyor ($(uname -s))"
fi
echo "    Çekirdek: $(uname -r)"
echo "    Mimari: $(uname -m) (Yayın paketi yalnızca x86_64 için derlenir)"
echo ""

# 2. Kaynak Durumu (Disk ve RAM)
echo "[2] Kaynak Durumu:"
echo "    Boş RAM:"
free -h | awk '/^Mem:/ {print "      Toplam: "$2", Kullanılan: "$3", Boş: "$4", Kullanılabilir: "$7}'
echo "    Boş Disk Alanı (Kök Dizin /):"
df -h / | awk 'NR==2 {print "      Toplam: "$2", Boş: "$4", Doluluk: "$5}'
echo ""

# 3. Dinlenen Portlar
echo "[3] Dinlenen Portlar (ss -tlnp):"
if command -v ss >/dev/null 2>&1; then
    ss -tlnp | head -n 25 | sed 's/^/    /'
else
    echo "    ss komutu bulunamadı, netstat kontrol ediliyor:"
    netstat -tlnp 2>/dev/null | head -n 25 | sed 's/^/    /' || echo "    Port listesi okunamadı."
fi
echo ""

# 4. 80 ve 443 Portlarını Kullanan Servis
echo "[4] 80 ve 443 Portlarını Kullanan Web Sunucusu:"
PORT_80_PROC=$(ss -tlnp '( sport = :80 or sport = :443 )' 2>/dev/null | grep -o 'users:(("[^"]*"' | tr -d 'users:(("' || true)
if [ -n "$PORT_80_PROC" ]; then
    echo "    Aktif Web Sunucusu: $PORT_80_PROC"
else
    echo "    80/443 portunu dinleyen süreç doğrudan tespit edilemedi veya root yetkisi gerekebilir."
fi
echo ""

# 5. Node.js ve Certbot Kontrolü (Sistemdeki sürüm değiştirilmeyecek)
echo "[5] Çalışma Ortamı Kontrolleri:"
if command -v node >/dev/null 2>&1; then
    echo "    Sistem Node.js Sürümü: $(node -v) (NOT: Uygulama kendi bağımsız Node kopyasını kullanacaktır)"
else
    echo "    Sistemde Node.js kurulu değil. (Uygulama kendi izole kopyasını kullanacak)"
fi

if command -v certbot >/dev/null 2>&1; then
    echo "    Certbot: Mevcut ($(certbot --version 2>/dev/null || echo 'kurulu'))"
else
    echo "    Certbot: Kurulu değil."
fi
echo ""

# 6. Uygulama Portu Kontrolü (Varsayılan: 3100)
TARGET_PORT="${1:-3100}"
echo "[6] Hedef Port Kontrolü ($TARGET_PORT):"
if ss -tln | grep -q ":$TARGET_PORT "; then
    echo "    [UYARI] $TARGET_PORT portu şu anda KULLANIMDA! Kurulum için başka bir port seçilmelidir."
else
    echo "    [UYGUN] $TARGET_PORT portu BOŞTA. Kullanılabilir."
fi
echo ""

# 7. Dizin ve Kullanıcı Varlık Kontrolü (Çakışma Önleme)
echo "[7] Kurulum Hedefleri Kontrolü:"

if [ -d "/opt/callcenter" ]; then
    echo "    [UYARI] /opt/callcenter dizini ZATEN MEVCUT!"
else
    echo "    [UYGUN] /opt/callcenter henüz mevcut değil."
fi

if [ -d "/var/lib/callcenter" ]; then
    echo "    [UYARI] /var/lib/callcenter dizini ZATEN MEVCUT!"
else
    echo "    [UYGUN] /var/lib/callcenter henüz mevcut değil."
fi

if id "callcenter" >/dev/null 2>&1; then
    echo "    [UYARI] 'callcenter' Linux kullanıcısı ZATEN MEVCUT!"
else
    echo "    [UYGUN] 'callcenter' kullanıcısı henüz mevcut değil."
fi

if [ -f "/etc/systemd/system/callcenter.service" ]; then
    echo "    [UYARI] /etc/systemd/system/callcenter.service ZATEN MEVCUT!"
else
    echo "    [UYGUN] Servis dosyası henüz mevcut değil."
fi
echo ""

echo "=================================================================="
echo "  Ön kontrol tamamlandı. Raporu inceleyip onay veriniz."
echo "=================================================================="
