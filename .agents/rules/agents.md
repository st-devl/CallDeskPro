# AGENTS.md — Otonom Ajan ve Geliştirme Kuralları (Antigravity / AI IDE)

Bu dosya, projede çalışan tüm yapay zeka ajanları (Antigravity, Claude, Cursor, Cline vb.) için **kesin ve bağlayıcı** çalışma anayasasıdır. Ajanlar her görev öncesinde bu kuralları okumak ve eksiksiz uygulamakla yükümlüdür.

---

## GELİŞTİRME KURALLARI (TEMEL İLKELER)

### 1. KARARLARA SADAKAT
Projenin başlangıçta belirlenen mimarisini, teknolojilerini, tasarımını ve temel gereksinimlerini koru. Kullanıcı açıkça istemedikçe bu kararları değiştirme.

### 2. TEK REFERANS
Başlangıç kararlarını `PROJECT.md` dosyasında tut. Her yeni görevde ilgili kararları kontrol et. Çelişki varsa varsayım yapma, kullanıcıya sor.

### 3. MİMARİ UYUMLULUK
Yeni özellik geliştirmeden önce mevcut kodu ve bağımlılıkları incele. Yeni yapı, mevcut modüllerle, veri akışıyla ve mimariyle uyumlu olmalı. Bağımsız çalışması yeterli değildir.

### 4. KÜÇÜK VE GÜVENLİ ADIMLAR
Değişiklikleri küçük, kontrollü adımlarla uygula. Çalışan kodu gereksiz yere yeniden yazma. İlgisiz dosyalara dokunma.

### 5. HAFİF TEST
Her tamamlanan özellikten sonra ilgili işlevi doğrulayan kısa ve hızlı bir test çalıştır. Mevcut temel akışın bozulmadığını kontrol et. Gereksiz kapsamlı test süreçleri oluşturma.

### 6. SADELİK VE PERFORMANS
En basit, anlaşılır ve sürdürülebilir çözümü tercih et. Gereksiz paket, bağımlılık, soyutlama, servis veya karmaşık mimari ekleme. Mevcut teknolojileri öncelikle kullan.

### 7. TAMAMLAMA KONTROLÜ
Bir görevi bitirmeden önce gereksinimlere uygunluğunu, mevcut yapıyla entegrasyonunu ve test sonucunu kontrol et. Test edilmemiş kodu çalışıyor olarak sunma. Sorun varsa açıkça bildir.

---

## OPERASYONEL İŞ AKIŞI VE KISITLAMALAR

### A. Görev Öncesi Kontrol (Pre-Flight Check) ve Akıllı Okuma Matrisi
Gereksiz bağlam (context) şişmesini ve sistem yükünü önlemek için ajan her promptta tüm dosyaları okumaz. Görev türüne göre sadece ilgili dosyayı hedefli olarak açar (`view_file`):

| Görev Türü | Okunacak Dosya / Bölüm | Kural ve Amacı |
|---|---|---|
| **Sunucu / Dağıtım / Script / Port / Servis** | `PROJECT.md` (**Bölüm 0: SUNUCU GÜVENLİK KURALLARI**) | Başka projelere dokunma, port ve kısıtlama kurallarına harfiyen uy. |
| **Yeni Özellik / DB Şeması / API / Mimari** | `PROJECT.md` (**İlgili Özellik Bölümü**) | Sadece ilgili spesifikasyon bölümünü hedefli oku, varsayım yapma. |
| **Arayüz / HTML / CSS / Frontend / Bileşen** | `STYLE_GUIDE.md` | Renk, tipografi ve boşluk token'larını doğrudan bu dosyadan al. Tasarım dışı görevlerde bu dosyayı ASLA okuma. |
| **Küçük Düzeltme / Kod Açıklama / Git / Durum** | *Ek dosya okuma* | `PROJECT.md` veya `STYLE_GUIDE.md` dosyalarını gereksiz yere okuyup bağlamı şişirme. |

1. **Mevcut Kod Analizi:** Değişiklik yapacağın modülün bağımlılıklarını ve veri akışını incele.
2. **Belirsizlik Yönetimi:** İstenen özellik `PROJECT.md` ile çelişiyorsa veya mimari bir karar gerektiriyorsa **DUR** ve kullanıcıdan onay iste.

### B. Kesin Yasaklar (Strict Anti-Patterns)
- **İzinsiz Paket Kurulumu Yasaktır:** Kullanıcıdan açık onay almadan `package.json`, `composer.json` veya benzeri bağımlılık dosyalarına yeni kütüphane ekleme.
- **Kapsam Dışı (Scope Creep) Değişiklik Yasaktır:** Sadece görevde belirtilen dosya ve fonksiyonlara odaklan. "Kod temizliği" veya "iyileştirme" adı altında çalışan başka kod bloklarını değiştirme veya silme.
- **Tasarım Dışı Stil Yasaktır:** `STYLE_GUIDE.md` dışında sabit (hardcoded) renk (`#hex`), rastgele boşluk (`px`/`rem`) veya inline CSS (`style="..."`) kullanma.
- **Varsayımsal Tamamlama Yasaktır:** Kodu çalıştırmadan veya doğrulamadan "tamamlandı ve sorunsuz çalışıyor" raporu verme.

### C. Görev Sonrası Raporlama Standardı
Bir adımı tamamladığında kullanıcıya sadece şu özet bilgileri net biçimde sun:
1. **Değiştirilen/Eklenen Dosyalar:** Hangi dosyalarda ne işlem yapıldı?
2. **Test ve Doğrulama:** Hangi hafif test çalıştırıldı ve sonucu ne oldu?
3. **Açık Noktalar (Varsa):** Karşılaşılan bir kısıtlama veya kullanıcı kararı bekleyen durum var mı?
