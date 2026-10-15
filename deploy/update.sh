#!/usr/bin/env bash
# ==============================================================================
# CALL CENTER — Güvenli Güncelleme Scripti (Update)
# ==============================================================================
# Yalnızca callcenter servisini etkiler; sunucudaki diğer projelere dokunmaz.
# ==============================================================================

set -euo pipefail

PACKAGE_FILE="${1:-}"

if [ -z "$PACKAGE_FILE" ] || [ ! -f "$PACKAGE_FILE" ]; then
    echo "Kullanım: sudo ./update.sh <paket-dosyasi.tar.gz>"
    exit 1
fi

RELEASE_DATE=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="/opt/callcenter/releases/$RELEASE_DATE"

echo "==> Yeni sürüm klasörü oluşturuluyor: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$PACKAGE_FILE" -C "$RELEASE_DIR"

echo "==> İzinler ayarlanıyor..."
chown -R callcenter:callcenter "$RELEASE_DIR"

echo "==> Sembolik bağlantı güncelleniyor: /opt/callcenter/current"
ln -sfn "$RELEASE_DIR" /opt/callcenter/current

echo "==> Yalnızca callcenter servisi yeniden başlatılıyor..."
systemctl restart callcenter

echo "==> Servis durumu kontrol ediliyor:"
sleep 2
systemctl is-active --quiet callcenter && echo "==> [BAŞARILI] CALL CENTER güncellendi ve çalışıyor!" || echo "==> [HATA] Servis başlatılamadı! Log: journalctl -u callcenter -n 50"

echo ""
echo "Geri almak için tek komut:"
echo "sudo ln -sfn /opt/callcenter/releases/<onceki-surum> /opt/callcenter/current && sudo systemctl restart callcenter"
