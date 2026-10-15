import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { cleanupExpiredSessions } from './auth.js';
import { getDatabase } from './db.js';

export { buildApp } from './app.js';

// .env dosyasını oku (basit, ek kütüphanesiz)
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = '127.0.0.1';
const DATA_DIR = resolve(process.cwd(), process.env.DATA_DIR || './data');
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`;

const fastify = await buildApp({
  dataDir: DATA_DIR,
  port: PORT,
  host: HOST,
  publicOrigin: PUBLIC_ORIGIN
});

// Günde bir kez süresi dolmuş oturumları temizle (24 saatte bir)
const cleanupSessionsInterval = setInterval(() => {
  try {
    const db = getDatabase();
    cleanupExpiredSessions(db);
  } catch (err) {
    // Hata durumunda loglama
  }
}, 24 * 60 * 60 * 1000);
if (cleanupSessionsInterval.unref) {
  cleanupSessionsInterval.unref();
}

// Sunucuyu başlat
try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`[CALL CENTER] Sunucu dinleniyor: http://${HOST}:${PORT}`);
} catch (err) {
  console.error('[CALL CENTER] Sunucu başlatılamadı:', err);
  process.exit(1);
}
