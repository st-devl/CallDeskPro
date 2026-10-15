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
