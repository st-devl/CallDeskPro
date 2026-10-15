/**
 * CALL CENTER - XSS Korumalı Şablon Motoru
 * Kullanıcıdan veya veritabanından gelen tüm değişkenler otomatik escape edilir.
 * Sadece raw(...) veya html`...` ile işaretlenen güvenli yapılar ham olarak eklenir.
 */

export class SafeHtml {
  constructor(public readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
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

export function html(strings: TemplateStringsArray, ...values: unknown[]): any {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof SafeHtml) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val
          .map(v => (v instanceof SafeHtml ? v.value : escapeHtml(v)))
          .join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return new SafeHtml(result);
}
