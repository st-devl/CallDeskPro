import type { User } from './auth.js';
import { getDatabase } from './db.js';
import { normalizeSearchText } from './text.js';
import { todayIstanbul } from './time.js';

export interface OrgFilterResult {
  whereClause: string;
  params: any[];
  labels: string[];
}

/**
 * Kuruluş listeleme ve HTML dışa aktarma için ortak WHERE koşulu ve etiket üretici.
 * Aramacının yalnızca kendi kayıtlarını görme kuralı bu fonksiyonun içinde garanti edilir.
 */
export function buildOrgFilter(user: User, query: Record<string, any>): OrgFilterResult {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any[] = [];
  const labels: string[] = [];

  // Yetki: Aramacı DAİMA yalnızca kendi kayıtlarını görür ve dışa aktarabilir!
  if (user.role === 'agent') {
    conditions.push('o.assigned_to = ?');
    params.push(user.id);
    labels.push(`Aramacı: ${user.full_name}`);
  } else {
    // Yönetici filtreleri
    if (query.agent_id) {
      if (query.agent_id === 'pool') {
        conditions.push('o.assigned_to IS NULL');
        labels.push('Aramacı: Havuzda Bekleyenler');
      } else {
        const agentId = parseInt(query.agent_id, 10);
        conditions.push('o.assigned_to = ?');
        params.push(agentId);
        const agentUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(agentId) as { full_name: string } | undefined;
        labels.push(`Aramacı: ${agentUser?.full_name || query.agent_id}`);
      }
    }
    if (query.list_id) {
      const listId = parseInt(query.list_id, 10);
      conditions.push('o.list_id = ?');
      params.push(listId);
      const listRow = db.prepare('SELECT name FROM lists WHERE id = ?').get(listId) as { name: string } | undefined;
      labels.push(`Liste: ${listRow?.name || query.list_id}`);
    }
  }

  // Arama filtresi (search_text)
  if (query.search) {
    const cleanSearch = normalizeSearchText(String(query.search));
    if (cleanSearch) {
      conditions.push('o.search_text LIKE ?');
      params.push(`%${cleanSearch}%`);
      labels.push(`Arama: "${query.search}"`);
    }
  }

  // Ülke ve Şehir
  if (query.country) {
    conditions.push('o.country = ?');
    params.push(String(query.country));
    labels.push(`Ülke: ${query.country}`);
  }
  if (query.city) {
    conditions.push('o.city = ?');
    params.push(String(query.city));
    labels.push(`Şehir: ${query.city}`);
  }

  // Durum
  if (query.status) {
    if (query.status === 'uncontacted') {
      conditions.push('o.status IS NULL');
      labels.push('Sonuç: Görüşülmedi');
    } else if (['positive', 'negative', 'follow_up'].includes(query.status)) {
      conditions.push('o.status = ?');
      params.push(query.status);
      const statusMap: Record<string, string> = {
        positive: 'Olumlu',
        negative: 'Olumsuz',
        follow_up: 'Tekrar Görüşülecek'
      };
      labels.push(`Sonuç: ${statusMap[query.status] || query.status}`);
    }
  }

  // Bugün ve Geciken (follow_up)
  if (query.due === '1' || query.due === 'true') {
    conditions.push("o.status = 'follow_up' AND o.follow_up_date <= ?");
    params.push(todayIstanbul());
    labels.push('Filtre: Bugün ve Geciken');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { whereClause, params, labels };
}
