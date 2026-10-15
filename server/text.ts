/**
 * CALL CENTER - Türkçe Metin, Sıralama, Telefon ve HTML Escape Yardımcıları
 */

// Aksan sadeleştirme tablosu
const ACCENT_MAP: Record<string, string> = {
  'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
  'â': 'a', 'î': 'i', 'û': 'u', 'é': 'e', 'è': 'e', 'ê': 'e',
  'à': 'a', 'ä': 'a', 'ë': 'e', 'ï': 'i', 'ô': 'o', 'ù': 'u'
};

/**
 * Türkçe kurallara göre küçük harfe çevirir ve aksanları sadeleştirir.
 * "ISIK", "ışık", "Işık" aynı sonucu üretir.
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  const lower = text.toLocaleLowerCase('tr-TR');
  let result = '';
  for (const char of lower) {
    result += ACCENT_MAP[char] || char;
  }
  // Fazla boşlukları tek boşluğa indir
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Türk alfabesi sırasına göre sıralama anahtarı (sort key) üretir.
 * Türk alfabesi sırası: a, b, c, ç, d, e, f, g, ğ, h, ı, i, j, k, l, m, n, o, ö, p, r, s, ş, t, u, ü, v, y, z
 * SQLite'ta düz ASCII sıralamasında bu sırayı koruyabilmek için iki baytlık sıralama kodlarına dönüştürülür.
 */
const TR_SORT_ORDER: Record<string, string> = {
  'a': '01', 'b': '02', 'c': '03', 'ç': '04', 'd': '05',
  'e': '06', 'f': '07', 'g': '08', 'ğ': '09', 'h': '10',
  'ı': '11', 'i': '12', 'j': '13', 'k': '14', 'l': '15',
  'm': '16', 'n': '17', 'o': '18', 'ö': '19', 'p': '20',
  'r': '21', 's': '22', 'ş': '23', 't': '24', 'u': '25',
  'ü': '26', 'v': '27', 'y': '28', 'z': '29'
};

export function createSortKey(text: string | null | undefined): string {
  if (!text) return '';
  const lower = text.toLocaleLowerCase('tr-TR').trim();
  let key = '';
  for (const char of lower) {
    if (TR_SORT_ORDER[char]) {
      key += TR_SORT_ORDER[char];
    } else if (/[0-9]/.test(char)) {
      key += '00' + char;
    } else if (char === ' ') {
      key += '00 ';
    } else {
      key += '30' + char;
    }
  }
  return key;
}

/**
 * WhatsApp / Telefon numarasını normalize eder.
 * 00 ile başlıyorsa temizlenir, boşluk, parantez, tire, nokta atılır.
 * Yalnızca rakamları döner.
 */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = String(phone).trim();
  // 00 ile başlıyorsa kaldır
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  // Artı işaretini kaldır
  cleaned = cleaned.replace(/^\+/, '');
  // Sadece rakamları al
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return digits;
}

/**
 * Telefon numarasının geçerli uluslararası biçimde olup olmadığını kontrol eder.
 * Geçerli biçim: '+' ve 8-15 rakam veya normalize edilmiş rakamlar.
 */
export function isValidInternationalPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = normalizePhoneDigits(phone);
  return digits !== null && digits.length >= 8 && digits.length <= 15;
}

/**
 * WhatsApp linki için temiz uluslararası numara döner (başında + olmadan sadece rakamlar).
 */
export function getWhatsAppNumber(phone: string | null | undefined): string | null {
  return normalizePhoneDigits(phone);
}

/**
 * HTML özel karakterlerini escape eder.
 */
export function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Çok satırlı metni HTML escape edip satır sonlarını <br> yapar.
 */
export function escapeHtmlWithLineBreaks(text: string | null | undefined): string {
  return escapeHtml(text).replace(/\r\n/g, '<br>').replace(/\n/g, '<br>');
}
