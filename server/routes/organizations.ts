import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db.js';
import { validateSession, type User } from '../auth.js';
import {
  normalizeSearchText,
  createSortKey,
  normalizePhoneDigits,
  isValidInternationalPhone
} from '../text.js';
import { todayIstanbul, nowUtcIso, istanbulDayRangeUtc } from '../time.js';

import { requireUser, requireAdmin } from '../guards.js';
import { buildOrgFilter } from '../filter.js';

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase();

  // Oturum Doğrulama Ön Kancası
  fastify.addHook('preHandler', requireUser);

  // İstatistik Kartları
  fastify.get('/stats', async (request: FastifyRequest) => {
    const user = (request as any).user as User;
    const today = todayIstanbul();

    if (user.role === 'agent') {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as my_total,
          SUM(CASE WHEN last_contact_date = ? AND last_contact_by = ? THEN 1 ELSE 0 END) as today_contacted,
          SUM(CASE WHEN status = 'positive' THEN 1 ELSE 0 END) as positive,
          SUM(CASE WHEN status = 'follow_up' AND follow_up_date <= ? THEN 1 ELSE 0 END) as due_followups
        FROM organizations
        WHERE assigned_to = ?
      `).get(today, user.id, today, user.id) as any;

      return {
        my_total: stats.my_total || 0,
        today_contacted: stats.today_contacted || 0,
        positive: stats.positive || 0,
        due_followups: stats.due_followups || 0
      };
    } else {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) as pool_waiting,
          SUM(CASE WHEN status = 'positive' THEN 1 ELSE 0 END) as positive,
          SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) as follow_up,
          SUM(CASE WHEN last_contact_date = ? THEN 1 ELSE 0 END) as today_contacted
        FROM organizations
      `).get(today) as any;

      return {
        total: stats.total || 0,
        pool_waiting: stats.pool_waiting || 0,
        positive: stats.positive || 0,
        follow_up: stats.follow_up || 0,
        today_contacted: stats.today_contacted || 0
      };
    }
  });

  // Filtreler için Ülke ve Şehir Listesi
  fastify.get('/filters', async (request: FastifyRequest) => {
    const user = (request as any).user as User;

    let countryQuery = "SELECT DISTINCT country FROM organizations WHERE country IS NOT NULL AND country != ''";
    let cityQuery = "SELECT DISTINCT city FROM organizations WHERE city IS NOT NULL AND city != ''";
    const filterParams: any[] = [];

    if (user.role === 'agent') {
      countryQuery += ' AND assigned_to = ?';
      cityQuery += ' AND assigned_to = ?';
      filterParams.push(user.id);
    }

    countryQuery += ' ORDER BY country ASC';
    cityQuery += ' ORDER BY city ASC';

    const countries = db.prepare(countryQuery).all(...filterParams).map((r: any) => r.country);
    const cities = db.prepare(cityQuery).all(...filterParams).map((r: any) => r.city);

    // Listeler (Yönetici için)
    let lists: any[] = [];
    if (user.role === 'admin') {
      lists = db.prepare('SELECT id, name FROM lists ORDER BY name ASC').all();
    }

    return { countries, cities, lists };
  });

  // Sıradakini Al (Atomik Havuz Ataması)
  fastify.post('/next', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const nowIso = nowUtcIso();

    // 1. Görüşülmemiş kayıt limiti kontrolü
    const limitSetting = db.prepare("SELECT value FROM settings WHERE key = 'uncontacted_limit'").get() as { value: string } | undefined;
    const parsedLimit = parseInt(limitSetting?.value || '1', 10);
    const uncontactedLimit = isNaN(parsedLimit) || parsedLimit < 1 ? 1 : parsedLimit;

    const uncontactedCount = (db.prepare(`
      SELECT COUNT(*) as total
      FROM organizations
      WHERE assigned_to = ? AND status IS NULL
    `).get(user.id) as { total: number }).total;

    if (uncontactedCount >= uncontactedLimit) {
      const firstUncontacted = db.prepare(`
        SELECT id, organization_name, country, city, whatsapp, phone, website, contact_person, status, note, updated_at
        FROM organizations
        WHERE assigned_to = ? AND status IS NULL
        ORDER BY id ASC
        LIMIT 1
      `).get(user.id) as any;

      return reply.send({
        assigned: false,
        message: 'Üzerinizde henüz görüşülmemiş bir kayıt bulunmaktadır. Önce bu görüşmeyi tamamlayınız.',
        record: firstUncontacted
      });
    }

    // 2. Havuzdan atomik olarak açık listelerden ilk boş kaydı çek
    const assignTx = db.transaction(() => {
      // Açık listelerdeki ilk boş kaydı bul
      const nextRow = db.prepare(`
        SELECT o.id
        FROM organizations o
        JOIN lists l ON o.list_id = l.id
        WHERE l.is_open = 1 AND o.assigned_to IS NULL
        ORDER BY o.id ASC
        LIMIT 1
      `).get() as { id: number } | undefined;

      if (!nextRow) {
        return null;
      }

      // Atomik olarak kullanıcıya ata
      const updateRes = db.prepare(`
        UPDATE organizations
        SET assigned_to = ?, assigned_at = ?, updated_at = ?
        WHERE id = ? AND assigned_to IS NULL
      `).run(user.id, nowIso, nowIso, nextRow.id);

      if (updateRes.changes === 0) {
        // Yarış durumu (başka biri aynı anda aldıysa)
        return null;
      }

      return db.prepare(`
        SELECT id, organization_name, country, city, whatsapp, phone, website, contact_person, status, note, updated_at
        FROM organizations
        WHERE id = ?
      `).get(nextRow.id) as any;
    });

    const record = assignTx();

    if (!record) {
      return reply.send({
        assigned: false,
        message: 'Açık listelerde havuzda bekleyen kayıt bulunmamaktadır.',
        record: null
      });
    }

    return reply.send({
      assigned: true,
      message: 'Sıradaki kayıt size atandı.',
      record
    });
  });

  // Kayıt Listesi (Filtreleme, Sıralama, Sayfalama)
  fastify.get('/', async (request: FastifyRequest) => {
    const user = (request as any).user as User;
    const query = (request.query as any) || {};

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const { whereClause, params } = buildOrgFilter(user, query);

    // Sıralama
    let orderBy = 'o.id DESC';
    if (query.sort_by === 'name') {
      orderBy = `o.name_sort ${query.sort_dir === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (query.sort_by === 'last_contact') {
      orderBy = `o.last_contact_date ${query.sort_dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
    } else if (query.sort_by === 'follow_up') {
      orderBy = `o.follow_up_date ${query.sort_dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
    }

    // Toplam sayı sorgusu
    const countSql = `SELECT COUNT(*) as total FROM organizations o ${whereClause}`;
    const totalCount = (db.prepare(countSql).get(...params) as { total: number }).total;

    // Veri sorgusu
    const dataSql = `
      SELECT 
        o.id, o.list_id, o.organization_name, o.country, o.city,
        o.whatsapp, o.phone, o.website, o.contact_person, o.assigned_to, o.assigned_at,
        o.status, o.note, o.last_contact_date, o.follow_up_date,
        o.updated_at,
        u_assigned.full_name as assigned_name,
        u_last.full_name as last_contact_name,
        l.name as list_name
      FROM organizations o
      LEFT JOIN users u_assigned ON o.assigned_to = u_assigned.id
      LEFT JOIN users u_last ON o.last_contact_by = u_last.id
      LEFT JOIN lists l ON o.list_id = l.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const records = db.prepare(dataSql).all(...params, limit, offset);

    return {
      records,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit) || 1
      }
    };
  });

  // Tek Kayıt Detayı ve Görüşme Geçmişi (calls)
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const { id } = request.params as { id: string };

    const record = db.prepare(`
      SELECT 
        o.*,
        u_assigned.full_name as assigned_name,
        l.name as list_name
      FROM organizations o
      LEFT JOIN users u_assigned ON o.assigned_to = u_assigned.id
      LEFT JOIN lists l ON o.list_id = l.id
      WHERE o.id = ?
    `).get(id) as any;

    if (!record) {
      return reply.status(404).send({ error: 'Kayıt bulunamadı' });
    }

    // Aramacı başkasının kaydına erişemez
    if (user.role === 'agent' && record.assigned_to !== user.id) {
      return reply.status(404).send({ error: 'Kayıt bulunamadı veya bu kayda erişim yetkiniz yok' });
    }

    // Görüşme geçmişi
    const calls = db.prepare(`
      SELECT c.id, c.status, c.note, c.follow_up_date, c.created_at, u.full_name as user_name
      FROM calls c
      JOIN users u ON c.user_id = u.id
      WHERE c.organization_id = ?
      ORDER BY c.created_at DESC
    `).all(id);

    return { record, calls };
  });

  // Kayıt Güncelleme & Yeni Görüşme Kaydetme
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const { id } = request.params as { id: string };
    const body = (request.body as any) || {};

    const {
      organization_name,
      country,
      city,
      whatsapp,
      phone,
      website,
      contact_person,
      status,
      note,
      follow_up_date,
      client_updated_at
    } = body;

    const currentRecord = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as any;
    if (!currentRecord) {
      return reply.status(404).send({ error: 'Kayıt bulunamadı' });
    }

    // Yetki kontrolü: Aramacı sadece kendisine atanmış kaydı güncelleyebilir
    if (user.role === 'agent' && currentRecord.assigned_to !== user.id) {
      return reply.status(404).send({ error: 'Kayıt bulunamadı veya yetkiniz yok' });
    }

    // Eşzamanlı düzenleme kontrolü (Optimistic Concurrency Control)
    if (client_updated_at && currentRecord.updated_at !== client_updated_at) {
      return reply.status(409).send({
        error: 'Bu kayıt siz düzenlerken başka biri tarafından değiştirildi.',
        currentRecord
      });
    }

    // Durum (status) doğrulaması
    if (status !== undefined && status !== null && status !== '') {
      if (!['positive', 'negative', 'follow_up'].includes(status)) {
        return reply.status(400).send({ error: 'Geçersiz görüşme sonucu' });
      }
    }

    // Takip tarihi biçim doğrulaması
    if (follow_up_date) {
      if (typeof follow_up_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(follow_up_date)) {
        return reply.status(400).send({ error: 'Takip tarihi YYYY-MM-DD biçiminde olmalıdır' });
      }
    }

    // Kuruluş adını yalnızca yönetici değiştirebilir
    const finalOrgName = (user.role === 'admin' && organization_name)
      ? String(organization_name).trim()
      : currentRecord.organization_name;

    const finalCountry = country !== undefined ? (country ? String(country).trim() : null) : currentRecord.country;
    const finalCity = city !== undefined ? (city ? String(city).trim() : null) : currentRecord.city;
    const finalWhatsapp = whatsapp !== undefined ? (whatsapp ? String(whatsapp).trim() : null) : currentRecord.whatsapp;
    const finalPhone = phone !== undefined ? (phone ? String(phone).trim() : null) : currentRecord.phone;
    // Web sitesi: İstekte website: null ya da boş metin gelirse web sitesi silinsin
    const finalWebsite = website !== undefined ? (website && String(website).trim() ? String(website).trim() : null) : currentRecord.website;
    const finalContact = contact_person !== undefined ? (contact_person ? String(contact_person).trim() : null) : currentRecord.contact_person;

    // Not: İstekte note alanı varsa (boş metin dahil) o değer yazılsın; alan hiç gönderilmemişse mevcut not korunsun
    const finalNote = note !== undefined ? (note ? String(note).trim() : '') : currentRecord.note;

    // Durum ve takip tarihi kontrolü
    const hasNewStatus = Boolean(status && ['positive', 'negative', 'follow_up'].includes(status));
    const finalStatus = hasNewStatus ? status : currentRecord.status;
    let finalFollowUp = follow_up_date !== undefined ? follow_up_date : currentRecord.follow_up_date;

    if (finalStatus === 'follow_up' && (!finalFollowUp || !/^\d{4}-\d{2}-\d{2}$/.test(finalFollowUp))) {
      return reply.status(400).send({ error: 'Tekrar Görüşülecek sonucu için geçerli bir takip tarihi seçilmelidir' });
    }
    if (finalStatus !== 'follow_up') {
      finalFollowUp = null;
    }

    // last_contact alanları: yalnızca istekte geçerli bir status geldiğinde güncellensin
    const today = todayIstanbul();
    const finalLastContactDate = hasNewStatus ? today : currentRecord.last_contact_date;
    const finalLastContactBy = hasNewStatus ? user.id : currentRecord.last_contact_by;

    const nowIso = nowUtcIso();

    const whatsappNormalized = normalizePhoneDigits(finalWhatsapp || finalPhone);

    // Mükerrer numara kontrolü: Başka bir kayıtta zaten bulunan bir numara girilirse 409 dön
    if (whatsappNormalized) {
      const existingPhone = db.prepare('SELECT id FROM organizations WHERE whatsapp_normalized = ? AND id != ?').get(whatsappNormalized, id);
      if (existingPhone) {
        return reply.status(409).send({ error: 'Bu numara başka bir kayıtta mevcut' });
      }
    }

    const searchText = normalizeSearchText(`${finalOrgName} ${finalContact || ''} ${finalCity || ''} ${finalCountry || ''}`);
    const nameSort = createSortKey(finalOrgName);
    const finalNameKey = normalizeSearchText(finalOrgName);

    // Tek transaction içinde organizations güncellemesi ve calls eklemesi
    const saveTx = db.transaction(() => {
      // 1. Organizations tablosunu güncelle
      db.prepare(`
        UPDATE organizations
        SET 
          organization_name = ?,
          country = ?,
          city = ?,
          whatsapp = ?,
          phone = ?,
          website = ?,
          contact_person = ?,
          status = ?,
          note = ?,
          last_contact_date = ?,
          last_contact_by = ?,
          follow_up_date = ?,
          updated_at = ?,
          search_text = ?,
          name_sort = ?,
          whatsapp_normalized = ?,
          name_key = ?
        WHERE id = ?
      `).run(
        finalOrgName,
        finalCountry,
        finalCity,
        finalWhatsapp,
        finalPhone,
        finalWebsite,
        finalContact,
        finalStatus,
        finalNote,
        finalLastContactDate,
        finalLastContactBy,
        finalFollowUp,
        nowIso,
        searchText,
        nameSort,
        whatsappNormalized,
        finalNameKey,
        id
      );

      // 2. Yeni görüşme kaydı ekle (eğer durum seçilmişse)
      if (hasNewStatus) {
        db.prepare(`
          INSERT INTO calls (organization_id, user_id, status, note, follow_up_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, user.id, finalStatus, finalNote || '', finalFollowUp, nowIso);
      }
    });

    saveTx();

    return reply.send({
      success: true,
      message: 'Görüşme ve kayıt bilgileri başarıyla kaydedildi.',
      updated_at: nowIso
    });
  });

  // --- YÖNETİCİ ÖZEL UÇ NOKTALARI ---

  // Manuel Yeni Kayıt Ekle (Yalnızca Yönetici)
  fastify.post('/', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const { organization_name, country, city, whatsapp, phone, website, contact_person, assigned_to } = (request.body as any) || {};

    if (!organization_name || !String(organization_name).trim()) {
      return reply.status(400).send({ error: 'Kuruluş adı zorunludur' });
    }

    // "Manuel Kayıtlar" listesini bul
    let manualList = db.prepare("SELECT id FROM lists WHERE name = 'Manuel Kayıtlar'").get() as { id: number } | undefined;
    if (!manualList) {
      const res = db.prepare("INSERT INTO lists (name, is_open, created_by, created_at) VALUES ('Manuel Kayıtlar', 0, ?, datetime('now'))").run(user.id);
      manualList = { id: Number(res.lastInsertRowid) };
    }

    const cleanOrgName = String(organization_name).trim();
    const cleanCountry = country ? String(country).trim() : null;
    const cleanCity = city ? String(city).trim() : null;
    const cleanWhatsapp = whatsapp ? String(whatsapp).trim() : null;
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanWebsite = website ? String(website).trim() : null;
    const cleanContact = contact_person ? String(contact_person).trim() : null;

    const whatsappNormalized = normalizePhoneDigits(cleanWhatsapp || cleanPhone);
    const searchText = normalizeSearchText(`${cleanOrgName} ${cleanContact || ''} ${cleanCity || ''} ${cleanCountry || ''}`);
    const nameSort = createSortKey(cleanOrgName);
    const nameKey = normalizeSearchText(cleanOrgName);
    const nowIso = nowUtcIso();

    // Tekrar kontrolü
    if (whatsappNormalized) {
      const exists = db.prepare('SELECT id FROM organizations WHERE whatsapp_normalized = ?').get(whatsappNormalized);
      if (exists) {
        return reply.status(400).send({ error: 'Bu telefon/WhatsApp numarasına sahip bir kayıt zaten mevcut' });
      }
    } else {
      const existsName = db.prepare('SELECT id FROM organizations WHERE name_key = ? AND country IS ?').get(nameKey, cleanCountry);
      if (existsName) {
        return reply.status(400).send({ error: 'Bu ada ve ülkeye sahip bir kayıt zaten mevcut' });
      }
    }

    const assignedUserId = assigned_to ? parseInt(assigned_to, 10) : null;
    const assignedAt = assignedUserId ? nowIso : null;

    const result = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, whatsapp, phone, website, contact_person,
        assigned_to, assigned_at, status, note, last_contact_date, last_contact_by,
        follow_up_date, created_at, updated_at, search_text, name_sort, whatsapp_normalized,
        name_key
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, NULL, NULL, NULL, NULL,
        NULL, ?, ?, ?, ?, ?,
        ?
      )
    `).run(
      manualList.id,
      cleanOrgName,
      cleanCountry,
      cleanCity,
      cleanWhatsapp,
      cleanPhone,
      cleanWebsite,
      cleanContact,
      assignedUserId,
      assignedAt,
      nowIso,
      nowIso,
      searchText,
      nameSort,
      whatsappNormalized,
      nameKey
    );

    return reply.status(201).send({
      success: true,
      message: 'Kuruluş başarıyla eklendi',
      id: result.lastInsertRowid
    });
  });

  // Kayıtları Atama / Devretme / Havuza Bırakma (Yalnızca Yönetici)
  fastify.post('/assign', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const { ids, target_user_id } = (request.body as any) || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'Atanacak kayıtlar seçilmelidir' });
    }

    const nowIso = nowUtcIso();
    const assignedUser = target_user_id ? parseInt(target_user_id, 10) : null;
    const assignedAt = assignedUser ? nowIso : null;

    const placeholders = ids.map(() => '?').join(',');
    const updateSql = `
      UPDATE organizations
      SET assigned_to = ?, assigned_at = ?, updated_at = ?
      WHERE id IN (${placeholders})
    `;

    const res = db.prepare(updateSql).run(assignedUser, assignedAt, nowIso, ...ids);

    return reply.send({
      success: true,
      message: assignedUser
        ? `${res.changes} kayıt aramacıya atandı`
        : `${res.changes} kayıt havuza bırakıldı`,
      updated_count: res.changes
    });
  });

  // Tekil Kayıt Sil (Yalnızca Yönetici)
  fastify.delete('/:id', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = db.prepare('DELETE FROM organizations WHERE id = ?').run(id);

    if (res.changes === 0) {
      return reply.status(404).send({ error: 'Kayıt bulunamadı' });
    }

    return reply.send({ success: true, message: 'Kayıt ve görüşme geçmişi silindi' });
  });

  // Toplu Kayıt Sil (Yalnızca Yönetici)
  fastify.post('/bulk-delete', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { ids } = (request.body as any) || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'Silinecek kayıtlar seçilmelidir' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const res = db.prepare(`DELETE FROM organizations WHERE id IN (${placeholders})`).run(...ids);

    return reply.send({
      success: true,
      message: `${res.changes} kayıt başarıyla silindi`,
      deleted_count: res.changes
    });
  });

  // Görüşme Kayıtları Raporu (Yalnızca Yönetici)
  fastify.get('/calls-report', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {

    const query = (request.query as any) || {};
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (query.agent_id) {
      conditions.push('c.user_id = ?');
      params.push(parseInt(query.agent_id, 10));
    }

    if (query.status) {
      conditions.push('c.status = ?');
      params.push(query.status);
    }

    const startDate = query.start_date ? String(query.start_date).trim() : null;
    const endDate = query.end_date ? String(query.end_date).trim() : null;

    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return reply.status(400).send({ error: 'Başlangıç tarihi YYYY-MM-DD formatında olmalıdır' });
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return reply.status(400).send({ error: 'Bitiş tarihi YYYY-MM-DD formatında olmalıdır' });
    }

    if (startDate && endDate) {
      const [startUtc, endUtc] = istanbulDayRangeUtc(startDate, endDate);
      conditions.push('c.created_at >= ? AND c.created_at < ?');
      params.push(startUtc, endUtc);
    } else if (startDate) {
      const [startUtc] = istanbulDayRangeUtc(startDate, startDate);
      conditions.push('c.created_at >= ?');
      params.push(startUtc);
    } else if (endDate) {
      const [, endUtc] = istanbulDayRangeUtc(endDate, endDate);
      conditions.push('c.created_at < ?');
      params.push(endUtc);
    }

    if (query.list_id) {
      conditions.push('o.list_id = ?');
      params.push(parseInt(query.list_id, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) as total 
      FROM calls c
      JOIN organizations o ON c.organization_id = o.id
      ${whereClause}
    `;
    const totalCount = (db.prepare(countSql).get(...params) as { total: number }).total;

    const dataSql = `
      SELECT 
        c.id, c.status, c.note, c.follow_up_date, c.created_at,
        u.full_name as agent_name,
        o.organization_name, o.country, o.city, o.phone, o.whatsapp,
        l.name as list_name
      FROM calls c
      JOIN users u ON c.user_id = u.id
      JOIN organizations o ON c.organization_id = o.id
      LEFT JOIN lists l ON o.list_id = l.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const calls = db.prepare(dataSql).all(...params, limit, offset);

    return {
      calls,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit) || 1
      }
    };
  });

  // Özet Personel Performansı (Yalnızca Yönetici)
  fastify.get('/performance-summary', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {

    const query = (request.query as any) || {};
    const startDate = String(query.start_date || todayIstanbul()).trim();
    const endDate = String(query.end_date || todayIstanbul()).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return reply.status(400).send({ error: 'Tarih parametreleri YYYY-MM-DD biçiminde olmalıdır' });
    }

    const [startUtc, endUtc] = istanbulDayRangeUtc(startDate, endDate);

    // Tüm aktif/pasif aramacılar
    const agents = db.prepare(`
      SELECT id, username, full_name, active, last_login_at
      FROM users
      WHERE role = 'agent'
      ORDER BY full_name ASC
    `).all() as any[];

    const summary = agents.map(agent => {
      // Belirtilen tarih aralığındaki görüşmeler
      const callStats = db.prepare(`
        SELECT 
          COUNT(*) as total_calls,
          SUM(CASE WHEN status = 'positive' THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN status = 'negative' THEN 1 ELSE 0 END) as negative_count,
          SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) as followup_count,
          MAX(created_at) as last_call_at
        FROM calls
        WHERE user_id = ? AND created_at >= ? AND created_at < ?
      `).get(agent.id, startUtc, endUtc) as any;

      // Üzerindeki görüşülmemiş kayıt sayısı
      const uncontacted = db.prepare(`
        SELECT COUNT(*) as count
        FROM organizations
        WHERE assigned_to = ? AND status IS NULL
      `).get(agent.id) as any;

      return {
        id: agent.id,
        full_name: agent.full_name,
        username: agent.username,
        active: agent.active,
        total_calls: callStats.total_calls || 0,
        positive_count: callStats.positive_count || 0,
        negative_count: callStats.negative_count || 0,
        followup_count: callStats.followup_count || 0,
        uncontacted_count: uncontacted.count || 0,
        last_activity: callStats.last_call_at || agent.last_login_at || null
      };
    });

    return {
      start_date: startDate,
      end_date: endDate,
      summary
    };
  });
};
