import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../server/app.js';
import { initDatabase, closeDatabase, getDatabase } from '../server/db.js';
import { hashPassword, createSession } from '../server/auth.js';
import { nowUtcIso, todayIstanbul } from '../server/time.js';

describe('Aşama 5: HTTP Rota ve Entegrasyon Testleri (fastify.inject)', () => {
  const TEST_DATA_DIR = resolve(process.cwd(), './data/test_routes_' + Date.now());
  let app: FastifyInstance;
  let adminCookie: string;
  let agent1Cookie: string;
  let agent2Cookie: string;
  let mustChangeUserCookie: string;

  let agent1Id: number;
  let agent2Id: number;
  let mustChangeUserId: number;

  before(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    closeDatabase();

    app = await buildApp({
      dataDir: TEST_DATA_DIR,
      skipBackupScheduler: true
    });

    // 500 hatası testi için rota
    app.get('/test-500-trigger', async () => {
      throw new Error('SQLITE_ERROR: no such table: non_existent_dummy');
    });

    await app.ready();

    const db = getDatabase();

    // 1. Admin oturumu (ensureInitialAdmin varsayılan admini oluşturdu)
    const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number };
    db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(adminUser.id);
    adminCookie = createSession(db, adminUser.id, 7);

    // 2. Agent 1
    const passHash = await hashPassword('password_123456');
    const nowIso = nowUtcIso();

    const resAgent1 = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, must_change_password, created_at)
      VALUES ('agent1', 'Aramacı Bir', ?, 'agent', 1, 0, ?)
    `).run(passHash, nowIso);
    agent1Id = Number(resAgent1.lastInsertRowid);
    agent1Cookie = createSession(db, agent1Id, 7);

    // 3. Agent 2
    const resAgent2 = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, must_change_password, created_at)
      VALUES ('agent2', 'Aramacı İki', ?, 'agent', 1, 0, ?)
    `).run(passHash, nowIso);
    agent2Id = Number(resAgent2.lastInsertRowid);
    agent2Cookie = createSession(db, agent2Id, 7);

    // 4. must_change_password = 1 olan kullanıcı
    const resMustChange = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, must_change_password, created_at)
      VALUES ('mustchange', 'İlk Giriş Kullanıcı', ?, 'admin', 1, 1, ?)
    `).run(passHash, nowIso);
    mustChangeUserId = Number(resMustChange.lastInsertRowid);
    mustChangeUserCookie = createSession(db, mustChangeUserId, 7);
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    closeDatabase();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  test('1. GET /api/organizations/filters ve ?due=1 -> 200 döner', async () => {
    const resFilters = await app.inject({
      method: 'GET',
      url: '/api/organizations/filters',
      cookies: { session_id: adminCookie }
    });
    if (resFilters.statusCode !== 200) {
      console.log('resFilters failed:', resFilters.statusCode, resFilters.body);
    }
    assert.equal(resFilters.statusCode, 200, 'filters uç noktası 200 dönmelidir');
    const filtersData = JSON.parse(resFilters.body);
    assert.ok(Array.isArray(filtersData.countries));
    assert.ok(Array.isArray(filtersData.cities));

    const resDue = await app.inject({
      method: 'GET',
      url: '/api/organizations?due=1',
      cookies: { session_id: adminCookie }
    });
    assert.equal(resDue.statusCode, 200, '?due=1 filtresi 200 dönmelidir');
    const dueData = JSON.parse(resDue.body);
    assert.ok(Array.isArray(dueData.records));
  });

  test('2. must_change_password = 1 olan bir kullanıcı /api/admin/users isteğinde 403 alır; şifre değiştirdikten sonra 200 alır', async () => {
    // Şifre değiştirmemiş kullanıcı korumalı rotaya erişemez
    const resForbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { session_id: mustChangeUserCookie }
    });
    assert.equal(resForbidden.statusCode, 403);
    const forbiddenJson = JSON.parse(resForbidden.body);
    assert.equal(forbiddenJson.code, 'PASSWORD_CHANGE_REQUIRED');

    // /api/auth/me rotasına erişebilmelidir
    const resMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { session_id: mustChangeUserCookie }
    });
    assert.equal(resMe.statusCode, 200);

    // Şifresini değiştirir
    const resChange = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      cookies: { session_id: mustChangeUserCookie },
      payload: {
        current_password: 'password_123456',
        new_password: 'new_valid_password_12345'
      }
    });
    assert.equal(resChange.statusCode, 200);
    const newCookie = resChange.cookies.find(c => c.name === 'session_id')?.value;
    assert.ok(newCookie, 'Yeni oturum çerezi verilmelidir');

    // Şifre değiştikten sonra artık /api/admin/users'a erişebilir
    const resAllowed = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { session_id: newCookie }
    });
    assert.equal(resAllowed.statusCode, 200);
  });

  test('3. Aramacı başkasının kaydına GET ve PUT atınca 404 alır', async () => {
    const db = getDatabase();
    // Agent 1'e atanmış bir kayıt oluştur
    const orgRes = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, search_text, name_sort, name_key,
        assigned_to, created_at, updated_at
      ) VALUES (1, 'Özel Firma', 'Türkiye', 'Ankara', 'ozel firma', 'ozel firma', 'ozel firma', ?, ?, ?)
    `).run(agent1Id, nowUtcIso(), nowUtcIso());
    const orgId = Number(orgRes.lastInsertRowid);

    // Agent 2 (başka aramacı) bu kaydı göremez
    const resGet = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}`,
      cookies: { session_id: agent2Cookie }
    });
    assert.equal(resGet.statusCode, 404, 'Aramacı başkasının kaydını GET edince 404 almalıdır');

    // Agent 2 bu kaydı güncelleyemez
    const resPut = await app.inject({
      method: 'PUT',
      url: `/api/organizations/${orgId}`,
      cookies: { session_id: agent2Cookie },
      payload: { status: 'positive' }
    });
    assert.equal(resPut.statusCode, 404, 'Aramacı başkasının kaydını PUT edince 404 almalıdır');
  });

  test('4. Adı ve ülkesi aynı olan, telefonsuz bir kaydın içe aktarılması mükerrer sayılır', async () => {
    // CSV içeriği: 2 satır aynı ad ve ülke, telefonsuz
    const csvContent = 'Kuruluş Adı,Ülke\nYetim Vakfı,Türkiye\nYetim Vakfı,Türkiye\nFarklı Dernek,Türkiye\n';
    const csvBuffer = Buffer.from(csvContent, 'utf-8');

    const resUpload = await app.inject({
      method: 'POST',
      url: '/api/import/upload',
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': encodeURIComponent('liste.csv'),
        'x-list-name': encodeURIComponent('Mükerrer Test Listesi')
      },
      cookies: { session_id: adminCookie },
      payload: csvBuffer
    });
    assert.equal(resUpload.statusCode, 200);
    const uploadData = JSON.parse(resUpload.body);
    const token = uploadData.token;

    const resConfirm = await app.inject({
      method: 'POST',
      url: '/api/import/confirm',
      cookies: { session_id: adminCookie },
      payload: {
        token,
        listName: 'Mükerrer Test Listesi',
        mapping: {
          organization_name: 0,
          country: 1
        }
      }
    });
    assert.equal(resConfirm.statusCode, 200);
    const confirmData = JSON.parse(resConfirm.body);
    assert.equal(confirmData.added_count, 2, '2 benzersiz kuruluş eklenmelidir');
    assert.equal(confirmData.duplicate_count, 1, 'Adı ve ülkesi aynı olan telefonsuz kayıt mükerrer sayılmalıdır');
  });

  test('5. Sonuç seçilmeden yapılan PUT -> last_contact_date değişmez', async () => {
    const db = getDatabase();
    const oldContactDate = '2025-01-01';
    const orgRes = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, search_text, name_sort, name_key,
        assigned_to, last_contact_date, last_contact_by, created_at, updated_at
      ) VALUES (1, 'Bilgi Güncelleme Firması', 'Türkiye', 'Bursa', 'bilgi guncelleme', 'bilgi guncelleme', 'bilgi guncelleme', ?, ?, 1, ?, ?)
    `).run(agent1Id, oldContactDate, nowUtcIso(), nowUtcIso());
    const orgId = Number(orgRes.lastInsertRowid);

    // Sonuç (status) göndermeden yalnızca not ve websitesi güncellemesi
    const resPut = await app.inject({
      method: 'PUT',
      url: `/api/organizations/${orgId}`,
      cookies: { session_id: agent1Cookie },
      payload: {
        note: 'Yalnızca adres notu eklendi',
        website: 'https://ornek.org'
      }
    });
    assert.equal(resPut.statusCode, 200);

    const updated = db.prepare('SELECT last_contact_date, note, website FROM organizations WHERE id = ?').get(orgId) as any;
    assert.equal(updated.last_contact_date, oldContactDate, 'Sonuç seçilmediğinde last_contact_date eski değerini korumalıdır');
    assert.equal(updated.note, 'Yalnızca adres notu eklendi');
    assert.equal(updated.website, 'https://ornek.org');
  });

  test('6. İstanbul saatiyle 01:30 daki bir görüşme raporda doğru güne düşer', async () => {
    const db = getDatabase();
    // İstanbul saatiyle 2026-11-20 01:30:00 (UTC: 2026-11-19T22:30:00.000Z)
    const callCreatedAt = '2026-11-19T22:30:00.000Z';

    const orgRes = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, search_text, name_sort, name_key,
        assigned_to, created_at, updated_at
      ) VALUES (1, 'Gece Görüşmesi Kurumu', 'gece gorusmesi', 'gece gorusmesi', 'gece gorusmesi', ?, ?, ?)
    `).run(agent1Id, callCreatedAt, callCreatedAt);
    const orgId = Number(orgRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO calls (organization_id, user_id, status, note, created_at)
      VALUES (?, ?, 'positive', 'Gece görüşmesi olumlu', ?)
    `).run(orgId, agent1Id, callCreatedAt);

    // İstanbul gününe göre 2026-11-20 raporu
    const resTargetDay = await app.inject({
      method: 'GET',
      url: '/api/organizations/performance-summary?start_date=2026-11-20&end_date=2026-11-20',
      cookies: { session_id: adminCookie }
    });
    assert.equal(resTargetDay.statusCode, 200);
    const dataTargetDay = JSON.parse(resTargetDay.body);
    const agent1Summary = dataTargetDay.summary.find((s: any) => s.id === agent1Id);
    assert.equal(agent1Summary.total_calls, 1, '2026-11-20 gününde görüşme sayılmalıdır');

    // Bir önceki gün 2026-11-19 raporu
    const resPrevDay = await app.inject({
      method: 'GET',
      url: '/api/organizations/performance-summary?start_date=2026-11-19&end_date=2026-11-19',
      cookies: { session_id: adminCookie }
    });
    assert.equal(resPrevDay.statusCode, 200);
    const dataPrevDay = JSON.parse(resPrevDay.body);
    const agent1PrevSummary = dataPrevDay.summary.find((s: any) => s.id === agent1Id);
    assert.equal(agent1PrevSummary.total_calls, 0, '2026-11-19 gününde sayılmamalıdır');
  });

  test('7. uncontacted_limit = 3 iken /next üç kayda kadar atama yapar', async () => {
    const db = getDatabase();
    // Limiti 3 yap
    const resSetLimit = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      cookies: { session_id: adminCookie },
      payload: { uncontacted_limit: 3 }
    });
    assert.equal(resSetLimit.statusCode, 200);

    // Açık bir listeye 5 adet boş kayıt ekle
    const listRes = db.prepare(`
      INSERT INTO lists (name, is_open, created_at)
      VALUES ('Açık Dağıtım Listesi', 1, ?)
    `).run(nowUtcIso());
    const openListId = Number(listRes.lastInsertRowid);

    const nowIso = nowUtcIso();
    for (let i = 1; i <= 5; i++) {
      db.prepare(`
        INSERT INTO organizations (
          list_id, organization_name, search_text, name_sort, name_key,
          assigned_to, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `).run(openListId, `Kayıt ${i}`, `kayit ${i}`, `kayit ${i}`, `kayit ${i}`, nowIso, nowIso);
    }

    // Agent 2 henüz hiç görüşülmemiş kayda sahip değil
    // 1. çağrı -> Atanır
    const res1 = await app.inject({ method: 'POST', url: '/api/organizations/next', cookies: { session_id: agent2Cookie } });
    assert.equal(res1.statusCode, 200);
    assert.equal(JSON.parse(res1.body).assigned, true);

    // 2. çağrı -> Atanır
    const res2 = await app.inject({ method: 'POST', url: '/api/organizations/next', cookies: { session_id: agent2Cookie } });
    assert.equal(res2.statusCode, 200);
    assert.equal(JSON.parse(res2.body).assigned, true);

    // 3. çağrı -> Atanır
    const res3 = await app.inject({ method: 'POST', url: '/api/organizations/next', cookies: { session_id: agent2Cookie } });
    assert.equal(res3.statusCode, 200);
    assert.equal(JSON.parse(res3.body).assigned, true);

    // 4. çağrı -> Limit 3 olduğu için yeni kayıt atanmaz, ilk görüşülmemiş kayıt uyarısıyla döner
    const res4 = await app.inject({ method: 'POST', url: '/api/organizations/next', cookies: { session_id: agent2Cookie } });
    assert.equal(res4.statusCode, 200);
    const data4 = JSON.parse(res4.body);
    assert.equal(data4.assigned, false, 'Limiti aştığında yeni kayıt atanmamalıdır');
    assert.ok(data4.record, 'İlk görüşülmemiş kayıt döndürülmelidir');
  });

  test('8. 500 hatasında yanıtta SQLite mesajı yok', async () => {
    // 500 hatası tetiklemek için bilinçli olarak bozuk bir durum üret
    // fastify.inject() ile var olmayan geçersiz parametreler veya iç hata simülasyonu
    // Örneğin organizations.ts veya admin.ts'te olmayan bir route ya da setErrorHandler test etmek için
    // Test route'u ekleyebilir veya Fastify setErrorHandler'ı doğrudan test edebiliriz:
    const res500 = await app.inject({
      method: 'GET',
      url: '/test-500-trigger'
    });

    assert.equal(res500.statusCode, 500);
    const body500 = JSON.parse(res500.body);
    assert.equal(body500.error, 'Sunucu hatası oluştu');
    assert.equal(res500.body.includes('SQLITE'), false, 'Yanıtta SQLite kelimesi yer almamalıdır');
    assert.equal(res500.body.includes('column'), false, 'Yanıtta veritabanı detayları sızmamalıdır');
  });
});
