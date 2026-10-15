import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { getDatabase } from '../db.js';
import { type User } from '../auth.js';
import { escapeHtml, escapeHtmlWithLineBreaks } from '../text.js';
import { todayIstanbul, formatDateTimeIstanbul } from '../time.js';
import { requireUser } from '../guards.js';
import { buildOrgFilter } from '../filter.js';

function formatWebsiteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase();

  // Oturum kontrolü
  fastify.addHook('preHandler', requireUser);

  // HTML Rapor Dışa Aktar (Stream / Akış Tabanlı)
  fastify.get('/records', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User;
    const query = (request.query as any) || {};

    const { whereClause, params, labels: activeFiltersList } = buildOrgFilter(user, query);

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

    // Geri basınç (backpressure) destekli gerçek akış üretimi (generator)
    function* generateHtml() {
      yield `<!DOCTYPE html>
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
    <tbody>\n`;

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

        const href = formatWebsiteUrl(row.website);
        const websiteLink = href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.website)}</a>`
          : '-';

        yield `      <tr>
        <td>${rowIdx++}</td>
        <td><strong>${escapeHtml(row.organization_name)}</strong></td>
        <td>${escapeHtml(row.country || '-')}${row.city ? ` / ${escapeHtml(row.city)}` : ''}</td>
        <td>${websiteLink}</td>
        <td>${escapeHtml(row.whatsapp || '-')}</td>
        <td>${escapeHtml(row.phone || '-')}</td>
        <td>${escapeHtml(row.contact_person || '-')}</td>
        <td>${statusLabel}</td>
        <td>${escapeHtml(row.last_contact_date || '-')}</td>
        <td>${escapeHtml(row.follow_up_date || '-')}</td>
        ${user.role === 'admin' ? `<td>${escapeHtml(row.assigned_name || 'Havuzda')}</td>` : ''}
        <td>${escapeHtmlWithLineBreaks(row.note || '-')}</td>
      </tr>\n`;
      }

      yield `    </tbody>
  </table>
</body>
</html>\n`;
    }

    const stream = Readable.from(generateHtml());
    return reply.send(stream);
  });
};
