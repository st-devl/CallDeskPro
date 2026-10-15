import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from './db.js';
import { validateSession, type User } from './auth.js';

/**
 * Oturum açmış kullanıcı kontrol kancası.
 * must_change_password = 1 ise yalnızca izinli auth rotalarına geçit verir.
 */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const db = getDatabase();
  const rawToken = request.cookies.session_id;
  const user = validateSession(db, rawToken);

  if (!user) {
    reply.status(401).send({ error: 'Oturum açmanız gerekiyor' });
    return;
  }

  // must_change_password kontrolü (sunucu seviyesinde güvenlik)
  if (user.must_change_password === 1) {
    const path = request.url.split('?')[0];
    const method = request.method.toUpperCase();

    const isAllowed =
      (method === 'GET' && (path === '/api/auth/me' || path === '/auth/me' || path === '/me')) ||
      (method === 'POST' && (path === '/api/auth/change-password' || path === '/auth/change-password' || path === '/change-password')) ||
      (method === 'POST' && (path === '/api/auth/logout' || path === '/auth/logout' || path === '/logout'));

    if (!isAllowed) {
      reply.status(403).send({
        error: 'Önce şifrenizi değiştirmelisiniz',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
      return;
    }
  }

  (request as any).user = user;
}

/**
 * Yönetici (admin) yetkisi kontrol kancası.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Eğer request.user henüz atanmamışsa önce requireUser çalıştır
  if (!(request as any).user) {
    await requireUser(request, reply);
    if (reply.sent) return;
  }

  const user = (request as any).user as User | undefined;
  if (!user || user.role !== 'admin') {
    reply.status(403).send({ error: 'Bu işlem için yönetici yetkisi gereklidir' });
    return;
  }
}
