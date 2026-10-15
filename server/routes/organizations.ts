import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db.js';
import { validateSession, type User } from '../auth.js';
import {
  normalizeSearchText,
  createSortKey,
  normalizePhoneDigits,
  isValidInternationalPhone
} from '../text.js';
import { todayIstanbul, nowUtcIso } from '../time.js';

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase();

  // Oturum Doğrulama Ön Kancası
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies.session_id;
    const user = validateSession(db, rawToken);

    if (!user) {
      return reply.status(401).send({ error: 'Oturum açmanız gerekiyor' });
    }
    (request as any).user = user;
  });

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

    let countryQuery = 'SELECT DISTINCT country FROM organizations WHERE country IS NOT NULL AND country != ""';
    let cityQuery = 'SELECT DISTINCT city FROM organizations WHERE city IS NOT NULL AND city != ""';

    if (user.role === 'agent') {
      countryQuery += ` AND assigned_to = ${user.id}`;
      cityQuery += ` AND assigned_to = ${user.id}`;
    }

    countryQuery += ' ORDER BY country ASC';
    cityQuery += ' ORDER BY city ASC';

    const countries = db.prepare(countryQuery).all().map((r: any) => r.country);
    const cities = db.prepare(cityQuery).all().map((r: any) => r.city);

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
    const uncontactedLimit = parseInt(limitSetting?.value || '1', 10);

    const uncontacted = db.prepare(`
      SELECT id, organization_name, country, city, whatsapp, phone, website, contact_person, status, note, updated_at
      FROM organizations
      WHERE assigned_to = ? AND status IS NULL
      ORDER BY id ASC
      LIMIT 1
    `).get(user.id) as any;

    if (uncontacted) {
      return reply.send({
        assigned: false,
        message: 'Üzerinizde henüz görüşülmemiş bir kayıt bulunmaktadır. Önce bu görüşmeyi tamamlayınız.',
        record: uncontacted
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

    const conditions: string[] = [];
    const params: any[] = [];

    // Yetki kuralı: Aramacı DAİMA sadece kendi kayıtlarını görür!
    if (user.role === 'agent') {
      conditions.push('o.assigned_to = ?');
      params.push(user.id);
    } else {
      // Yönetici filtreleri
      if (query.agent_id) {
        if (query.agent_id === 'pool') {
          conditions.push('o.assigned_to IS NULL');
        } else {
          conditions.push('o.assigned_to = ?');
          params.push(parseInt(query.agent_id, 10));
        }
      }
      if (query.list_id) {
        conditions.push('o.list_id = ?');
        params.push(parseInt(query.list_id, 10));
      }
    }

    // Arama filtresi (search_text)
    if (query.search) {
      const cleanSearch = normalizeSearchText(String(query.search));
      if (cleanSearch) {
        conditions.push('o.search_text LIKE ?');
        params.push(`%${cleanSearch}%`);
      }
    }

    // Ülke ve Şehir
    if (query.country) {
      conditions.push('o.country = ?');
      params.push(String(query.country));
    }
    if (query.city) {
      conditions.push('o.city = ?');
      params.push(String(query.city));
    }

    // Durum
    if (query.status) {
      if (query.status === 'uncontacted') {
        conditions.push('o.status IS NULL');
      } else if (['positive', 'negative', 'follow_up'].includes(query.status)) {
        conditions.push('o.status = ?');
        params.push(query.status);
      }
    }

    // Bugün ve Geciken (follow_up)
    if (query.due === '1' || query.due === 'true') {
      conditions.push('o.status = "follow_up" AND o.follow_up_date <= ?');
      params.push(todayIstanbul());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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

    // Kuruluş adını yalnızca yönetici değiştirebilir
    const finalOrgName = (user.role === 'admin' && organization_name)
      ? String(organization_name).trim()
      : currentRecord.organization_name;

    const finalCountry = country != null ? String(country).trim() : currentRecord.country;
    const finalCity = city != null ? String(city).trim() : currentRecord.city;
    const finalWhatsapp = whatsapp != null ? String(whatsapp).trim() : currentRecord.whatsapp;
    const finalPhone = phone != null ? String(phone).trim() : currentRecord.phone;
    const finalWebsite = website != null ? String(website).trim() : currentRecord.website;
    const finalContact = contact_person != null ? String(contact_person).trim() : currentRecord.contact_person;

    // Durum ve takip tarihi kontrolü
    const finalStatus = status || currentRecord.status;
    let finalFollowUp = follow_up_date || null;
    if (finalStatus === 'follow_up' && !finalFollowUp) {
      return reply.status(400).send({ error: 'Tekrar Görüşülecek sonucu için takip tarihi seçilmelidir' });
    }
    if (finalStatus !== 'follow_up') {
      finalFollowUp = null;
    }

    const today = todayIstanbul();
    const nowIso = nowUtcIso();

    const whatsappNormalized = normalizePhoneDigits(finalWhatsapp || finalPhone);
    const searchText = normalizeSearchText(`${finalOrgName} ${finalContact || ''} ${finalCity || ''} ${finalCountry || ''}`);
    const nameSort = createSortKey(finalOrgName);

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
          whatsapp_normalized = ?
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
        note || currentRecord.note,
        today,
        user.id,
        finalFollowUp,
        nowIso,
        searchText,
        nameSort,
        whatsappNormalized,
        id
      );

      // 2. Yeni görüşme kaydı ekle (eğer durum seçilmişse veya yeni bir not girilmişse)
      if (status) {
        db.prepare(`
          INSERT INTO calls (organization_id, user_id, status, note, follow_up_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, user.id, finalStatus, note || '', finalFollowUp, nowIso);
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
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Yalnızca yöneticiler yeni kayıt ekleyebilir' });
    }

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
    const nowIso = nowUtcIso();

    // Tekrar kontrolü
    if (whatsappNormalized) {
      const exists = db.prepare('SELECT id FROM organizations WHERE whatsapp_normalized = ?').get(whatsappNormalized);
      if (exists) {
        return reply.status(400).send({ error: 'Bu telefon/WhatsApp numarasına sahip bir kayıt zaten mevcut' });
      }
    }

    const assignedUserId = assigned_to ? parseInt(assigned_to, 10) : null;
    const assignedAt = assignedUserId ? nowIso : null;

    const result = db.prepare(`
      INSERT INTO organizations (
        list_id, organization_name, country, city, whatsapp, phone, website, contact_person,
        assigned_to, assigned_at, status, note, last_contact_date, last_contact_by,
        follow_up_date, created_at, updated_at, search_text, name_sort, whatsapp_normalized
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, NULL, NULL, NULL, NULL,
        NULL, ?, ?, ?, ?, ?
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
      whatsappNormalized
    );

    return reply.status(201).send({
      success: true,
      message: 'Kuruluş başarıyla eklendi',
      id: result.lastInsertRowid
    });
  });

  // Kayıtları Atama / Devretme / Havuza Bırakma (Yalnızca Yönetici)
  fastify.post('/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Yalnızca yöneticiler atama yapabilir' });
    }

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
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Yalnızca yöneticiler kayıt silebilir' });
    }

    const { id } = request.params as { id: string };
    const res = db.prepare('DELETE FROM organizations WHERE id = ?').run(id);

    if (res.changes === 0) {
      return reply.status(404).send({ error: 'Kayıt bulunamadı' });
    }

    return reply.send({ success: true, message: 'Kayıt ve görüşme geçmişi silindi' });
  });

  // Toplu Kayıt Sil (Yalnızca Yönetici)
  fastify.post('/bulk-delete', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Yalnızca yöneticiler toplu silme yapabilir' });
    }

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
  fastify.get('/calls-report', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Yalnızca yöneticiler görüşme geçmişini görebilir' });
    }

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

    if (query.start_date) {
      conditions.push('c.created_at >= ?');
      params.push(`${query.start_date}T00:00:00.000Z`);
    }

    if (query.end_date) {
      conditions.push('c.created_at <= ?');
      params.push(`${query.end_date}T23:59:59.999Z`);
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
  fastify.get('/performance-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Yalnızca yöneticiler performans özetini görebilir' });
    }

    const query = (request.query as any) || {};
    const startDate = query.start_date || todayIstanbul();
    const endDate = query.end_date || todayIstanbul();

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
        WHERE user_id = ? AND date(created_at) >= ? AND date(created_at) <= ?
      `).get(agent.id, startDate, endDate) as any;

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
