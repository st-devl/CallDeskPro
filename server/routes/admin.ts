import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, unlinkSync, createReadStream } from 'node:fs';
import { getDatabase } from '../db.js';
import {
  validateSession,
  hashPassword,
  destroyAllUserSessions,
  type User
} from '../auth.js';
import { nowUtcIso } from '../time.js';

import { requireAdmin } from '../guards.js';

export const adminRoutes: FastifyPluginAsync<{ dataDir?: string }> = async (fastify, opts) => {
  const db = getDatabase();
  const dataDir = opts?.dataDir || resolve(process.cwd(), process.env.DATA_DIR || './data');

  // Yönetici Yetki Kontrolü Ön Kancası
  fastify.addHook('preHandler', requireAdmin);

  // Kullanıcı listesi
  fastify.get('/users', async () => {
    const users = db.prepare(`
      SELECT id, username, full_name, role, active, must_change_password, created_at, last_login_at
      FROM users
      ORDER BY id ASC
    `).all();
    return { users };
  });

  // Yeni kullanıcı ekle
  fastify.post('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, full_name, password, role } = (request.body as any) || {};

    if (!username || !full_name || !password || !role) {
      return reply.status(400).send({ error: 'Tüm alanlar zorunludur' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    if (!/^[a-z0-9_.-]{3,30}$/.test(cleanUsername)) {
      return reply.status(400).send({ error: 'Kullanıcı adı 3-30 karakter arasında ve harf, rakam, nokta, altçizgi veya tire içermelidir' });
    }

    if (!['admin', 'agent'].includes(role)) {
      return reply.status(400).send({ error: 'Geçersiz rol' });
    }

    if (String(password).length < 10) {
      return reply.status(400).send({ error: 'Şifre en az 10 karakter olmalıdır' });
    }

    // Kullanıcı adı kontrolü
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return reply.status(400).send({ error: 'Bu kullanıcı adı zaten kullanımda' });
    }

    const passwordHash = await hashPassword(String(password));
    const createdAt = nowUtcIso();

    const result = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, must_change_password, created_at)
      VALUES (?, ?, ?, ?, 1, 1, ?)
    `).run(cleanUsername, String(full_name).trim(), passwordHash, role, createdAt);

    return reply.status(201).send({
      success: true,
      user: {
        id: result.lastInsertRowid,
        username: cleanUsername,
        full_name: String(full_name).trim(),
        role,
        active: 1,
        must_change_password: 1,
        created_at: createdAt
      }
    });
  });

  // Kullanıcı düzenle
  fastify.put('/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { full_name, role } = (request.body as any) || {};
    const currentUser = (request as any).user as User;

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!targetUser) {
      return reply.status(404).send({ error: 'Kullanıcı bulunamadı' });
    }

    // Yönetici kendi rolünü düşüremez
    if (currentUser.id === targetUser.id && role && role !== 'admin') {
      return reply.status(400).send({ error: 'Yönetici kendi rolünü değiştiremez' });
    }

    const newRole = role || targetUser.role;
    const newName = full_name ? String(full_name).trim() : targetUser.full_name;

    if (!['admin', 'agent'].includes(newRole)) {
      return reply.status(400).send({ error: 'Geçersiz rol' });
    }

    db.prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?').run(newName, newRole, id);

    return reply.send({ success: true });
  });

  // Aktif / Pasif durumu değiştir
  fastify.post('/users/:id/toggle-active', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const currentUser = (request as any).user as User;

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!targetUser) {
      return reply.status(404).send({ error: 'Kullanıcı bulunamadı' });
    }

    // Yönetici kendi hesabını pasifleştiremez
    if (currentUser.id === targetUser.id) {
      return reply.status(400).send({ error: 'Yönetici kendi hesabını pasifleştiremez' });
    }

    const newActive = targetUser.active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newActive, id);

    // Pasife alındıysa tüm oturumlarını sil
    if (newActive === 0) {
      destroyAllUserSessions(db, targetUser.id);
    }

    return reply.send({ success: true, active: newActive });
  });

  // Şifre sıfırla
  fastify.post('/users/:id/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { new_password } = (request.body as any) || {};

    if (!new_password || String(new_password).length < 10) {
      return reply.status(400).send({ error: 'Yeni şifre en az 10 karakter olmalıdır' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!targetUser) {
      return reply.status(404).send({ error: 'Kullanıcı bulunamadı' });
    }

    const passwordHash = await hashPassword(String(new_password));
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(passwordHash, id);

    // Kullanıcının mevcut oturumlarını kapat
    destroyAllUserSessions(db, targetUser.id);

    return reply.send({ success: true, message: 'Şifre sıfırlandı; kullanıcı ilk girişinde şifresini değiştirmeye zorlanacak' });
  });

  // Pasif / mevcut kullanıcının kayıtlarını havuza bırak
  fastify.post('/users/:id/release-records', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const result = db.prepare(`
      UPDATE organizations
      SET assigned_to = NULL, assigned_at = NULL
      WHERE assigned_to = ?
    `).run(id);

    return reply.send({
      success: true,
      released_count: result.changes,
      message: `${result.changes} adet kayıt havuza bırakıldı`
    });
  });

  // Anlık Yedek İndir (Yönetici)
  fastify.get('/backup-download', async (request: FastifyRequest, reply: FastifyReply) => {
    const backupDir = join(dataDir, 'backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const tempBackupPath = join(backupDir, `callcenter-temp-backup-${Date.now()}.db`);
    await db.backup(tempBackupPath);

    const stream = createReadStream(tempBackupPath);
    reply.header('Content-Type', 'application/x-sqlite3');
    reply.header('Content-Disposition', 'attachment; filename="callcenter-backup.db"');

    stream.on('close', () => {
      try {
        unlinkSync(tempBackupPath);
      } catch {}
    });

    return reply.send(stream);
  });

  // Sistem Ayarlarını Getir
  fastify.get('/settings', async () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'uncontacted_limit'").get() as { value: string } | undefined;
    const limit = row ? parseInt(row.value, 10) : 1;
    return {
      uncontacted_limit: isNaN(limit) ? 1 : limit
    };
  });

  // Sistem Ayarlarını Güncelle
  fastify.put('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { uncontacted_limit } = (request.body as any) || {};
    const limit = parseInt(uncontacted_limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 10) {
      return reply.status(400).send({ error: 'Aramacı başına görüşülmemiş limit 1 ile 10 arasında bir tam sayı olmalıdır' });
    }

    db.prepare("INSERT INTO settings (key, value) VALUES ('uncontacted_limit', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(limit));

    return reply.send({
      success: true,
      message: 'Ayarlar güncellendi',
      uncontacted_limit: limit
    });
  });
};
