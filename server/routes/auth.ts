import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db.js';
import {
  verifyPassword,
  hashPassword,
  createSession,
  validateSession,
  destroySession,
  destroyAllUserSessions,
  isRateLimited,
  recordFailedLogin,
  resetLoginAttempts,
  type User
} from '../auth.js';
import { nowUtcIso } from '../time.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase();

  // Giriş
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = (request.body as any) || {};

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return reply.status(400).send({ error: 'Kullanıcı adı ve şifre zorunludur' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const clientIp = request.ip || '127.0.0.1';
    const rateLimitKey = `${clientIp}:${cleanUsername}`;

    if (isRateLimited(rateLimitKey)) {
      return reply.status(429).send({
        error: 'Çok fazla hatalı deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.'
      });
    }

    const user = db.prepare(`
      SELECT id, username, full_name, password_hash, role, active, must_change_password
      FROM users
      WHERE username = ?
    `).get(cleanUsername) as (User & { password_hash: string }) | undefined;

    if (!user || user.active !== 1) {
      recordFailedLogin(rateLimitKey);
      return reply.status(401).send({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      recordFailedLogin(rateLimitKey);
      return reply.status(401).send({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    resetLoginAttempts(rateLimitKey);

    // Son giriş zamanını güncelle
    const nowIso = nowUtcIso();
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso, user.id);

    const sessionDays = parseInt(process.env.SESSION_DAYS || '7', 10);
    const token = createSession(db, user.id, sessionDays);

    const isSecure = process.env.NODE_ENV === 'production' || request.protocol === 'https';

    reply.setCookie('session_id', token, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      maxAge: sessionDays * 24 * 60 * 60
    });

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        must_change_password: user.must_change_password === 1
      }
    });
  });

  // Çıkış
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies.session_id;
    if (rawToken) {
      destroySession(db, rawToken);
    }
    const isSecure = process.env.NODE_ENV === 'production' || request.protocol === 'https';
    reply.clearCookie('session_id', {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict'
    });
    return reply.send({ success: true });
  });

  // Mevcut oturum bilgisi
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies.session_id;
    const user = validateSession(db, rawToken);

    if (!user) {
      return reply.status(401).send({ error: 'Oturum bulunamadı veya süresi doldu' });
    }

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        must_change_password: user.must_change_password === 1
      }
    });
  });

  // Şifre değiştirme (İlk giriş veya kullanıcının kendi isteğiyle)
  fastify.post('/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies.session_id;
    const user = validateSession(db, rawToken);

    if (!user) {
      return reply.status(401).send({ error: 'Oturum açmanız gerekiyor' });
    }

    const { current_password, new_password } = (request.body as any) || {};

    if (!new_password || typeof new_password !== 'string' || new_password.length < 10) {
      return reply.status(400).send({ error: 'Yeni şifre en az 10 karakter olmalıdır' });
    }

    // Mevcut şifreyi doğrula
    const currentUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
    const isValid = await verifyPassword(current_password, currentUser.password_hash);
    if (!isValid) {
      return reply.status(400).send({ error: 'Mevcut şifreniz hatalı' });
    }

    const newHash = await hashPassword(new_password);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(newHash, user.id);

    // Diğer oturumları temizle ve yeni bir oturum token'ı oluştur
    destroyAllUserSessions(db, user.id);
    const sessionDays = parseInt(process.env.SESSION_DAYS || '7', 10);
    const newToken = createSession(db, user.id, sessionDays);

    const isSecure = process.env.NODE_ENV === 'production' || request.protocol === 'https';
    reply.setCookie('session_id', newToken, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      maxAge: sessionDays * 24 * 60 * 60
    });

    return reply.send({ success: true, message: 'Şifreniz başarıyla değiştirildi' });
  });
};
