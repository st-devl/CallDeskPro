import { raw } from './html.js';

/**
 * CALL CENTER - Satır İçi SVG İkon Seti
 * Harici font veya CDN bağımlılığı olmadan, tek yerde tanımlı minimal SVG'ler.
 */

function svg(paths: string, size = 20, viewBox = '0 0 24 24', className = 'icon'): any {
  return raw(
    `<svg class="${className}" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

export const icons = {
  // Telefon
  phone: (size = 20) =>
    svg(
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
      size
    ),

  // WhatsApp
  whatsapp: (size = 20) =>
    raw(
      `<svg class="icon icon-whatsapp" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.477-.15-.678.15-.201.3-.778.978-.954 1.179-.176.2-.352.226-.653.075-.301-.15-1.272-.469-2.423-1.496-.895-.798-1.5-1.784-1.676-2.085-.176-.301-.019-.464.132-.614.135-.134.301-.352.451-.527.151-.176.201-.301.301-.502.101-.2.05-.376-.025-.527-.075-.15-.678-1.633-.929-2.237-.245-.588-.493-.508-.678-.518-.176-.008-.376-.01-.577-.01-.201 0-.527.075-.803.376-.276.3-1.054 1.03-1.054 2.51 0 1.48 1.079 2.909 1.23 3.11.15.201 2.124 3.243 5.146 4.548.719.311 1.28.497 1.718.636.722.23 1.378.198 1.898.12.578-.087 1.78-.727 2.03-1.43.251-.703.251-1.305.176-1.43-.075-.125-.276-.201-.577-.351zM12.04 2C6.516 2 2.03 6.484 2.03 12.008c0 1.984.58 3.844 1.6 5.412L2 22l4.73-1.55a9.96 9.96 0 0 0 5.31 1.558c5.524 0 10.01-4.484 10.01-10.008C22.05 6.484 17.564 2 12.04 2z"/></svg>`
    ),

  // Kopyala
  copy: (size = 18) =>
    svg(
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      size
    ),

  // Kullanıcı
  user: (size = 20) =>
    svg(
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      size
    ),

  // Çıkış
  logout: (size = 20) =>
    svg(
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
      size
    ),

  // Ayarlar
  settings: (size = 20) =>
    svg(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      size
    ),

  // Arama / Büyüteç
  search: (size = 18) =>
    svg(
      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      size
    ),

  // Filtre
  filter: (size = 18) =>
    svg(
      '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
      size
    ),

  // Listeler / Klasör
  lists: (size = 20) =>
    svg(
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
      size
    ),

  // Görüşme Kayıtları
  history: (size = 20) =>
    svg(
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      size
    ),

  // Özet / Performans
  summary: (size = 20) =>
    svg(
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      size
    ),

  // Artı / Ekle
  plus: (size = 18) =>
    svg(
      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
      size
    ),

  // Kapat / Çarpı
  close: (size = 18) =>
    svg(
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      size
    ),

  // Onay / Tik
  check: (size = 18) =>
    svg(
      '<polyline points="20 6 9 17 4 12"/>',
      size
    ),

  // Uyarı
  alert: (size = 18) =>
    svg(
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      size
    ),

  // Düzenle
  edit: (size = 18) =>
    svg(
      '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
      size
    ),

  // Sil / Çöp Kutusu
  trash: (size = 18) =>
    svg(
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
      size
    ),

  // Sıradakini Al / Oynat
  play: (size = 18) =>
    svg(
      '<polygon points="5 3 19 12 5 21 5 3"/>',
      size
    ),

  // Yenile
  refresh: (size = 18) =>
    svg(
      '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
      size
    ),

  // Kilit / Şifre
  lock: (size = 20) =>
    svg(
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      size
    ),

  // Dışa Aktar
  download: (size = 18) =>
    svg(
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      size
    )
};
