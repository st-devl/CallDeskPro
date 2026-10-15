import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { initDatabase, getDatabase } from './db.js';
import { ensureInitialAdmin, cleanupExpiredSessions } from './auth.js';
import { startBackupScheduler } from './backup.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { importRoutes } from './routes/import.js';
import { exportRoutes } from './routes/export.js';
import { organizationRoutes } from './routes/organizations.js';

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
const DB_PATH = join(DATA_DIR, 'callcenter.db');
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`;

// Veritabanını başlat
const db = initDatabase(DB_PATH);

// İlk yöneticiyi oluştur
await ensureInitialAdmin(
  db,
  process.env.INITIAL_ADMIN_USERNAME,
  process.env.INITIAL_ADMIN_PASSWORD
);

// Otomatik günlük yedekleme zamanlayıcısını başlat (Her gün 03:30 Europe/Istanbul)
startBackupScheduler(db, DATA_DIR);

const fastify = Fastify({
  logger: false, // Log miktarı düşük tutulur; journald'ye gider
  trustProxy: '127.0.0.1',
  bodyLimit: 1048576 // 1 MB varsayılan
});

// Çerez desteği
await fastify.register(cookie, {
  secret: undefined // HMAC imzası yerine DB hash kullanılıyor
});

// Merkezi Hata İşleyicisi (5xx hatalarında SQLite/iç detayları gizler, loglar)
fastify.setErrorHandler((error: any, request, reply) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`[500 Hata] ${request.method} ${request.url}:`, error.stack || error);
    return reply.status(500).send({ error: 'Sunucu hatası oluştu' });
  }
  return reply.status(statusCode).send({
    error: error.message || 'Bir hata oluştu'
  });
});

// Güvenlik Başlıkları ve CSRF Kontrolü
fastify.addHook('onRequest', async (request, reply) => {
  // Güvenlik başlıkları
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; form-action 'self'"
  );

  // CSRF kontrolü: Durum değiştiren isteklerde Origin kontrolü
  const method = request.method;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const origin = request.headers['origin'];
    if (origin) {
      // Origin tanımlıysa PUBLIC_ORIGIN ile veya localhost/127.0.0.1 ile eşleşmeli
      const reqHost = request.headers['host'];
      const allowedOrigins = [
        PUBLIC_ORIGIN,
        `http://${HOST}:${PORT}`,
        `http://localhost:${PORT}`,
        reqHost ? `http://${reqHost}` : '',
        reqHost ? `https://${reqHost}` : ''
      ].filter(Boolean);

      if (!allowedOrigins.includes(origin)) {
        return reply.status(403).send({ error: 'CSRF koruması: Geçersiz Origin' });
      }
    }
  }
});

// Ham dosya yükleme için octet-stream desteği (10 MB'a kadar)
fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => {
  done(null, body);
});

// API Rotaları
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(adminRoutes, { prefix: '/api/admin' });
await fastify.register(organizationRoutes, { prefix: '/api/organizations' });
await fastify.register(importRoutes, { prefix: '/api/import' });
await fastify.register(exportRoutes, { prefix: '/api/export' });

// Ön Yüz Statik Dosyaları (dist/web klasöründen)
const webDistPath = resolve(process.cwd(), 'dist/web');
if (existsSync(webDistPath)) {
  await fastify.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    setHeaders: (res, path) => {
      if (path.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  });

  // SPA fallback
  fastify.setNotFoundHandler((request, reply) => {
    if (request.raw.url && request.raw.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Uç nokta bulunamadı' });
    }
    const indexPath = join(webDistPath, 'index.html');
    if (existsSync(indexPath)) {
      reply.header('Cache-Control', 'no-cache');
      return reply.type('text/html').send(readFileSync(indexPath));
    }
    return reply.status(404).send('Not Found');
  });
} else {
  // Geliştirme aşamasında henüz build alınmamışsa
  fastify.get('/', async (_, reply) => {
    return reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head><meta charset="utf-8"><title>CALL CENTER</title></head>
      <body style="font-family:sans-serif;padding:2rem;text-align:center;">
        <h2>CALL CENTER API Çalışıyor</h2>
        <p>Ön yüz derlemesi için <code>npm run build:web</code> çalıştırın veya <code>npm run dev:web</code> ile Vite sunucusunu başlatın.</p>
      </body>
      </html>
    `);
  });
}

// Günde bir kez süresi dolmuş oturumları temizle (24 saatte bir)
setInterval(() => {
  try {
    cleanupExpiredSessions(db);
  } catch (err) {
    // Hata durumunda loglama
  }
}, 24 * 60 * 60 * 1000);

// Sunucuyu başlat
try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`[CALL CENTER] Sunucu dinleniyor: http://${HOST}:${PORT}`);
} catch (err) {
  console.error('[CALL CENTER] Sunucu başlatılamadı:', err);
  process.exit(1);
}
