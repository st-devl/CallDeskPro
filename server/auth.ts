import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Database } from 'better-sqlite3';
import { nowUtcIso } from './time.js';

const scryptAsync = promisify(crypto.scrypt);

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'agent';
  active: number;
  must_change_password: number;
  created_at: string;
  last_login_at?: string | null;
}

export interface Session {
  id: string; // SHA-256 hash
  user_id: number;
  created_at: string;
  expires_at: string;
}

// Giriş denemesi sınırı (Kullanıcı adı + IP bazlı bellek içi sayaç)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, RateLimitEntry>();

const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 dakika

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (now > entry.resetAt) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function resetLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

/**
 * Şifreyi scrypt ile hashler (salt: 16 bayt, keylen: 64 bayt).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verilen şifreyi kayıtlı hash ile timingSafeEqual kullanarak karşılaştırır.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Oturum token'ının SHA-256 hash'ini hesaplar.
 */
export function hashSessionId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Yeni bir oturum oluşturur ve istemciye gönderilecek 32 bayt hex token'ı döner.
 */
export function createSession(db: Database, userId: number, sessionDays = 7): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashSessionId(rawToken);

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + sessionDays);
  const expiresAt = expiresDate.toISOString();
  const createdAt = nowUtcIso();

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashedToken, userId, createdAt, expiresAt);

  return rawToken;
}

/**
 * Oturum token'ını doğrular ve aktif kullanıcıyı döner.
 */
export function validateSession(db: Database, rawToken: string | undefined): User | null {
  if (!rawToken || rawToken.length !== 64) return null;
  const hashedToken = hashSessionId(rawToken);

  const nowIso = nowUtcIso();
  const row = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.active, u.must_change_password, u.created_at, u.last_login_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > ? AND u.active = 1
  `).get(hashedToken, nowIso) as User | undefined;

  return row || null;
}

/**
 * Oturumu sonlandırır (çıkış).
 */
export function destroySession(db: Database, rawToken: string | undefined): void {
  if (!rawToken) return;
  const hashedToken = hashSessionId(rawToken);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashedToken);
}

/**
 * Kullanıcının tüm oturumlarını siler (pasifleştirme, şifre sıfırlama durumlarında).
 */
export function destroyAllUserSessions(db: Database, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * Süresi dolmuş oturumları temizler.
 */
export function cleanupExpiredSessions(db: Database): void {
  const nowIso = nowUtcIso();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso);
}

/**
 * İlk çalıştırmada admin kullanıcısı yoksa oluşturur.
 */
export async function ensureInitialAdmin(
  db: Database,
  initialUsername?: string,
  initialPassword?: string
): Promise<void> {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount > 0) return;

  const username = (initialUsername || 'admin').toLowerCase().trim();
  const password = initialPassword || 'Degistir1234!';

  const passwordHash = await hashPassword(password);
  const createdAt = nowUtcIso();

  db.prepare(`
    INSERT INTO users (username, full_name, password_hash, role, active, must_change_password, created_at)
    VALUES (?, ?, ?, 'admin', 1, 1, ?)
  `).run(username, 'Sistem Yöneticisi', passwordHash, createdAt);
}
