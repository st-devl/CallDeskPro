import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { getDatabase } from '../db.js';
import { validateSession, type User } from '../auth.js';
import { escapeHtml, escapeHtmlWithLineBreaks, normalizeSearchText } from '../text.js';
import { todayIstanbul, formatDateTimeIstanbul } from '../time.js';

import { requireUser } from '../guards.js';

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase();

  // Oturum kontrolü
  fastify.addHook('preHandler', requireUser);

  // HTML Rapor Dışa Aktar (Stream / Akış Tabanlı)
  fastify.get('/records', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const query = (request.query as any) || {};

    const conditions: string[] = [];
    const params: any[] = [];
    const activeFiltersList: string[] = [];

    // Yetki: Aramacı yalnızca kendi kayıtlarını dışa aktarabilir!
    if (user.role === 'agent') {
      conditions.push('o.assigned_to = ?');
      params.push(user.id);
      activeFiltersList.push(`Aramacı: ${user.full_name}`);
    } else {
      if (query.agent_id) {
        if (query.agent_id === 'pool') {
          conditions.push('o.assigned_to IS NULL');
          activeFiltersList.push('Aramacı: Havuzda Bekleyenler');
        } else {
          conditions.push('o.assigned_to = ?');
          params.push(parseInt(query.agent_id, 10));
          const agentUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(query.agent_id) as any;
          activeFiltersList.push(`Aramacı: ${agentUser?.full_name || query.agent_id}`);
        }
      }
      if (query.list_id) {
        conditions.push('o.list_id = ?');
        params.push(parseInt(query.list_id, 10));
        const listRow = db.prepare('SELECT name FROM lists WHERE id = ?').get(query.list_id) as any;
        activeFiltersList.push(`Liste: ${listRow?.name || query.list_id}`);
      }
    }

    if (query.search) {
      const cleanSearch = normalizeSearchText(String(query.search));
      if (cleanSearch) {
        conditions.push('o.search_text LIKE ?');
        params.push(`%${cleanSearch}%`);
        activeFiltersList.push(`Arama: "${query.search}"`);
      }
    }

    if (query.country) {
      conditions.push('o.country = ?');
      params.push(String(query.country));
      activeFiltersList.push(`Ülke: ${query.country}`);
    }

    if (query.city) {
      conditions.push('o.city = ?');
      params.push(String(query.city));
      activeFiltersList.push(`Şehir: ${query.city}`);
    }

    if (query.status) {
      if (query.status === 'uncontacted') {
        conditions.push('o.status IS NULL');
        activeFiltersList.push('Sonuç: Görüşülmedi');
      } else if (['positive', 'negative', 'follow_up'].includes(query.status)) {
        conditions.push('o.status = ?');
        params.push(query.status);
        const statusMap: Record<string, string> = {
          positive: 'Olumlu',
          negative: 'Olumsuz',
          follow_up: 'Tekrar Görüşülecek'
        };
        activeFiltersList.push(`Sonuç: ${statusMap[query.status]}`);
      }
    }

    if (query.due === '1' || query.due === 'true') {
      conditions.push("o.status = 'follow_up' AND o.follow_up_date <= ?");
      params.push(todayIstanbul());
      activeFiltersList.push('Filtre: Bugün ve Geciken');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM organizations o ${whereClause}`;
    const totalCount = (db.prepare(countSql).get(...params) as { total: number }).total;

    const querySql = `
      SELECT 
        o.id, o.organization_name, o.country, o.city,
        o.website, o.whatsapp, o.phone, o.contact_person, o.status, o.note,
        o.last_contact_date, o.follow_up_date,
        u_assigned.full_name as assigned_name,
        l.name as list_name
      FROM organizations o
      LEFT JOIN users u_assigned ON o.assigned_to = u_assigned.id
      LEFT JOIN lists l ON o.list_id = l.id
      ${whereClause}
      ORDER BY o.name_sort ASC
    `;

    const stmt = db.prepare(querySql);
    const iterator = stmt.iterate(...params);

    const today = todayIstanbul();
    const reportDateStr = formatDateTimeIstanbul(new Date().toISOString());
    const filename = `call-center-rapor-${today}.html`;

    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream ile HTML üretimi
    const stream = new Readable({
      read() {}
    });

    // HTML Başlığı ve CSS Stilleri
    stream.push(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Call Center Raporu - ${today}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; color: #0b1c30; margin: 20px; line-height: 1.4; }
    .header { margin-bottom: 20px; border-bottom: 2px solid #091426; padding-bottom: 15px; }
    .title { font-size: 20px; font-weight: 700; margin: 0 0 5px 0; color: #091426; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; font-size: 11px; }
    .meta-item strong { color: #64748b; }
    .filters-box { margin-top: 10px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th { background: #f8fafc; color: #475569; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px; }
    td { padding: 6px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
    tr:nth-child(even) { background-color: #f8fafc; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .badge-positive { background: #ecfdf5; color: #059669; }
    .badge-negative { background: #fef2f2; color: #dc2626; }
    .badge-followup { background: #fffbeb; color: #d97706; }
    .badge-neutral { background: #f1f5f9; color: #64748b; }
    @media print {
      body { margin: 0; font-size: 10px; }
      th, td { padding: 4px 6px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">CALL CENTER RAPORU</h1>
    <div class="meta-grid">
      <div class="meta-item"><strong>Rapor Tarihi:</strong> ${reportDateStr}</div>
      <div class="meta-item"><strong>Raporu Alan:</strong> ${escapeHtml(user.full_name)} (${user.role === 'admin' ? 'Yönetici' : 'Aramacı'})</div>
      <div class="meta-item"><strong>Toplam Kayıt:</strong> ${totalCount}</div>
      <div class="meta-item"><strong>Saat Dilimi:</strong> Europe/Istanbul</div>
    </div>
    <div class="filters-box">
      <strong>Aktif Filtreler:</strong> ${activeFiltersList.length > 0 ? escapeHtml(activeFiltersList.join(' | ')) : 'Tüm Kayıtlar'}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th>Kuruluş Adı</th>
        <th>Ülke / Şehir</th>
        <th>Web Sitesi</th>
        <th>WhatsApp</th>
        <th>Telefon</th>
        <th>Görüşülen Kişi</th>
        <th>Sonuç</th>
        <th>Son Görüşme</th>
        <th>Tekrar Görüşme</th>
        ${user.role === 'admin' ? '<th>Atanan Aramacı</th>' : ''}
        <th style="width: 20%;">Not</th>
      </tr>
    </thead>
    <tbody>
`);

    let rowIdx = 1;
    for (const row of iterator as any) {
      const statusLabel =
        row.status === 'positive'
          ? '<span class="badge badge-positive">Olumlu</span>'
          : row.status === 'negative'
          ? '<span class="badge badge-negative">Olumsuz</span>'
          : row.status === 'follow_up'
          ? '<span class="badge badge-followup">Tekrar Görüşülecek</span>'
          : '<span class="badge badge-neutral">Görüşülmedi</span>';

      const line = `      <tr>
        <td>${rowIdx++}</td>
        <td><strong>${escapeHtml(row.organization_name)}</strong></td>
        <td>${escapeHtml(row.country || '-')}${row.city ? ` / ${escapeHtml(row.city)}` : ''}</td>
        <td>${row.website ? `<a href="${escapeHtml(row.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.website)}</a>` : '-'}</td>
        <td>${escapeHtml(row.whatsapp || '-')}</td>
        <td>${escapeHtml(row.phone || '-')}</td>
        <td>${escapeHtml(row.contact_person || '-')}</td>
        <td>${statusLabel}</td>
        <td>${escapeHtml(row.last_contact_date || '-')}</td>
        <td>${escapeHtml(row.follow_up_date || '-')}</td>
        ${user.role === 'admin' ? `<td>${escapeHtml(row.assigned_name || 'Havuzda')}</td>` : ''}
        <td>${escapeHtmlWithLineBreaks(row.note || '-')}</td>
      </tr>\n`;

      stream.push(line);
    }

    stream.push(`    </tbody>
  </table>
</body>
</html>`);
    stream.push(null);

    return reply.send(stream);
  });
};
