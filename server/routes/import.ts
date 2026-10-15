import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';
import Papa from 'papaparse';
import { getDatabase } from '../db.js';
import { validateSession } from '../auth.js';
import {
  normalizeSearchText,
  createSortKey,
  normalizePhoneDigits,
  isValidInternationalPhone
} from '../text.js';
import { nowUtcIso } from '../time.js';

interface PendingImport {
  listName: string;
  filename: string;
  buffer: Buffer;
  isXlsx: boolean;
  headers: string[];
  previewRows: string[][];
  suggestedMapping: Record<string, number>;
  expiresAt: number;
}

// 15 dakika süreli bellek içi geçici dosya deposu
const pendingImports = new Map<string, PendingImport>();

// 1 dakikada bir süresi geçmiş önizlemeleri temizle
setInterval(() => {
  const now = Date.now();
  for (const [token, item] of pendingImports.entries()) {
    if (now > item.expiresAt) {
      pendingImports.delete(token);
    }
  }
}, 60 * 1000);

// Otomatik sütun eşleştirme terimleri
const FIELD_KEYWORDS: Record<string, string[]> = {
  organization_name: [
    'organization', 'organization name', 'ngo', 'ngo name', 'name',
    'company', 'kuruluş', 'kurulus', 'kuruluş adı', 'kurulus adi',
    'dernek', 'dernek adı', 'dernek adi', 'şirket', 'sirket', 'firma', 'ad', 'unvan', 'ünvan'
  ],
  country: ['country', 'ülke', 'ulke'],
  city: ['city', 'şehir', 'sehir', 'il'],
  whatsapp: ['whatsapp', 'whatsapp number', 'wa', 'whatsapp no', 'wp'],
  phone: ['phone', 'telephone', 'tel', 'telefon', 'phone number', 'gsm', 'cep'],
  website: ['website', 'web', 'web sitesi', 'site', 'url', 'web adresi', 'web_adresi', 'internet sitesi'],
  contact_person: [
    'contact', 'contact person', 'contact name', 'yetkili',
    'görüşülen kişi', 'gorusulen kisi', 'ilgili kişi', 'ilgili kisi', 'kişi', 'kisi'
  ]
};

function autoMapColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const normalizedHeaders = headers.map(h => normalizeSearchText(h));

  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (keywords.some(kw => header === kw || header.includes(kw))) {
        mapping[field] = i;
        break;
      }
    }
  }
  return mapping;
}

export const importRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase();

  // Yalnızca admin erişebilir
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies.session_id;
    const user = validateSession(db, rawToken);

    if (!user) {
      return reply.status(401).send({ error: 'Oturum açmanız gerekiyor' });
    }
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Bu işlem için yönetici yetkisi gereklidir' });
    }
    (request as any).user = user;
  });

  // Ham dosya yükleme ve önizleme (10 MB gövde sınırı)
  fastify.post('/upload', {
    config: {
      rawBody: true
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const filenameHeader = request.headers['x-filename'];
    const listNameHeader = request.headers['x-list-name'];

    const filename = filenameHeader ? decodeURIComponent(String(filenameHeader)) : 'liste.csv';
    const listName = listNameHeader ? decodeURIComponent(String(listNameHeader)).trim() : '';

    if (!listName) {
      return reply.status(400).send({ error: 'Liste adı zorunludur' });
    }

    const buffer = request.body as Buffer;
    if (!buffer || buffer.length === 0) {
      return reply.status(400).send({ error: 'Dosya içeriği boş olamaz' });
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Dosya boyutu 10 MB sınırını aşamaz' });
    }

    const lowerName = filename.toLowerCase();
    const isXlsx = lowerName.endsWith('.xlsx');
    const isCsv = lowerName.endsWith('.csv');

    if (!isXlsx && !isCsv) {
      return reply.status(400).send({ error: 'Yalnızca .xlsx veya .csv dosyaları yüklenebilir' });
    }

    let headers: string[] = [];
    let previewRows: string[][] = [];

    if (isXlsx) {
      // XLSX ZIP İmzası Kontrolü (PK\x03\x04)
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
        return reply.status(400).send({ error: 'Geçersiz XLSX dosyası (ZIP formatı doğrulanamadı)' });
      }

      try {
        const rows = await readXlsxFile(buffer);
        if (rows.length === 0) {
          return reply.status(400).send({ error: 'Excel dosyası boş' });
        }

        headers = (rows[0] || []).map(cell => (cell == null ? '' : String(cell).trim()));
        for (let i = 1; i < Math.min(rows.length, 11); i++) {
          const row = (rows[i] || []).map(cell => {
            if (cell == null) return '';
            // Sayı formatındaki telefonların bozulmasını önleme (.0 temizleme)
            let str = String(cell).trim();
            if (str.endsWith('.0')) str = str.substring(0, str.length - 2);
            return str;
          });
          previewRows.push(row);
        }
      } catch (err: any) {
        return reply.status(400).send({ error: `Excel dosyası okunamadı: ${err.message}` });
      }
    } else {
      // CSV okuma: UTF-8 veya Windows-1254 çözümü
      let csvText = '';
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        csvText = utf8Decoder.decode(buffer);
      } catch {
        const win1254Decoder = new TextDecoder('windows-1254');
        csvText = win1254Decoder.decode(buffer);
      }

      // UTF-8 BOM temizle
      if (csvText.charCodeAt(0) === 0xfeff) {
        csvText = csvText.substring(1);
      }

      const parsed = Papa.parse<string[]>(csvText, {
        preview: 11,
        skipEmptyLines: true
      });

      if (!parsed.data || parsed.data.length === 0) {
        return reply.status(400).send({ error: 'CSV dosyası boş veya ayrıştırılamadı' });
      }

      headers = (parsed.data[0] || []).map(h => String(h).trim());
      previewRows = parsed.data.slice(1, 11);
    }

    const suggestedMapping = autoMapColumns(headers);

    const importToken = crypto.randomBytes(16).toString('hex');
    pendingImports.set(importToken, {
      listName,
      filename,
      buffer,
      isXlsx,
      headers,
      previewRows,
      suggestedMapping,
      expiresAt: Date.now() + 15 * 60 * 1000 // 15 dakika
    });

    return reply.send({
      token: importToken,
      filename,
      listName,
      headers,
      previewRows,
      suggestedMapping
    });
  });

  // Eşleştirilmiş sütunları onaylayıp içe aktarma
  fastify.post('/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token, listName, mapping } = (request.body as any) || {};

    if (!token || !pendingImports.has(token)) {
      return reply.status(400).send({ error: 'Önizleme oturumu bulunamadı veya süresi doldu' });
    }

    const pending = pendingImports.get(token)!;
    pendingImports.delete(token); // Tek kullanım

    const orgNameIdx = mapping.organization_name;
    if (orgNameIdx == null || orgNameIdx < 0) {
      return reply.status(400).send({ error: 'Kuruluş Adı sütunu eşleştirilmelidir' });
    }

    const finalListName = (listName || pending.listName || 'Yeni Liste').trim();
    const currentUser = (request as any).user;
    const createdAt = nowUtcIso();

    // Tüm satırları oku
    let allRows: string[][] = [];

    if (pending.isXlsx) {
      const rows = await readXlsxFile(pending.buffer);
      allRows = rows.slice(1).map(r => r.map(c => (c == null ? '' : String(c).trim())));
    } else {
      let csvText = '';
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        csvText = utf8Decoder.decode(pending.buffer);
      } catch {
        const win1254Decoder = new TextDecoder('windows-1254');
        csvText = win1254Decoder.decode(pending.buffer);
      }
      if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.substring(1);

      const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
      allRows = parsed.data.slice(1);
    }

    // Veritabanına transaction ile aktar
    let addedCount = 0;
    let duplicateCount = 0;
    const errors: { row: number; reason: string }[] = [];

    // Dosya içi ve DB bazlı tekrar önleme kümeleri
    const seenPhonesInBatch = new Set<string>();
    const seenNamesInBatch = new Set<string>();

    const insertTx = db.transaction(() => {
      // 1. Yeni Listeyi oluştur
      const listResult = db.prepare(`
        INSERT INTO lists (name, is_open, created_by, created_at)
        VALUES (?, 1, ?, ?)
      `).run(finalListName, currentUser.id, createdAt);

      const listId = listResult.lastInsertRowid;

      const insertOrgStmt = db.prepare(`
        INSERT INTO organizations (
          list_id, organization_name, country, city, whatsapp, phone, website, contact_person,
          assigned_to, assigned_at, status, note, last_contact_date, last_contact_by,
          follow_up_date, created_at, updated_at, search_text, name_sort, whatsapp_normalized
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          NULL, NULL, NULL, NULL, NULL, NULL,
          NULL, ?, ?, ?, ?, ?
        )
      `);

      const checkPhoneStmt = db.prepare(`
        SELECT id FROM organizations WHERE whatsapp_normalized = ?
      `);

      const checkNameCountryStmt = db.prepare(`
        SELECT id FROM organizations WHERE search_text = ? AND (country = ? OR country IS NULL)
      `);

      for (let i = 0; i < allRows.length; i++) {
        const rowNumber = i + 2; // 1 başlık, 1-indexli satır
        const row = allRows[i];

        const rawOrgName = (row[orgNameIdx] || '').trim();
        if (!rawOrgName) {
          if (errors.length < 200) {
            errors.push({ row: rowNumber, reason: 'Kuruluş adı boş' });
          }
          continue;
        }

        const country = mapping.country != null && row[mapping.country] ? String(row[mapping.country]).trim() : null;
        const city = mapping.city != null && row[mapping.city] ? String(row[mapping.city]).trim() : null;
        let rawWhatsapp = mapping.whatsapp != null && row[mapping.whatsapp] ? String(row[mapping.whatsapp]).trim() : null;
        let rawPhone = mapping.phone != null && row[mapping.phone] ? String(row[mapping.phone]).trim() : null;
        const website = mapping.website != null && row[mapping.website] ? String(row[mapping.website]).trim() : null;
        const contactPerson = mapping.contact_person != null && row[mapping.contact_person] ? String(row[mapping.contact_person]).trim() : null;

        // Bilimsel gösterim kontrolü (örn. 9.05E+11)
        if (rawWhatsapp && /[0-9]+[eE]\+[0-9]+/.test(rawWhatsapp)) {
          if (errors.length < 200) errors.push({ row: rowNumber, reason: `Bozuk bilimsel gösterim WhatsApp: ${rawWhatsapp}` });
          continue;
        }
        if (rawPhone && /[0-9]+[eE]\+[0-9]+/.test(rawPhone)) {
          if (errors.length < 200) errors.push({ row: rowNumber, reason: `Bozuk bilimsel gösterim Telefon: ${rawPhone}` });
          continue;
        }

        // WhatsApp normalizasyonu
        const whatsappNormalized = normalizePhoneDigits(rawWhatsapp || rawPhone);

        // Tekrar kontrolü (Tekrar tespit edilirse atlanır)
        if (whatsappNormalized) {
          if (seenPhonesInBatch.has(whatsappNormalized)) {
            duplicateCount++;
            continue;
          }
          const existing = checkPhoneStmt.get(whatsappNormalized);
          if (existing) {
            duplicateCount++;
            continue;
          }
          seenPhonesInBatch.add(whatsappNormalized);
        } else {
          // Telefon yoksa normalize ad + ülke kontrolü
          const nameCountryKey = `${normalizeSearchText(rawOrgName)}|${country || ''}`;
          if (seenNamesInBatch.has(nameCountryKey)) {
            duplicateCount++;
            continue;
          }
          const existingName = checkNameCountryStmt.get(normalizeSearchText(rawOrgName), country);
          if (existingName) {
            duplicateCount++;
            continue;
          }
          seenNamesInBatch.add(nameCountryKey);
        }

        // Arama ve sıralama anahtarları
        const searchText = normalizeSearchText(`${rawOrgName} ${contactPerson || ''} ${city || ''} ${country || ''}`);
        const nameSort = createSortKey(rawOrgName);

        insertOrgStmt.run(
          listId,
          rawOrgName,
          country,
          city,
          rawWhatsapp,
          rawPhone,
          website,
          contactPerson,
          createdAt,
          createdAt,
          searchText,
          nameSort,
          whatsappNormalized
        );
        addedCount++;
      }

      return { listId, addedCount, duplicateCount, errors };
    });

    const result = insertTx();

    // İçe aktarma tamamlandığında bellek sızıntısını önlemek için tamponu hemen temizle
    pendingImports.delete(token);

    return reply.send({
      success: true,
      message: `${result.addedCount} kayıt başarıyla içe aktarıldı.`,
      list_id: result.listId,
      added_count: result.addedCount,
      duplicate_count: result.duplicateCount,
      error_count: result.errors.length,
      errors: result.errors
    });
  });

  // Listeleri listeleme (Yönetici)
  fastify.get('/lists', async () => {
    const lists = db.prepare(`
      SELECT 
        l.id, l.name, l.is_open, l.created_at,
        u.full_name as creator_name,
        COUNT(o.id) as total_count,
        SUM(CASE WHEN o.assigned_to IS NULL THEN 1 ELSE 0 END) as pool_count,
        SUM(CASE WHEN o.status IS NOT NULL THEN 1 ELSE 0 END) as contacted_count
      FROM lists l
      LEFT JOIN users u ON l.created_by = u.id
      LEFT JOIN organizations o ON l.id = o.list_id
      GROUP BY l.id
      ORDER BY l.id DESC
    `).all();

    return { lists };
  });

  // Liste durumunu değiştir (Açık / Kapalı)
  fastify.post('/lists/:id/toggle-open', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const list = db.prepare('SELECT id, is_open FROM lists WHERE id = ?').get(id) as { id: number; is_open: number } | undefined;

    if (!list) return reply.status(404).send({ error: 'Liste bulunamadı' });

    const newIsOpen = list.is_open === 1 ? 0 : 1;
    db.prepare('UPDATE lists SET is_open = ? WHERE id = ?').run(newIsOpen, id);

    return reply.send({ success: true, is_open: newIsOpen });
  });

  // Liste sil (onaylı)
  fastify.delete('/lists/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const list = db.prepare('SELECT id, name FROM lists WHERE id = ?').get(id) as { id: number; name: string } | undefined;

    if (!list) return reply.status(404).send({ error: 'Liste bulunamadı' });
    if (list.name === 'Manuel Kayıtlar') {
      return reply.status(400).send({ error: 'Manuel Kayıtlar listesi silinemez' });
    }

    db.prepare('DELETE FROM lists WHERE id = ?').run(id);
    return reply.send({ success: true, message: `"${list.name}" listesi ve bağlı kayıtları silindi` });
  });
};
