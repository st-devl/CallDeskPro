#!/usr/bin/env bash
# ==============================================================================
# CALL CENTER — Güvenli Kaldırma Scripti (Uninstall)
# ==============================================================================
# DİKKAT: Yalnızca CALL CENTER'a ait öğeleri kaldırır.
# Diğer projelere, diğer veritabanlarına veya web sunucusuna zarar vermez.
# ==============================================================================

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Bu script root yetkisiyle (sudo) çalıştırılmalıdır."
    exit 1
fi

echo "=================================================================="
echo "  DİKKAT: CALL CENTER UYGULAMASI KALDIRILACAK"
echo "=================================================================="
read -p "Devam etmek istiyor musunuz? (evet/hayir): " CONFIRM
if [ "$CONFIRM" != "evet" ]; then
    echo "İşlem iptal edildi."
    exit 0
fi

echo "1. callcenter servisi durduruluyor ve devre dışı bırakılıyor..."
if systemctl is-active --quiet callcenter 2>/dev/null; then
    systemctl stop callcenter || true
fi
systemctl disable callcenter 2>/dev/null || true
rm -f /etc/systemd/system/callcenter.service
systemctl daemon-reload

echo "2. Web sunucusu yapılandırma dosyaları kaldırılıyor..."
if [ -f /etc/nginx/sites-enabled/callcenter.conf ]; then
    rm -f /etc/nginx/sites-enabled/callcenter.conf
    rm -f /etc/nginx/sites-available/callcenter.conf
    nginx -t && systemctl reload nginx || true
fi

if [ -f /etc/apache2/sites-enabled/callcenter.conf ]; then
    a2dissite callcenter.conf || true
    rm -f /etc/apache2/sites-available/callcenter.conf
    apache2ctl configtest && systemctl reload apache2 || true
fi

echo "3. Uygulama dosyaları (/opt/callcenter) kaldırılıyor..."
rm -rf /opt/callcenter

echo "4. callcenter Linux kullanıcısı kaldırılıyor..."
if id "callcenter" >/dev/null 2>&1; then
    userdel callcenter || true
fi

echo ""
echo "=================================================================="
echo "  VERİTABANI VE YEDEK DOSYALARI (/var/lib/callcenter)"
echo "=================================================================="
read -p "/var/lib/callcenter altındaki veritabanını ve yedekleri de silmek istiyor musunuz? (evet/hayir): " CONFIRM_DATA

if [ "$CONFIRM_DATA" = "evet" ]; then
    rm -rf /var/lib/callcenter
    echo "Veri klasörü tamamen silindi."
else
    echo "Veri klasörü korundu: /var/lib/callcenter"
fi

echo "==> CALL CENTER başarıyla kaldırıldı."
