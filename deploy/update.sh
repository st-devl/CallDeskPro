#!/usr/bin/env bash
# ==============================================================================
# CALL CENTER — Güvenli Güncelleme Scripti (Update)
# ==============================================================================
# Yalnızca callcenter servisini etkiler; sunucudaki diğer projelere dokunmaz.
# Yeni sürüm açılırken veritabanı şeması otomatik güncellenebildiği için,
# geçişten önce servis durdurulur ve veritabanının tam kopyası alınır.
# ==============================================================================

set -euo pipefail

PACKAGE_FILE="${1:-}"

if [ -z "$PACKAGE_FILE" ] || [ ! -f "$PACKAGE_FILE" ]; then
    echo "Kullanım: sudo ./update.sh <paket-dosyasi.tar.gz>"
    exit 1
fi

# Veri dizinini .env dosyasından oku (varsayılan: /var/lib/callcenter)
DATA_DIR=$(grep -E '^DATA_DIR=' /opt/callcenter/.env 2>/dev/null | tail -n 1 | cut -d= -f2- || true)
DATA_DIR="${DATA_DIR:-/var/lib/callcenter}"

RELEASE_DATE=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="/opt/callcenter/releases/$RELEASE_DATE"
PREVIOUS_RELEASE=$(readlink -f /opt/callcenter/current || true)
BACKUP_DIR="$DATA_DIR/backups/pre-update-$RELEASE_DATE"

echo "==> Yeni sürüm klasörü oluşturuluyor: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$PACKAGE_FILE" -C "$RELEASE_DIR"

echo "==> İzinler ayarlanıyor..."
chown -R callcenter:callcenter "$RELEASE_DIR"

echo "==> Servis durduruluyor (yedeğin tutarlı olması için)..."
systemctl stop callcenter

echo "==> Güncelleme öncesi veritabanı yedeği alınıyor: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
# WAL/SHM dosyaları da kopyalanır; servis durduğu için kopya tutarlıdır
cp -p "$DATA_DIR"/callcenter.db* "$BACKUP_DIR"/
chown -R callcenter:callcenter "$BACKUP_DIR"

echo "==> Sembolik bağlantı güncelleniyor: /opt/callcenter/current"
ln -sfn "$RELEASE_DIR" /opt/callcenter/current

echo "==> Yalnızca callcenter servisi başlatılıyor..."
systemctl start callcenter

echo "==> Servis durumu kontrol ediliyor:"
sleep 2
if systemctl is-active --quiet callcenter; then
    echo "==> [BAŞARILI] CALL CENTER güncellendi ve çalışıyor!"
else
    echo "==> [HATA] Servis başlatılamadı! Log: journalctl -u callcenter -n 50"
fi

echo ""
echo "Geri almak için (eski sürüm + güncelleme öncesi veritabanı):"
echo "  sudo systemctl stop callcenter"
echo "  sudo rm -f $DATA_DIR/callcenter.db-wal $DATA_DIR/callcenter.db-shm"
echo "  sudo cp -p $BACKUP_DIR/callcenter.db* $DATA_DIR/"
echo "  sudo ln -sfn $PREVIOUS_RELEASE /opt/callcenter/current"
echo "  sudo systemctl start callcenter"
