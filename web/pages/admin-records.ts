import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast, showConfirm } from '../ui.js';
import { openCallPanel } from './call-panel.js';

export function renderAdminRecordsPage(container: HTMLElement, currentUser: any) {
  let records: any[] = [];
  let stats: any = {};
  let filterOptions: { countries: string[]; cities: string[]; lists: any[] } = { countries: [], cities: [], lists: [] };
  let agents: any[] = [];
  let pagination = { page: 1, limit: 50, total: 0, total_pages: 1 };
  let selectedIds = new Set<number>();
  let isLoading = false;

  const ADMIN_COLUMNS = [
    { id: 'col-location', label: 'Ülke / Şehir' },
    { id: 'col-website', label: 'Web Sitesi' },
    { id: 'col-whatsapp', label: 'WhatsApp' },
    { id: 'col-phone', label: 'Telefon' },
    { id: 'col-contact', label: 'Yetkili Kişi' },
    { id: 'col-status', label: 'Sonuç' },
    { id: 'col-assigned', label: 'Atanan Aramacı' },
    { id: 'col-last-contact', label: 'Son Görüşme' }
  ];

  let hiddenCols = new Set<string>();
  try {
    const saved = localStorage.getItem('cc_hidden_cols_admin');
    if (saved) hiddenCols = new Set(JSON.parse(saved));
  } catch {}

  const currentFilters = {
    search: '',
    country: '',
    city: '',
    status: '',
    agent_id: '',
    list_id: '',
    due: false,
    page: 1
  };

  async function loadData() {
    isLoading = true;
    render();

    try {
      const [statsRes, filtersRes, agentsRes, dataRes] = await Promise.all([
        api.get('organizations/stats'),
        api.get('organizations/filters'),
        api.get('admin/users'),
        api.get(`organizations?page=${currentFilters.page}&limit=${pagination.limit}&search=${encodeURIComponent(currentFilters.search)}&country=${encodeURIComponent(currentFilters.country)}&city=${encodeURIComponent(currentFilters.city)}&status=${encodeURIComponent(currentFilters.status)}&agent_id=${encodeURIComponent(currentFilters.agent_id)}&list_id=${encodeURIComponent(currentFilters.list_id)}&due=${currentFilters.due ? '1' : ''}`)
      ]);

      stats = statsRes;
      filterOptions = filtersRes;
      agents = (agentsRes.users || []).filter((u: any) => u.role === 'agent' && u.active === 1);
      records = dataRes.records || [];
      pagination = dataRes.pagination || pagination;
    } catch (err: any) {
      showToast(err.message || 'Veriler yüklenemedi', 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r.id));

    container.innerHTML = html`
      <!-- Üst Bölüm: İstatistik Kartları -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-title">Toplam Kayıt</div>
          <div class="stat-card-value num">${stats.total || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Havuzda Bekleyen</div>
          <div class="stat-card-value num" style="color: var(--secondary);">${stats.pool_waiting || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Olumlu</div>
          <div class="stat-card-value num" style="color: var(--status-positive-text);">${stats.positive || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Tekrar Görüşülecek</div>
          <div class="stat-card-value num" style="color: var(--status-followup-text);">${stats.follow_up || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Bugün Görüşülen</div>
          <div class="stat-card-value num">${stats.today_contacted || 0}</div>
        </div>
      </div>

      <!-- Aksiyon Barı: Yeni Kayıt, Toplu İşlem, Dışa Aktar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" class="btn btn-action-blue" id="btn-new-org">
            ${icons.plus(18)} Yeni Manuel Kayıt
          </button>
          
          <button type="button" class="btn btn-secondary" id="btn-export-html" title="Filtrelenen kayıtları internetsiz çalışan tek dosya HTML olarak indir">
            ${icons.download(18)} HTML Dışa Aktar
          </button>

          <!-- Sütunları Yönet Dropdown -->
          <div class="columns-dropdown-wrapper">
            <button type="button" class="btn btn-secondary" id="btn-toggle-columns" title="Görünür sütunları seç veya gizle">
              ${icons.columns(16)} Sütunlar
            </button>
            <div class="columns-dropdown-menu" id="columns-menu">
              <div class="columns-menu-header">
                <span>Sütunları Göster / Gizle</span>
              </div>
              ${ADMIN_COLUMNS.map(col => html`
                <label class="columns-menu-item">
                  <input type="checkbox" class="col-toggle-checkbox" data-col="${col.id}" ${hiddenCols.has(col.id) ? '' : 'checked'} />
                  <span>${col.label}</span>
                </label>
              `)}
            </div>
          </div>
        </div>

        <!-- Toplu İşlem Çubuğu -->
        <div style="display: flex; gap: 0.5rem; align-items: center; background: var(--bg-surface); padding: 0.35rem 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
          <span style="font-size: 0.8125rem; color: var(--text-muted);">
            Seçili: <strong>${selectedIds.size}</strong>
          </span>
          <select class="form-control" id="bulk-target-agent" style="min-height: 32px; padding: 0.2rem 0.5rem; font-size: 0.8125rem; width: 150px;" ${selectedIds.size === 0 ? 'disabled' : ''}>
            <option value="">Aramacıya Ata...</option>
            <option value="pool">-- Havuza Bırak --</option>
            ${agents.map(a => html`<option value="${a.id}">${a.full_name}</option>`)}
          </select>
          <button type="button" class="btn btn-secondary" id="btn-apply-bulk" style="min-height: 32px; padding: 0.2rem 0.6rem; font-size: 0.8125rem;" ${selectedIds.size === 0 ? 'disabled' : ''}>
            Uygula
          </button>
          <button type="button" class="btn btn-danger" id="btn-bulk-delete" style="min-height: 32px; padding: 0.2rem 0.6rem; font-size: 0.8125rem;" ${selectedIds.size === 0 ? 'disabled' : ''}>
            ${icons.trash(14)} Sil
          </button>
        </div>
      </div>

      <!-- Filtreler Paneli -->
      <div class="card" style="margin-bottom: 1.25rem; padding: 1rem;">
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
          <div style="flex: 2; min-width: 180px;">
            <input class="form-control" type="text" id="admin-filter-search" placeholder="Ad, kişi, şehir ara..." value="${currentFilters.search}" />
          </div>

          <div style="flex: 1; min-width: 130px;">
            <select class="form-control" id="admin-filter-agent">
              <option value="">Tüm Aramacılar</option>
              <option value="pool" ${currentFilters.agent_id === 'pool' ? 'selected' : ''}>Havuzda (Atanmamış)</option>
              ${agents.map(a => html`
                <option value="${a.id}" ${currentFilters.agent_id === String(a.id) ? 'selected' : ''}>${a.full_name}</option>
              `)}
            </select>
          </div>

          <div style="flex: 1; min-width: 130px;">
            <select class="form-control" id="admin-filter-list">
              <option value="">Tüm Listeler</option>
              ${filterOptions.lists.map(l => html`
                <option value="${l.id}" ${currentFilters.list_id === String(l.id) ? 'selected' : ''}>${l.name}</option>
              `)}
            </select>
          </div>

          <div style="flex: 1; min-width: 120px;">
            <select class="form-control" id="admin-filter-status">
              <option value="">Tüm Sonuçlar</option>
              <option value="uncontacted" ${currentFilters.status === 'uncontacted' ? 'selected' : ''}>Görüşülmedi</option>
              <option value="positive" ${currentFilters.status === 'positive' ? 'selected' : ''}>Olumlu</option>
              <option value="negative" ${currentFilters.status === 'negative' ? 'selected' : ''}>Olumsuz</option>
              <option value="follow_up" ${currentFilters.status === 'follow_up' ? 'selected' : ''}>Tekrar Görüşülecek</option>
            </select>
          </div>

          <div style="flex: 1; min-width: 110px;">
            <select class="form-control" id="admin-filter-country">
              <option value="">Tüm Ülkeler</option>
              ${filterOptions.countries.map(c => html`
                <option value="${c}" ${currentFilters.country === c ? 'selected' : ''}>${c}</option>
              `)}
            </select>
          </div>

          <button type="button" class="btn btn-secondary" id="admin-btn-clear" title="Temizle">Temizle</button>
        </div>
      </div>

      <!-- Veri Tablosu -->
      <div class="table-container">
        <table class="data-table table-responsive-cards">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center;">
                <input type="checkbox" id="check-all" ${isAllSelected ? 'checked' : ''} />
              </th>
              <th style="width: 45px;">Sıra</th>
              <th>Kuruluş Adı</th>
              <th class="col-location ${hiddenCols.has('col-location') ? 'col-hidden' : ''}">Ülke / Şehir</th>
              <th class="col-website ${hiddenCols.has('col-website') ? 'col-hidden' : ''}">Web Sitesi</th>
              <th class="col-whatsapp ${hiddenCols.has('col-whatsapp') ? 'col-hidden' : ''}">WhatsApp</th>
              <th class="col-phone ${hiddenCols.has('col-phone') ? 'col-hidden' : ''}">Telefon</th>
              <th class="col-contact ${hiddenCols.has('col-contact') ? 'col-hidden' : ''}">Yetkili</th>
              <th class="col-status ${hiddenCols.has('col-status') ? 'col-hidden' : ''}">Sonuç</th>
              <th class="col-assigned ${hiddenCols.has('col-assigned') ? 'col-hidden' : ''}">Atanan Aramacı</th>
              <th class="col-last-contact ${hiddenCols.has('col-last-contact') ? 'col-hidden' : ''}">Son Görüşme</th>
              <th style="text-align: right;">İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading ? html`
              <tr><td colspan="12" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Yükleniyor...</td></tr>
            ` : records.length === 0 ? html`
              <tr><td colspan="12" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Kayıt bulunamadı.</td></tr>
            ` : records.map((r, idx) => html`
              <tr class="clickable-row" data-id="${r.id}">
                <td style="text-align: center;" class="no-row-click">
                  <input type="checkbox" class="row-checkbox" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''} />
                </td>
                <td class="num" style="color: var(--text-muted);">${(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td><strong>${r.organization_name}</strong><br><small style="color:var(--text-muted);">${r.list_name || ''}</small></td>
                <td class="col-location ${hiddenCols.has('col-location') ? 'col-hidden' : ''}">${r.country || '-'}${r.city ? ` / ${r.city}` : ''}</td>
                <td class="col-website ${hiddenCols.has('col-website') ? 'col-hidden' : ''}">
                  ${r.website ? html`
                    <a href="${r.website.startsWith('http') ? r.website : `https://${r.website}`}" target="_blank" rel="noopener noreferrer" class="website-link no-row-click" title="${r.website}">
                      ${icons.globe(14)} <span>${r.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                    </a>
                  ` : '-'}
                </td>
                <td class="col-whatsapp ${hiddenCols.has('col-whatsapp') ? 'col-hidden' : ''}">
                  ${r.whatsapp ? html`
                    <a href="https://wa.me/${r.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener noreferrer" class="no-row-click" style="display:inline-flex; align-items:center; gap:0.25rem; color:#25d366; text-decoration:none; font-weight:500;" title="WhatsApp ile İletişim">
                      ${icons.whatsapp(16)} <span class="phone-num" style="font-size:0.8125rem;">${r.whatsapp}</span>
                    </a>
                  ` : '-'}
                </td>
                <td class="col-phone ${hiddenCols.has('col-phone') ? 'col-hidden' : ''}">
                  ${r.phone ? html`
                    <div style="display: inline-flex; align-items: center; gap: 0.35rem;">
                      <span class="phone-num">${r.phone}</span>
                      <button type="button" class="btn-icon btn-copy-quick no-row-click" data-phone="${r.phone}" title="Telefonu Kopyala">
                        ${icons.copy(14)}
                      </button>
                    </div>
                  ` : '-'}
                </td>
                <td class="col-contact ${hiddenCols.has('col-contact') ? 'col-hidden' : ''}">${r.contact_person || '-'}</td>
                <td class="col-status ${hiddenCols.has('col-status') ? 'col-hidden' : ''}">
                  <span class="badge ${r.status === 'positive' ? 'badge-positive' : r.status === 'negative' ? 'badge-negative' : r.status === 'follow_up' ? 'badge-followup' : 'badge-neutral'}">
                    ${r.status === 'positive' ? 'Olumlu' : r.status === 'negative' ? 'Olumsuz' : r.status === 'follow_up' ? 'Tekrar Görüşülecek' : 'Görüşülmedi'}
                  </span>
                </td>
                <td class="col-assigned ${hiddenCols.has('col-assigned') ? 'col-hidden' : ''}">
                  ${r.assigned_name
                    ? html`<span style="font-weight: 500;">${r.assigned_name}</span>`
                    : html`<span style="color: var(--secondary); font-style: italic;">Havuzda</span>`}
                </td>
                <td class="num col-last-contact ${hiddenCols.has('col-last-contact') ? 'col-hidden' : ''}">${r.last_contact_date || '-'}</td>
                <td style="text-align: right;" class="no-row-click">
                  <button type="button" class="btn-icon btn-admin-delete" data-id="${r.id}" data-name="${r.organization_name}" title="Sil">
                    ${icons.trash(16)}
                  </button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>

        <!-- Sayfalama -->
        <div class="pagination">
          <div>
            Toplam <strong>${pagination.total}</strong> kayıt (Sayfa ${pagination.page} / ${pagination.total_pages})
          </div>
          <div class="pagination-controls">
            <button type="button" class="btn btn-secondary btn-admin-prev" ${pagination.page <= 1 ? 'disabled' : ''}>Önceki</button>
            <button type="button" class="btn btn-secondary btn-admin-next" ${pagination.page >= pagination.total_pages ? 'disabled' : ''}>Sonraki</button>
          </div>
        </div>
      </div>
    `;

    // Sütunları Yönet Menüsü Etkileşimleri
    const colBtn = container.querySelector('#btn-toggle-columns');
    const colMenu = container.querySelector('#columns-menu');

    colBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      colMenu?.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!colMenu?.contains(e.target as Node) && e.target !== colBtn) {
        colMenu?.classList.remove('active');
      }
    });

    container.querySelectorAll('.col-toggle-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const colId = (cb as HTMLElement).dataset.col!;
        const checked = (e.target as HTMLInputElement).checked;

        if (checked) {
          hiddenCols.delete(colId);
        } else {
          hiddenCols.add(colId);
        }

        try {
          localStorage.setItem('cc_hidden_cols_admin', JSON.stringify([...hiddenCols]));
        } catch {}

        // Tablodaki hücreleri canlı olarak gizle veya göster
        container.querySelectorAll(`.${colId}`).forEach(el => {
          if (checked) {
            el.classList.remove('col-hidden');
          } else {
            el.classList.add('col-hidden');
          }
        });
      });
    });

    // Checkbox İşlemleri
    container.querySelector('#check-all')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      records.forEach(r => {
        if (checked) selectedIds.add(r.id);
        else selectedIds.delete(r.id);
      });
      render();
    });

    container.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt((cb as HTMLElement).dataset.id!, 10);
        if ((e.target as HTMLInputElement).checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        render();
      });
    });

    // Satır Tıklama -> Görüşme Paneli
    container.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.no-row-click')) return;
        const id = parseInt((row as HTMLElement).dataset.id!, 10);
        if (id) {
          openCallPanel({
            recordId: id,
            currentUser,
            onSaved: () => loadData(),
            onClose: () => loadData()
          });
        }
      });
    });

    // Toplu Atama / Devretme
    container.querySelector('#btn-apply-bulk')?.addEventListener('click', async () => {
      const select = container.querySelector('#bulk-target-agent') as HTMLSelectElement;
      const targetVal = select.value;
      if (!targetVal) return;

      const isPool = targetVal === 'pool';
      const targetAgentId = isPool ? null : parseInt(targetVal, 10);
      const agentName = isPool ? 'Havuza' : select.options[select.selectedIndex].text;

      const confirmed = await showConfirm(
        'Toplu Atama',
        `Seçili ${selectedIds.size} adet kaydı ${agentName} atamak istediğinize emin misiniz?`,
        'Evet, Uygula',
        'Vazgeç'
      );
      if (!confirmed) return;

      try {
        const res = await api.post('organizations/assign', {
          ids: Array.from(selectedIds),
          target_user_id: targetAgentId
        });
        showToast(res.message, 'success');
        selectedIds.clear();
        loadData();
      } catch (err: any) {
        showToast(err.message || 'Atama başarısız', 'error');
      }
    });

    // Toplu Silme
    container.querySelector('#btn-bulk-delete')?.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'Toplu Silme',
        `DİKKAT: Seçili ${selectedIds.size} adet kuruluş ve bu kuruluşlara ait tüm görüşme kayıtları kalıcı olarak silinecektir! Onaylıyor musunuz?`,
        'Evet, Tümünü Sil',
        'Vazgeç',
        true
      );
      if (!confirmed) return;

      try {
        const res = await api.post('organizations/bulk-delete', {
          ids: Array.from(selectedIds)
        });
        showToast(res.message, 'success');
        selectedIds.clear();
        loadData();
      } catch (err: any) {
        showToast(err.message || 'Silme işlemi başarısız', 'error');
      }
    });

    // Tekil Silme
    container.querySelectorAll('.btn-admin-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        const name = (btn as HTMLElement).dataset.name;

        const confirmed = await showConfirm(
          'Kuruluş Sil',
          `"${name}" adlı kuruluşu ve görüşme geçmişini silmek istediğinize emin misiniz?`,
          'Evet, Sil',
          'Vazgeç',
          true
        );
        if (!confirmed) return;

        try {
          await api.delete(`organizations/${id}`);
          showToast('Kuruluş silindi', 'success');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Silinemedi', 'error');
        }
      });
    });

    // HTML Dışa Aktarma
    container.querySelector('#btn-export-html')?.addEventListener('click', () => {
      const params = new URLSearchParams();
      if (currentFilters.search) params.set('search', currentFilters.search);
      if (currentFilters.country) params.set('country', currentFilters.country);
      if (currentFilters.city) params.set('city', currentFilters.city);
      if (currentFilters.status) params.set('status', currentFilters.status);
      if (currentFilters.agent_id) params.set('agent_id', currentFilters.agent_id);
      if (currentFilters.list_id) params.set('list_id', currentFilters.list_id);

      window.open(`/api/export/records?${params.toString()}`, '_blank');
    });

    // Yeni Manuel Kayıt Modalı
    container.querySelector('#btn-new-org')?.addEventListener('click', () => {
      showNewOrgModal();
    });

    // Arama Debounce
    let timer: any;
    const searchInp = container.querySelector('#admin-filter-search') as HTMLInputElement;
    searchInp?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        currentFilters.search = searchInp.value.trim();
        currentFilters.page = 1;
        loadData();
      }, 300);
    });

    // Filtre Değişimleri
    container.querySelector('#admin-filter-agent')?.addEventListener('change', (e) => {
      currentFilters.agent_id = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#admin-filter-list')?.addEventListener('change', (e) => {
      currentFilters.list_id = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#admin-filter-status')?.addEventListener('change', (e) => {
      currentFilters.status = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#admin-filter-country')?.addEventListener('change', (e) => {
      currentFilters.country = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      loadData();
    });

    container.querySelector('#admin-btn-clear')?.addEventListener('click', () => {
      currentFilters.search = '';
      currentFilters.country = '';
      currentFilters.status = '';
      currentFilters.agent_id = '';
      currentFilters.list_id = '';
      currentFilters.page = 1;
      loadData();
    });

    // Sayfalama
    container.querySelector('.btn-admin-prev')?.addEventListener('click', () => {
      if (currentFilters.page > 1) {
        currentFilters.page--;
        loadData();
      }
    });

    container.querySelector('.btn-admin-next')?.addEventListener('click', () => {
      if (currentFilters.page < pagination.total_pages) {
        currentFilters.page++;
        loadData();
      }
    });
  }

  // Yeni Manuel Kayıt Modalı
  function showNewOrgModal() {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    modalBackdrop.innerHTML = html`
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Yeni Manuel Kayıt Ekle</h3>
          <button type="button" class="btn-icon modal-close-btn">${icons.close(18)}</button>
        </div>
        <form id="new-org-form">
          <div class="modal-body">
            <div id="new-org-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <div class="form-group">
              <label class="form-label" for="new-org-name">Kuruluş / Şirket Adı *</label>
              <input class="form-control" type="text" id="new-org-name" required />
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label" for="new-country">Ülke</label>
                <input class="form-control" type="text" id="new-country" value="Türkiye" />
              </div>
              <div class="form-group flex-1">
                <label class="form-label" for="new-city">Şehir</label>
                <input class="form-control" type="text" id="new-city" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-website">Web Sitesi</label>
              <input class="form-control" type="text" id="new-website" placeholder="www.ornek.org" />
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label" for="new-wa">WhatsApp Numarası</label>
                <input class="form-control" type="text" id="new-wa" placeholder="+90555..." />
              </div>
              <div class="form-group flex-1">
                <label class="form-label" for="new-phone">Telefon Numarası</label>
                <input class="form-control" type="text" id="new-phone" placeholder="+90212..." />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-contact">Görüşülen / Yetkili Kişi</label>
              <input class="form-control" type="text" id="new-contact" />
            </div>

            <div class="form-group">
              <label class="form-label" for="new-assign">Atanacak Aramacı (İsteğe bağlı)</label>
              <select class="form-control" id="new-assign">
                <option value="">Havuzda Bırak</option>
                ${agents.map(a => html`<option value="${a.id}">${a.full_name}</option>`)}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Vazgeç</button>
            <button type="submit" class="btn btn-action-blue" id="btn-save-new-org">Kaydı Ekle</button>
          </div>
        </form>
      </div>
    `;

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.modal-close-btn')?.addEventListener('click', close);
    modalBackdrop.querySelector('.modal-cancel-btn')?.addEventListener('click', close);

    const form = modalBackdrop.querySelector('#new-org-form') as HTMLFormElement;
    const alertBox = modalBackdrop.querySelector('#new-org-alert') as HTMLElement;
    const saveBtn = modalBackdrop.querySelector('#btn-save-new-org') as HTMLButtonElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.style.display = 'none';

      const organization_name = (modalBackdrop.querySelector('#new-org-name') as HTMLInputElement).value.trim();
      const country = (modalBackdrop.querySelector('#new-country') as HTMLInputElement).value.trim();
      const city = (modalBackdrop.querySelector('#new-city') as HTMLInputElement).value.trim();
      const website = (modalBackdrop.querySelector('#new-website') as HTMLInputElement).value.trim();
      const whatsapp = (modalBackdrop.querySelector('#new-wa') as HTMLInputElement).value.trim();
      const phone = (modalBackdrop.querySelector('#new-phone') as HTMLInputElement).value.trim();
      const contact_person = (modalBackdrop.querySelector('#new-contact') as HTMLInputElement).value.trim();
      const assigned_to = (modalBackdrop.querySelector('#new-assign') as HTMLSelectElement).value;

      saveBtn.disabled = true;
      try {
        await api.post('organizations', {
          organization_name,
          country,
          city,
          website: website || null,
          whatsapp,
          phone,
          contact_person,
          assigned_to: assigned_to || null
        });

        showToast('Kuruluş başarıyla eklendi.', 'success');
        close();
        loadData();
      } catch (err: any) {
        alertBox.textContent = err.message || 'Kayıt eklenemedi.';
        alertBox.style.display = 'block';
        saveBtn.disabled = false;
      }
    });

    document.body.appendChild(modalBackdrop);
  }

  loadData();
}
