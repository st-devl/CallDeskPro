/**
 * CALL CENTER - Zaman ve Saat Dilimi Yardımcıları
 * Zaman damgaları UTC ISO 8601 olarak saklanır;
 * Gün hesapları ve arayüz gösterimi Europe/Istanbul saat dilimine göredir.
 */

const ISTANBUL_TZ = 'Europe/Istanbul';

/**
 * Şu anki tarihi Europe/Istanbul saat dilimine göre YYYY-MM-DD formatında döner.
 */
export function todayIstanbul(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Verilen UTC ISO string'i Türkiye saatiyle GG.AA.YYYY SS:DD formatına çevirir.
 */
export function formatDateTimeIstanbul(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/**
 * YYYY-MM-DD formatındaki tarihi GG.AA.YYYY formatına çevirir.
 */
export function formatDateDisplay(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateString;
  const [, y, m, d] = match;
  return `${d}.${m}.${y}`;
}

/**
 * Şu anki anı UTC ISO formatında döner.
 */
export function nowUtcIso(): string {
  return new Date().toISOString();
}

/**
 * Verilen string'in gerçek ve geçerli bir YYYY-MM-DD tarihi olup olmadığını doğrular.
 * Gün, ay sınırları, artık yıllar ve Date nesnesi tutarlılığını denetler.
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) return false;
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Verilen YYYY-MM-DD başlangıç ve bitiş tarihlerini Europe/Istanbul gün sınırlarına göre
 * [startUtcIso, endUtcIso) yarı açık UTC aralığına çevirir.
 */
export function istanbulDayRangeUtc(startDate: string, endDate: string): [string, string] {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new Error('Geçersiz tarih değeri. Tarih geçerli bir YYYY-MM-DD olmalıdır');
  }

  // Türkiye saat dilimi UTC+3 sabittir (+03:00)
  const startUtc = new Date(`${startDate}T00:00:00.000+03:00`).toISOString();

  // Bitiş gününün ertesi günü 00:00:00+03:00 (yarı açık aralık için)
  const [endY, endM, endD] = endDate.split('-').map(Number);
  const nextDay = new Date(Date.UTC(endY, endM - 1, endD + 1));
  const nextDayStr = nextDay.toISOString().slice(0, 10);
  const endUtc = new Date(`${nextDayStr}T00:00:00.000+03:00`).toISOString();

  return [startUtc, endUtc];
}
