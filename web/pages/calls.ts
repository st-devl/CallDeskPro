import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast } from '../ui.js';
import { openCallPanel } from './call-panel.js';

export function renderCallsPage(container: HTMLElement, currentUser: any) {
  let calls: any[] = [];
  let filterOptions: any = { lists: [] };
  let agents: any[] = [];
  let pagination = { page: 1, limit: 50, total: 0, total_pages: 1 };
  let isLoading = false;

  const currentFilters = {
    agent_id: '',
    status: '',
    start_date: '',
    end_date: '',
    list_id: '',
    page: 1
  };

  async function loadData() {
    isLoading = true;
    render();

    try {
      const [filtersRes, agentsRes, dataRes] = await Promise.all([
        api.get('organizations/filters'),
        api.get('admin/users'),
        api.get(`organizations/calls-report?page=${currentFilters.page}&limit=${pagination.limit}&agent_id=${encodeURIComponent(currentFilters.agent_id)}&status=${encodeURIComponent(currentFilters.status)}&start_date=${encodeURIComponent(currentFilters.start_date)}&end_date=${encodeURIComponent(currentFilters.end_date)}&list_id=${encodeURIComponent(currentFilters.list_id)}`)
      ]);

      filterOptions = filtersRes;
      agents = (agentsRes.users || []).filter((u: any) => u.role === 'agent');
      calls = dataRes.calls || [];
      pagination = dataRes.pagination || pagination;
    } catch (err: any) {
      showToast(err.message || 'Görüşme kayıtları yüklenemedi', 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    container.innerHTML = html`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700;">Tüm Görüşme Kayıtları</h2>
          <p style="font-size: 0.8125rem; color: var(--text-muted);">Aramacıların yaptığı tüm görüşmelerin tarihsel kaydı ve notları.</p>
        </div>
      </div>

      <!-- Filtreler Paneli -->
      <div class="card" style="margin-bottom: 1.25rem; padding: 1rem;">
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
          <div style="flex: 1; min-width: 140px;">
            <label class="form-label" style="font-size: 0.75rem;">Aramacı</label>
            <select class="form-control" id="call-filter-agent">
              <option value="">Tüm Aramacılar</option>
              ${agents.map(a => html`
                <option value="${a.id}" ${currentFilters.agent_id === String(a.id) ? 'selected' : ''}>${a.full_name}</option>
              `)}
            </select>
          </div>

          <div style="flex: 1; min-width: 130px;">
            <label class="form-label" style="font-size: 0.75rem;">Sonuç</label>
            <select class="form-control" id="call-filter-status">
              <option value="">Tüm Sonuçlar</option>
              <option value="positive" ${currentFilters.status === 'positive' ? 'selected' : ''}>Olumlu</option>
              <option value="negative" ${currentFilters.status === 'negative' ? 'selected' : ''}>Olumsuz</option>
              <option value="follow_up" ${currentFilters.status === 'follow_up' ? 'selected' : ''}>Tekrar Görüşülecek</option>
            </select>
          </div>

          <div style="flex: 1; min-width: 130px;">
            <label class="form-label" style="font-size: 0.75rem;">Başlangıç Tarihi</label>
            <input class="form-control" type="date" id="call-filter-start" value="${currentFilters.start_date}" />
          </div>

          <div style="flex: 1; min-width: 130px;">
            <label class="form-label" style="font-size: 0.75rem;">Bitiş Tarihi</label>
            <input class="form-control" type="date" id="call-filter-end" value="${currentFilters.end_date}" />
          </div>

          <div style="flex: 1; min-width: 140px;">
            <label class="form-label" style="font-size: 0.75rem;">Liste</label>
            <select class="form-control" id="call-filter-list">
              <option value="">Tüm Listeler</option>
              ${filterOptions.lists.map((l: any) => html`
                <option value="${l.id}" ${currentFilters.list_id === String(l.id) ? 'selected' : ''}>${l.name}</option>
              `)}
            </select>
          </div>

          <div style="align-self: flex-end;">
            <button type="button" class="btn btn-secondary" id="call-btn-clear" style="min-height: 40px;">Temizle</button>
          </div>
        </div>
      </div>

      <!-- Tablo -->
      <div class="table-container">
        <table class="data-table table-responsive-cards">
          <thead>
            <tr>
              <th style="width: 130px;">Tarih / Saat</th>
              <th>Aramacı</th>
              <th>Kuruluş Adı</th>
              <th>Ülke / Şehir</th>
              <th>Sonuç</th>
              <th>Takip Tarihi</th>
              <th style="width: 35%;">Görüşme Notu</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading ? html`
              <tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Yükleniyor...</td></tr>
            ` : calls.length === 0 ? html`
              <tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Görüşme kaydı bulunamadı.</td></tr>
            ` : calls.map(c => html`
              <tr class="clickable-row" data-org-id="${c.organization_id}">
                <td class="num">${c.created_at ? c.created_at.replace('T', ' ').substring(0, 16) : '-'}</td>
                <td><strong>${c.agent_name}</strong></td>
                <td><strong>${c.organization_name}</strong><br><small style="color:var(--text-muted);">${c.list_name || ''}</small></td>
                <td>${c.country || '-'}${c.city ? ` / ${c.city}` : ''}</td>
                <td>
                  <span class="badge ${c.status === 'positive' ? 'badge-positive' : c.status === 'negative' ? 'badge-negative' : 'badge-followup'}">
                    ${c.status === 'positive' ? 'Olumlu' : c.status === 'negative' ? 'Olumsuz' : 'Tekrar Görüşülecek'}
                  </span>
                </td>
                <td class="num">${c.follow_up_date || '-'}</td>
                <td style="white-space: pre-wrap; font-size: 0.8125rem;">${c.note || '-'}</td>
              </tr>
            `)}
          </tbody>
        </table>

        <!-- Sayfalama -->
        <div class="pagination">
          <div>
            Toplam <strong>${pagination.total}</strong> görüşme kaydı (Sayfa ${pagination.page} / ${pagination.total_pages})
          </div>
          <div class="pagination-controls">
            <button type="button" class="btn btn-secondary btn-calls-prev" ${pagination.page <= 1 ? 'disabled' : ''}>Önceki</button>
            <button type="button" class="btn btn-secondary btn-calls-next" ${pagination.page >= pagination.total_pages ? 'disabled' : ''}>Sonraki</button>
          </div>
        </div>
      </div>
    `;

    // Filtre Değişimleri
    container.querySelector('#call-filter-agent')?.addEventListener('change', (e) => {
      currentFilters.agent_id = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#call-filter-status')?.addEventListener('change', (e) => {
      currentFilters.status = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#call-filter-start')?.addEventListener('change', (e) => {
      currentFilters.start_date = (e.target as HTMLInputElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#call-filter-end')?.addEventListener('change', (e) => {
      currentFilters.end_date = (e.target as HTMLInputElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#call-filter-list')?.addEventListener('change', (e) => {
      currentFilters.list_id = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#call-btn-clear')?.addEventListener('click', () => {
      currentFilters.agent_id = '';
      currentFilters.status = '';
      currentFilters.start_date = '';
      currentFilters.end_date = '';
      currentFilters.list_id = '';
      currentFilters.page = 1;
      loadData();
    });

    // Satır Tıklama -> Kuruluş Detay Paneli
    container.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', () => {
        const orgId = parseInt((row as HTMLElement).dataset.orgId!, 10);
        if (orgId) {
          openCallPanel({
            recordId: orgId,
            currentUser,
            onSaved: () => loadData(),
            onClose: () => loadData()
          });
        }
      });
    });

    // Sayfalama
    container.querySelector('.btn-calls-prev')?.addEventListener('click', () => {
      if (currentFilters.page > 1) {
        currentFilters.page--;
        loadData();
      }
    });

    container.querySelector('.btn-calls-next')?.addEventListener('click', () => {
      if (currentFilters.page < pagination.total_pages) {
        currentFilters.page++;
        loadData();
      }
    });
  }

  loadData();
}
