/**
 * CALL CENTER - XSS Korumalı Şablon Motoru
 * Kullanıcıdan veya veritabanından gelen tüm değişkenler otomatik escape edilir.
 * Sadece raw(...) ile işaretlenen güvenli yapılar (SVG ikonları vb.) ham olarak eklenir.
 */

class RawHtml {
  constructor(public readonly value: string) {}
}

export function raw(value: string): RawHtml {
  return new RawHtml(value);
}

export function escapeHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawHtml) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val
          .map(v => (v instanceof RawHtml ? v.value : escapeHtml(v)))
          .join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return result;
}
