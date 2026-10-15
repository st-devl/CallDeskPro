import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

import { normalizeSearchText, createSortKey, normalizePhoneDigits, isValidInternationalPhone, escapeHtml } from '../server/text.js';
import { todayIstanbul, formatDateTimeIstanbul } from '../server/time.js';
import { initDatabase, closeDatabase } from '../server/db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  destroyAllUserSessions,
  ensureInitialAdmin,
  isRateLimited,
  recordFailedLogin,
  resetLoginAttempts
} from '../server/auth.js';

describe('Aşama 1: Temel ve Güvenlik Testleri', () => {
  const TEST_DB = resolve(process.cwd(), './data/test_callcenter.db');

  before(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  after(() => {
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('1. Türkçe metin normalize ve arama anahtarı', () => {
    assert.equal(normalizeSearchText('ISIK'), 'isik');
    assert.equal(normalizeSearchText('ışık'), 'isik');
    assert.equal(normalizeSearchText('Işık'), 'isik');
    assert.equal(normalizeSearchText('ÇÖĞŞÜ'), 'cogsu');
    assert.equal(normalizeSearchText('  Ömer   Faruk  '), 'omer faruk');
  });

  test('2. Türk alfabesi sıralama anahtarı (name_sort)', () => {
    const keyC = createSortKey('Can');
    const keyC2 = createSortKey('Çan');
    const keyD = createSortKey('Dan');
    const keyI = createSortKey('Irmak');
    const keyİ = createSortKey('İrmik');

    // c < ç < d olmalı
    assert.ok(keyC < keyC2, 'Can, Çan kelimesinden önce gelmelidir');
    assert.ok(keyC2 < keyD, 'Çan, Dan kelimesinden önce gelmelidir');
    // ı < i olmalı
    assert.ok(keyI < keyİ, 'Irmak, İrmik kelimesinden önce gelmelidir');
  });

  test('3. Telefon numarası doğrulama ve normalize', () => {
    assert.equal(normalizePhoneDigits('0090 555 123 45 67'), '905551234567');
    assert.equal(normalizePhoneDigits('+90 (555) 123-4567'), '905551234567');
    assert.equal(normalizePhoneDigits('123'), null); // çok kısa
    assert.equal(isValidInternationalPhone('+905551234567'), true);
    assert.equal(isValidInternationalPhone('abc'), false);
  });

  test('4. HTML Escape güvenliği (XSS)', () => {
    const malicious = '<script>alert("xss")</script>&\'';
    const escaped = escapeHtml(malicious);
    assert.equal(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#39;');
    assert.ok(!escaped.includes('<script>'));
  });

  test('5. Zaman: Europe/Istanbul gün tayini (UTC gece testi)', () => {
    // 2026-10-15 22:30:00 UTC -> Türkiye'de 2026-10-16 01:30:00 (UTC+3)
    const lateUtc = new Date('2026-10-15T22:30:00.000Z');
    const istanbulDay = todayIstanbul(lateUtc);
    assert.equal(istanbulDay, '2026-10-16', 'UTC 22:30 iken Türkiye gününe göre 16 Ekim olmalıdır');

    const formatted = formatDateTimeIstanbul('2026-10-15T22:30:00.000Z');
    assert.equal(formatted, '16.10.2026 01:30');
  });

  test('6. Şifre hashleme ve doğrulama (scrypt + timingSafeEqual)', async () => {
    const password = 'GuvenliSifre123!';
    const hash = await hashPassword(password);
    assert.ok(hash.includes(':'), 'Hash salt:key formatında olmalıdır');

    const isCorrect = await verifyPassword(password, hash);
    assert.equal(isCorrect, true);

    const isWrong = await verifyPassword('YanlisSifre123!', hash);
    assert.equal(isWrong, false);
  });

  test('7. Veritabanı ve Oturum Yönetimi (SHA-256 session hash)', async () => {
    const db = initDatabase(TEST_DB);

    // İlk admin oluşturma
    await ensureInitialAdmin(db, 'admin', 'Gecici1234!');
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;
    assert.ok(admin, 'Admin kullanıcısı oluşturulmalı');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.must_change_password, 1);

    // Oturum oluşturma
    const token = createSession(db, admin.id, 7);
    assert.equal(token.length, 64, 'Token 32 bayt hex (64 karakter) olmalıdır');

    // Oturum doğrulama
    const user = validateSession(db, token);
    assert.ok(user, 'Oturum doğrulanabilmeli');
    assert.equal(user?.id, admin.id);

    // Oturum kapatma (çıkış)
    destroySession(db, token);
    const afterLogout = validateSession(db, token);
    assert.equal(afterLogout, null, 'Çıkış sonrası oturum sonlandırılmalı');
  });

  test('8. Brute-force koruması (Rate Limit)', () => {
    const testKey = '127.0.0.1:deneme_user';
    resetLoginAttempts(testKey);

    assert.equal(isRateLimited(testKey), false);
    for (let i = 0; i < 4; i++) {
      recordFailedLogin(testKey);
      assert.equal(isRateLimited(testKey), false);
    }
    // 5. hatalı deneme
    recordFailedLogin(testKey);
    assert.equal(isRateLimited(testKey), true, '5 hatalı denemeden sonra rate limit devreye girmeli');
  });
});
