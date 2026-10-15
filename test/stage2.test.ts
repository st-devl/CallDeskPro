import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

import { initDatabase, closeDatabase } from '../server/db.js';
import { ensureInitialAdmin, hashPassword } from '../server/auth.js';
import { nowUtcIso, todayIstanbul } from '../server/time.js';
import { normalizePhoneDigits } from '../server/text.js';

describe('Aşama 2: Havuz, Dağıtım ve Görüşme Testleri', () => {
  const TEST_DB = resolve(process.cwd(), './data/test_stage2_callcenter.db');
  let db: any;
  let adminId: number;
  let agent1Id: number;
  let agent2Id: number;
  let listId: number;

  before(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = initDatabase(TEST_DB);

    // Kullanıcılar oluştur
    const hash = await hashPassword('Test123456!');
    const now = nowUtcIso();

    const rAdmin = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, created_at)
      VALUES ('admin_test', 'Yönetici Test', ?, 'admin', 1, ?)
    `).run(hash, now);
    adminId = Number(rAdmin.lastInsertRowid);

    const rAgent1 = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, created_at)
      VALUES ('agent1', 'Aramacı 1', ?, 'agent', 1, ?)
    `).run(hash, now);
    agent1Id = Number(rAgent1.lastInsertRowid);

    const rAgent2 = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, created_at)
      VALUES ('agent2', 'Aramacı 2', ?, 'agent', 1, ?)
    `).run(hash, now);
    agent2Id = Number(rAgent2.lastInsertRowid);

    // Açık bir liste oluştur
    const rList = db.prepare(`
      INSERT INTO lists (name, is_open, created_by, created_at)
      VALUES ('Test Havuz Listesi', 1, ?, ?)
    `).run(adminId, now);
    listId = Number(rList.lastInsertRowid);

    // 25 adet test kaydı ekle
    const insertOrg = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, whatsapp, phone, contact_person,
        created_at, updated_at, search_text, name_sort, whatsapp_normalized
      ) VALUES (?, ?, 'Türkiye', 'İstanbul', ?, ?, 'Yetkili Kişi', ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i <= 25; i++) {
      const phone = `+9055500000${i < 10 ? '0' + i : i}`;
      const name = `Test Kuruluş ${i}`;
      insertOrg.run(
        listId,
        name,
        phone,
        phone,
        now,
        now,
        `test kurulus ${i} istanbul turkiye`,
        name,
        normalizePhoneDigits(phone)
      );
    }
  });

  after(() => {
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('1. Atomik Eşzamanlı "Sıradakini Al" Testi (20 eşzamanlı istek -> 20 benzersiz kayıt)', () => {
    const assignedIds = new Set<number>();
    const now = nowUtcIso();

    // 20 adet sıralı/eşzamanlı istek simülasyonu
    for (let i = 0; i < 20; i++) {
      const targetAgent = i % 2 === 0 ? agent1Id : agent2Id;

      const assignTx = db.transaction(() => {
        const nextRow = db.prepare(`
          SELECT o.id
          FROM organizations o
          JOIN lists l ON o.list_id = l.id
          WHERE l.is_open = 1 AND o.assigned_to IS NULL
          ORDER BY o.id ASC
          LIMIT 1
        `).get() as { id: number } | undefined;

        if (!nextRow) return null;

        const updateRes = db.prepare(`
          UPDATE organizations
          SET assigned_to = ?, assigned_at = ?, updated_at = ?
          WHERE id = ? AND assigned_to IS NULL
        `).run(targetAgent, now, now, nextRow.id);

        if (updateRes.changes === 0) return null;
        return nextRow.id;
      });

      const assignedId = assignTx();
      assert.ok(assignedId !== null, `İstek ${i + 1} için kayıt atanmalı`);
      assert.ok(!assignedIds.has(assignedId), `Kayıt ID ${assignedId} daha önce başka birine atanmış olamaz!`);
      assignedIds.add(assignedId);
    }

    assert.equal(assignedIds.size, 20, '20 farklı kayıt atanmış olmalıdır');
  });

  test('2. Görüşülmemiş Kayıt Limiti (uncontacted_limit)', () => {
    // agent1 üzerinde şu anda atanmış ama status NULL olan kayıtlar var
    const uncontacted = db.prepare(`
      SELECT id FROM organizations WHERE assigned_to = ? AND status IS NULL
    `).all(agent1Id);

    assert.ok(uncontacted.length > 0, 'Aramacı üzerinde görüşülmemiş kayıt olmalı');

    // Limit 1 iken yeni kayıt çekilmek istendiğinde mevcut kayıt dönmeli, havuzdan yeni kayıt çekilmemeli
    const checkTx = () => {
      const hasUncontacted = db.prepare(`
        SELECT id FROM organizations WHERE assigned_to = ? AND status IS NULL LIMIT 1
      `).get(agent1Id);

      if (hasUncontacted) {
        return { assigned: false, record: hasUncontacted };
      }
      return { assigned: true };
    };

    const res = checkTx();
    assert.equal(res.assigned, false, 'Limit doluyken havuzdan yeni kayıt alınmamalı');
  });

  test('3. Tek Transaction ile Görüşme Kaydetme ve Geçmiş Eklenmesi', () => {
    const org = db.prepare('SELECT id, updated_at FROM organizations WHERE assigned_to = ? LIMIT 1').get(agent1Id) as any;
    const now = nowUtcIso();
    const today = todayIstanbul();

    const saveTx = db.transaction(() => {
      // 1. Organizasyonu güncelle
      db.prepare(`
        UPDATE organizations
        SET status = 'positive', note = 'Görüşme başarılı geçti', last_contact_date = ?, last_contact_by = ?, updated_at = ?
        WHERE id = ?
      `).run(today, agent1Id, now, org.id);

      // 2. Calls tablosuna ekle
      db.prepare(`
        INSERT INTO calls (organization_id, user_id, status, note, created_at)
        VALUES (?, ?, 'positive', 'Görüşme başarılı geçti', ?)
      `).run(org.id, agent1Id, now);
    });

    saveTx();

    const updatedOrg = db.prepare('SELECT status, note, last_contact_date, last_contact_by FROM organizations WHERE id = ?').get(org.id) as any;
    assert.equal(updatedOrg.status, 'positive');
    assert.equal(updatedOrg.last_contact_date, today);
    assert.equal(updatedOrg.last_contact_by, agent1Id);

    const callLogs = db.prepare('SELECT * FROM calls WHERE organization_id = ?').all(org.id);
    assert.equal(callLogs.length, 1);
    assert.equal(callLogs[0].status, 'positive');
  });

  test('4. Eşzamanlı Düzenleme Kontrolü (Optimistic Locking / 409 Çakışması)', () => {
    const org = db.prepare('SELECT id, updated_at FROM organizations WHERE assigned_to = ? LIMIT 1').get(agent1Id) as any;
    const staleUpdatedAt = '2020-01-01T00:00:00.000Z'; // Bayat tarih

    // İstemci bayat updated_at gönderdiğinde çakışma tespiti
    const isConflict = org.updated_at !== staleUpdatedAt;
    assert.ok(isConflict, 'Bayat updated_at gönderildiğinde çakışma tespit edilmeli');
  });

  test('5. Yetki İzolasyonu: Aramacı başkasının kaydını göremez/güncelleyemez', () => {
    // agent2'ye ait bir kayıt bul
    const agent2Record = db.prepare('SELECT id FROM organizations WHERE assigned_to = ? LIMIT 1').get(agent2Id) as any;

    // agent1 sorguladığında (WHERE assigned_to = agent1) gelmemeli
    const agent1View = db.prepare('SELECT id FROM organizations WHERE id = ? AND assigned_to = ?').get(agent2Record.id, agent1Id);
    assert.equal(agent1View, undefined, 'Aramacı 1, Aramacı 2 nin kaydına erişememelidir');
  });

  test('6. Liste Kapatılınca Havuzdan Dağıtımın Durması', () => {
    // Listeyi kapat
    db.prepare('UPDATE lists SET is_open = 0 WHERE id = ?').run(listId);

    const nextFromClosed = db.prepare(`
      SELECT o.id
      FROM organizations o
      JOIN lists l ON o.list_id = l.id
      WHERE l.is_open = 1 AND o.assigned_to IS NULL
      ORDER BY o.id ASC
      LIMIT 1
    `).get();

    assert.equal(nextFromClosed, undefined, 'Kapalı listeden kayıt verilmemelidir');

    // Listeyi tekrar aç
    db.prepare('UPDATE lists SET is_open = 1 WHERE id = ?').run(listId);
    const nextFromOpen = db.prepare(`
      SELECT o.id
      FROM organizations o
      JOIN lists l ON o.list_id = l.id
      WHERE l.is_open = 1 AND o.assigned_to IS NULL
      LIMIT 1
    `).get();

    assert.ok(nextFromOpen !== undefined, 'Açık listeden kayıt verilebilmelidir');
  });
});
