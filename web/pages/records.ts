import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast } from '../ui.js';
import { openCallPanel } from './call-panel.js';

export function renderRecordsPage(container: HTMLElement, currentUser: any) {
  let records: any[] = [];
  let stats: any = {};
  let filterOptions = { countries: [], cities: [], lists: [] };
  let pagination = { page: 1, limit: 50, total: 0, total_pages: 1 };
  let isLoading = false;

  const AGENT_COLUMNS = [
    { id: 'col-location', label: 'Ülke / Şehir' },
    { id: 'col-website', label: 'Web Sitesi' },
    { id: 'col-whatsapp', label: 'WhatsApp' },
    { id: 'col-phone', label: 'Telefon' },
    { id: 'col-contact', label: 'Görüşülen Kişi' },
    { id: 'col-status', label: 'Sonuç' },
    { id: 'col-last-contact', label: 'Son Görüşme' },
    { id: 'col-followup', label: 'Tekrar Görüşme' }
  ];

  let hiddenCols = new Set<string>();
  try {
    const saved = localStorage.getItem('cc_hidden_cols_agent');
    if (saved) hiddenCols = new Set(JSON.parse(saved));
  } catch {}

  // Aktif filtreler
  const currentFilters = {
    search: '',
    country: '',
    city: '',
    status: '',
    due: false,
    sort_by: 'id',
    sort_dir: 'desc',
    page: 1
  };

  // URL hash parametrelerini oku
  function readFiltersFromUrl() {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const searchParams = new URLSearchParams(hash.substring(qIndex + 1));
      currentFilters.search = searchParams.get('search') || '';
      currentFilters.country = searchParams.get('country') || '';
      currentFilters.city = searchParams.get('city') || '';
      currentFilters.status = searchParams.get('status') || '';
      currentFilters.due = searchParams.get('due') === '1';
      currentFilters.page = parseInt(searchParams.get('page') || '1', 10);
    }
  }

  // URL hash parametrelerini güncelle
  function updateUrlWithFilters() {
    const params = new URLSearchParams();
    if (currentFilters.search) params.set('search', currentFilters.search);
    if (currentFilters.country) params.set('country', currentFilters.country);
    if (currentFilters.city) params.set('city', currentFilters.city);
    if (currentFilters.status) params.set('status', currentFilters.status);
    if (currentFilters.due) params.set('due', '1');
    if (currentFilters.page > 1) params.set('page', String(currentFilters.page));

    const paramStr = params.toString();
    const baseHash = currentUser.role === 'admin' ? '#/kayitlar' : '#/kayitlarim';
    const newHash = paramStr ? `${baseHash}?${paramStr}` : baseHash;

    if (window.location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }
  }

  async function loadData() {
    isLoading = true;
    render();

    try {
      // İstatistikler ve Filtre seçenekleri
      const [statsRes, filtersRes, dataRes] = await Promise.all([
        api.get('organizations/stats'),
        api.get('organizations/filters'),
        api.get(`organizations?page=${currentFilters.page}&limit=${pagination.limit}&search=${encodeURIComponent(currentFilters.search)}&country=${encodeURIComponent(currentFilters.country)}&city=${encodeURIComponent(currentFilters.city)}&status=${encodeURIComponent(currentFilters.status)}&due=${currentFilters.due ? '1' : ''}`)
      ]);

      stats = statsRes;
      filterOptions = filtersRes;
      records = dataRes.records || [];
      pagination = dataRes.pagination || pagination;
    } catch (err: any) {
      showToast(err.message || 'Veriler yüklenemedi', 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  // Sıradakini Al işlemi
  async function fetchNextRecord() {
    try {
      const res = await api.post('organizations/next');
      if (res.record) {
        showToast(res.message, 'success');
        // Görüşme panelini doğrudan aç
        openCallPanel({
          recordId: res.record.id,
          currentUser,
          onSaved: (wasNext) => {
            loadData();
            if (wasNext) fetchNextRecord();
          },
          onClose: () => {
            loadData();
          }
        });
      } else {
        showToast(res.message || 'Açık havuzda kayıt kalmadı.', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Sıradaki kayıt alınamadı.', 'error');
    }
  }

  function render() {
    container.innerHTML = html`
      <!-- Üst Bölüm: İstatistik Kartları ve Sıradakini Al -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <div class="stats-grid" style="flex: 1; margin-bottom: 0;">
          <div class="stat-card">
            <div class="stat-card-title">Kayıtlarım</div>
            <div class="stat-card-value num">${stats.my_total || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">Bugün Görüşülen</div>
            <div class="stat-card-value num">${stats.today_contacted || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">Olumlu</div>
            <div class="stat-card-value num" style="color: var(--status-positive-text);">${stats.positive || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">Bugün ve Geciken</div>
            <div class="stat-card-value num" style="color: var(--status-followup-text);">${stats.due_followups || 0}</div>
          </div>
        </div>

        <button type="button" class="btn btn-action-blue" id="btn-next-lead" style="min-height: 52px; padding: 0.75rem 1.75rem; font-size: 1rem; font-weight: 600; box-shadow: var(--shadow-md);">
          ${icons.play(22)} Sıradakini Al
        </button>
      </div>

      <!-- Filtreler Paneli -->
      <div class="card" style="margin-bottom: 1.25rem; padding: 1rem;">
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
          <!-- Arama Input -->
          <div style="flex: 2; min-width: 220px; position: relative;">
            <input class="form-control" type="text" id="filter-search" placeholder="Kuruluş, kişi veya şehir ara..." value="${currentFilters.search}" />
          </div>

          <!-- Ülke Seçimi -->
          <div style="flex: 1; min-width: 140px;">
            <select class="form-control" id="filter-country">
              <option value="">Tüm Ülkeler</option>
              ${filterOptions.countries.map(c => html`
                <option value="${c}" ${currentFilters.country === c ? 'selected' : ''}>${c}</option>
              `)}
            </select>
          </div>

          <!-- Şehir Seçimi -->
          <div style="flex: 1; min-width: 140px;">
            <select class="form-control" id="filter-city">
              <option value="">Tüm Şehirler</option>
              ${filterOptions.cities.map(c => html`
                <option value="${c}" ${currentFilters.city === c ? 'selected' : ''}>${c}</option>
              `)}
            </select>
          </div>

          <!-- Sonuç Seçimi -->
          <div style="flex: 1; min-width: 140px;">
            <select class="form-control" id="filter-status">
              <option value="">Tüm Sonuçlar</option>
              <option value="uncontacted" ${currentFilters.status === 'uncontacted' ? 'selected' : ''}>Görüşülmedi</option>
              <option value="positive" ${currentFilters.status === 'positive' ? 'selected' : ''}>Olumlu</option>
              <option value="negative" ${currentFilters.status === 'negative' ? 'selected' : ''}>Olumsuz</option>
              <option value="follow_up" ${currentFilters.status === 'follow_up' ? 'selected' : ''}>Tekrar Görüşülecek</option>
            </select>
          </div>

          <!-- Bugün ve Geciken Toggle -->
          <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8125rem; cursor: pointer; user-select: none;">
            <input type="checkbox" id="filter-due" ${currentFilters.due ? 'checked' : ''} />
            Bugün ve Geciken
          </label>

          <!-- Filtreleri Temizle -->
          <button type="button" class="btn btn-secondary" id="btn-clear-filters" title="Filtreleri Temizle">
            Filtreleri Temizle
          </button>

          <!-- Sütunları Yönet Dropdown -->
          <div class="columns-dropdown-wrapper" style="margin-left: auto;">
            <button type="button" class="btn btn-secondary" id="btn-toggle-columns" title="Görünür sütunları seç veya gizle">
              ${icons.columns(16)} Sütunlar
            </button>
            <div class="columns-dropdown-menu" id="columns-menu">
              <div class="columns-menu-header">
                <span>Sütunları Göster / Gizle</span>
              </div>
              ${AGENT_COLUMNS.map(col => html`
                <label class="columns-menu-item">
                  <input type="checkbox" class="col-toggle-checkbox" data-col="${col.id}" ${hiddenCols.has(col.id) ? '' : 'checked'} />
                  <span>${col.label}</span>
                </label>
              `)}
            </div>
          </div>
        </div>
      </div>

      <!-- Veri Tablosu -->
      <div class="table-container">
        <table class="data-table table-responsive-cards">
          <thead>
            <tr>
              <th style="width: 50px;">Sıra</th>
              <th>Kuruluş Adı</th>
              <th class="col-location ${hiddenCols.has('col-location') ? 'col-hidden' : ''}">Ülke / Şehir</th>
              <th class="col-website ${hiddenCols.has('col-website') ? 'col-hidden' : ''}">Web Sitesi</th>
              <th class="col-whatsapp ${hiddenCols.has('col-whatsapp') ? 'col-hidden' : ''}">WhatsApp</th>
              <th class="col-phone ${hiddenCols.has('col-phone') ? 'col-hidden' : ''}">Telefon</th>
              <th class="col-contact ${hiddenCols.has('col-contact') ? 'col-hidden' : ''}">Görüşülen Kişi</th>
              <th class="col-status ${hiddenCols.has('col-status') ? 'col-hidden' : ''}">Sonuç</th>
              <th class="col-last-contact ${hiddenCols.has('col-last-contact') ? 'col-hidden' : ''}">Son Görüşme</th>
              <th class="col-followup ${hiddenCols.has('col-followup') ? 'col-hidden' : ''}">Tekrar Görüşme</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading ? html`
              <tr><td colspan="10" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Yükleniyor...</td></tr>
            ` : records.length === 0 ? html`
              <tr><td colspan="10" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Filtreye uygun kayıt bulunamadı.</td></tr>
            ` : records.map((r, idx) => html`
              <tr class="clickable-row" data-id="${r.id}">
                <td class="num" style="color: var(--text-muted);">${(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td><strong>${r.organization_name}</strong></td>
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
                    <a href="https://wa.me/${r.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener noreferrer" class="btn-icon btn-wa-quick no-row-click" title="WhatsApp ile İletişim" style="color: #25d366; text-decoration: none;">
                      ${icons.whatsapp(18)}
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
                <td class="num col-last-contact ${hiddenCols.has('col-last-contact') ? 'col-hidden' : ''}">${r.last_contact_date ? r.last_contact_date : '-'}</td>
                <td class="num col-followup ${hiddenCols.has('col-followup') ? 'col-hidden' : ''}">${r.follow_up_date ? r.follow_up_date : '-'}</td>
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
            <button type="button" class="btn btn-secondary btn-page-prev" ${pagination.page <= 1 ? 'disabled' : ''}>
              Önceki
            </button>
            <button type="button" class="btn btn-secondary btn-page-next" ${pagination.page >= pagination.total_pages ? 'disabled' : ''}>
              Sonraki
            </button>
          </div>
        </div>
      </div>
    `;

    // Etkileşimler
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
          localStorage.setItem('cc_hidden_cols_agent', JSON.stringify([...hiddenCols]));
        } catch {}

        // Tablodaki hücreleri anında gizle veya göster
        container.querySelectorAll(`.${colId}`).forEach(el => {
          if (checked) {
            el.classList.remove('col-hidden');
          } else {
            el.classList.add('col-hidden');
          }
        });
      });
    });

    container.querySelector('#btn-next-lead')?.addEventListener('click', fetchNextRecord);

    // Satıra tıklama -> Görüşme Panelini Aç
    container.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', (e) => {
        // İkon butonlarına tıklandıysa satır tıklamasını tetikleme
        if ((e.target as HTMLElement).closest('.btn-icon')) return;

        const id = parseInt((row as HTMLElement).dataset.id || '0', 10);
        if (id) {
          openCallPanel({
            recordId: id,
            currentUser,
            onSaved: (wasNext) => {
              loadData();
              if (wasNext) fetchNextRecord();
            },
            onClose: () => {
              loadData();
            }
          });
        }
      });
    });

    // Hızlı WhatsApp Açma
    container.querySelectorAll('.btn-wa-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rawPhone = (btn as HTMLElement).dataset.phone || '';
        const digits = rawPhone.replace(/\D/g, '');
        if (!digits || digits.length < 8) {
          showToast('Geçersiz WhatsApp numarası', 'error');
          return;
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const mode = localStorage.getItem('whatsapp_mode') || 'app';
        const url = isMobile
          ? `https://wa.me/${digits}`
          : mode === 'web'
          ? `https://web.whatsapp.com/send?phone=${digits}`
          : `whatsapp://send?phone=${digits}`;

        window.open(url, 'whatsapp', 'noopener,noreferrer');
      });
    });

    // Hızlı Kopyalama
    container.querySelectorAll('.btn-copy-quick').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const phone = (btn as HTMLElement).dataset.phone || '';
        if (phone) {
          try {
            await navigator.clipboard.writeText(phone);
            showToast('Telefon numarası kopyalandı', 'success');
          } catch {
            showToast('Kopyalama başarısız', 'error');
          }
        }
      });
    });

    // Arama Gecikmesi (Debounce: 300ms)
    let searchTimer: any;
    const searchInput = container.querySelector('#filter-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentFilters.search = searchInput.value.trim();
        currentFilters.page = 1;
        updateUrlWithFilters();
        loadData();
      }, 300);
    });

    // Ülke filtresi
    container.querySelector('#filter-country')?.addEventListener('change', (e) => {
      currentFilters.country = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      updateUrlWithFilters();
      loadData();
    });

    // Şehir filtresi
    container.querySelector('#filter-city')?.addEventListener('change', (e) => {
      currentFilters.city = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      updateUrlWithFilters();
      loadData();
    });

    // Durum filtresi
    container.querySelector('#filter-status')?.addEventListener('change', (e) => {
      currentFilters.status = (e.target as HTMLSelectElement).value;
      currentFilters.page = 1;
      updateUrlWithFilters();
      loadData();
    });

    // Bugün ve Geciken
    container.querySelector('#filter-due')?.addEventListener('change', (e) => {
      currentFilters.due = (e.target as HTMLInputElement).checked;
      currentFilters.page = 1;
      updateUrlWithFilters();
      loadData();
    });

    // Filtreleri Temizle
    container.querySelector('#btn-clear-filters')?.addEventListener('click', () => {
      currentFilters.search = '';
      currentFilters.country = '';
      currentFilters.city = '';
      currentFilters.status = '';
      currentFilters.due = false;
      currentFilters.page = 1;
      updateUrlWithFilters();
      loadData();
    });

    // Sayfalama Butonları
    container.querySelector('.btn-page-prev')?.addEventListener('click', () => {
      if (currentFilters.page > 1) {
        currentFilters.page--;
        updateUrlWithFilters();
        loadData();
      }
    });

    container.querySelector('.btn-page-next')?.addEventListener('click', () => {
      if (currentFilters.page < pagination.total_pages) {
        currentFilters.page++;
        updateUrlWithFilters();
        loadData();
      }
    });
  }

  readFiltersFromUrl();
  loadData();
}
