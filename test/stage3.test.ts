import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

import { initDatabase, closeDatabase } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { nowUtcIso, todayIstanbul } from '../server/time.js';

describe('Aşama 3: Yönetici, Atama/Devir ve Raporlama Testleri', () => {
  const TEST_DB = resolve(process.cwd(), './data/test_stage3_callcenter.db');
  let db: any;
  let adminId: number;
  let agent1Id: number;
  let agent2Id: number;
  let orgId1: number;
  let orgId2: number;

  before(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = initDatabase(TEST_DB);

    const hash = await hashPassword('Test123456!');
    const now = nowUtcIso();

    const rAdmin = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, created_at)
      VALUES ('admin_s3', 'Yönetici Aşama 3', ?, 'admin', 1, ?)
    `).run(hash, now);
    adminId = Number(rAdmin.lastInsertRowid);

    const rAgent1 = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, created_at)
      VALUES ('agent1_s3', 'Aramacı 1', ?, 'agent', 1, ?)
    `).run(hash, now);
    agent1Id = Number(rAgent1.lastInsertRowid);

    const rAgent2 = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role, active, created_at)
      VALUES ('agent2_s3', 'Aramacı 2', ?, 'agent', 1, ?)
    `).run(hash, now);
    agent2Id = Number(rAgent2.lastInsertRowid);

    // Liste oluştur
    const rList = db.prepare(`
      INSERT INTO lists (name, is_open, created_by, created_at)
      VALUES ('Yönetim Test Listesi', 1, ?, ?)
    `).run(adminId, now);
    const listId = Number(rList.lastInsertRowid);

    // Kayıtlar ekle
    const rOrg1 = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, whatsapp, phone, contact_person,
        assigned_to, assigned_at, status, note, created_at, updated_at, search_text, name_sort
      ) VALUES (?, 'Dernek A', 'Türkiye', 'Ankara', '+905551112233', '+905551112233', 'Ali', ?, ?, NULL, NULL, ?, ?, 'dernek a ali ankara turkiye', 'Dernek A')
    `).run(listId, agent1Id, now, now, now);
    orgId1 = Number(rOrg1.lastInsertRowid);

    const rOrg2 = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, whatsapp, phone, contact_person,
        assigned_to, assigned_at, status, note, created_at, updated_at, search_text, name_sort
      ) VALUES (?, 'Vakıf B', 'Almanya', 'Köln', '+491512345678', '+491512345678', 'Hans', ?, ?, NULL, NULL, ?, ?, 'vakif b hans koln almanya', 'Vakıf B')
    `).run(listId, agent1Id, now, now, now);
    orgId2 = Number(rOrg2.lastInsertRowid);
  });

  after(() => {
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('1. Toplu Kayıt Atama ve Devir', () => {
    const now = nowUtcIso();

    // orgId1 ve orgId2'yi agent1'den agent2'ye devret
    const res = db.prepare(`
      UPDATE organizations
      SET assigned_to = ?, assigned_at = ?, updated_at = ?
      WHERE id IN (?, ?)
    `).run(agent2Id, now, now, orgId1, orgId2);

    assert.equal(res.changes, 2, '2 kayıt devredilmelidir');

    const org1 = db.prepare('SELECT assigned_to FROM organizations WHERE id = ?').get(orgId1) as any;
    assert.equal(org1.assigned_to, agent2Id, 'Kayıt 1 artık Aramacı 2 ye ait olmalı');
  });

  test('2. Devir Sonrası Eski Aramacının Erişememesi (Yetki Kontrolü)', () => {
    // agent1 sorguladığında (WHERE assigned_to = agent1) kayıt gelmemeli
    const agent1Check = db.prepare(`
      SELECT id FROM organizations WHERE id = ? AND assigned_to = ?
    `).get(orgId1, agent1Id);

    assert.equal(agent1Check, undefined, 'Eski aramacı devredilen kayda erişememelidir');
  });

  test('3. Kayıtları Havuza Geri Bırakma', () => {
    const now = nowUtcIso();

    const res = db.prepare(`
      UPDATE organizations
      SET assigned_to = NULL, assigned_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, orgId2);

    assert.equal(res.changes, 1);
    const org2 = db.prepare('SELECT assigned_to FROM organizations WHERE id = ?').get(orgId2) as any;
    assert.equal(org2.assigned_to, null, 'Kayıt 2 havuzda olmalıdır');
  });

  test('4. Görüşme Geçmişi (Calls) ve Personel Performansı Raporlama Sorgusu', () => {
    const today = todayIstanbul();
    const now = nowUtcIso();

    // agent2, org1 ile olumlu görüşme yaptı
    db.prepare(`
      INSERT INTO calls (organization_id, user_id, status, note, created_at)
      VALUES (?, ?, 'positive', 'Bağış alındı', ?)
    `).run(orgId1, agent2Id, now);

    db.prepare(`
      UPDATE organizations
      SET status = 'positive', note = 'Bağış alındı', last_contact_date = ?, last_contact_by = ?
      WHERE id = ?
    `).run(today, agent2Id, orgId1);

    // Performans özeti hesaplaması
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN status = 'negative' THEN 1 ELSE 0 END) as negative_count
      FROM calls
      WHERE user_id = ?
    `).get(agent2Id) as any;

    assert.equal(stats.total_calls, 1, 'Toplam 1 görüşme olmalı');
    assert.equal(stats.positive_count, 1, '1 olumlu görüşme olmalı');
  });
});
