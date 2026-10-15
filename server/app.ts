import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { initDatabase } from './db.js';
import { ensureInitialAdmin } from './auth.js';
import { startBackupScheduler } from './backup.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { importRoutes } from './routes/import.js';
import { exportRoutes } from './routes/export.js';
import { organizationRoutes } from './routes/organizations.js';

export interface BuildAppOptions {
  dataDir?: string;
  publicOrigin?: string;
  port?: number;
  host?: string;
  skipBackupScheduler?: boolean;
}

/**
 * Fastify uygulamasını HTTP portu dinlemeye başlamadan oluşturan fabrika fonksiyonu.
 * Testlerde fastify.inject() ile çağırmak ve geçici veritabanı bağlamak için uygundur.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const dataDir = resolve(process.cwd(), options.dataDir || process.env.DATA_DIR || './data');
  const dbPath = join(dataDir, 'callcenter.db');
  const port = options.port || parseInt(process.env.PORT || '3100', 10);
  const host = options.host || '127.0.0.1';
  const publicOrigin = options.publicOrigin || process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;

  // Veritabanını başlat
  const db = initDatabase(dbPath);

  // İlk yöneticiyi oluştur
  await ensureInitialAdmin(
    db,
    process.env.INITIAL_ADMIN_USERNAME,
    process.env.INITIAL_ADMIN_PASSWORD
  );

  // Otomatik yedekleme zamanlayıcısını başlat (Testlerde atlanabilir)
  if (!options.skipBackupScheduler) {
    startBackupScheduler(db, dataDir);
  }

  const fastify = Fastify({
    logger: false,
    trustProxy: '127.0.0.1',
    bodyLimit: 1048576
  });

  // Çerez desteği
  await fastify.register(cookie, {
    secret: undefined
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
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; form-action 'self'"
    );

    const method = request.method;
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const origin = request.headers['origin'];
      if (origin) {
        const reqHost = request.headers['host'];
        const allowedOrigins = [
          publicOrigin,
          `http://${host}:${port}`,
          `http://localhost:${port}`,
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
  await fastify.register(adminRoutes, { prefix: '/api/admin', dataDir });
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
  }

  return fastify;
}
