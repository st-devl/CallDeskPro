import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast } from '../ui.js';

export function renderSummaryPage(container: HTMLElement, currentUser: any) {
  let summaryData: any[] = [];
  let startDate = new Date().toISOString().split('T')[0];
  let endDate = new Date().toISOString().split('T')[0];
  let isLoading = false;

  async function loadData() {
    isLoading = true;
    render();

    try {
      const res = await api.get(`organizations/performance-summary?start_date=${startDate}&end_date=${endDate}`);
      summaryData = res.summary || [];
    } catch (err: any) {
      showToast(err.message || 'Özet verileri alınamadı', 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    const totalCalls = summaryData.reduce((acc, a) => acc + (a.total_calls || 0), 0);
    const totalPositive = summaryData.reduce((acc, a) => acc + (a.positive_count || 0), 0);
    const totalNegative = summaryData.reduce((acc, a) => acc + (a.negative_count || 0), 0);
    const totalFollowup = summaryData.reduce((acc, a) => acc + (a.followup_count || 0), 0);
    const totalUncontacted = summaryData.reduce((acc, a) => acc + (a.uncontacted_count || 0), 0);

    container.innerHTML = html`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700;">Personel Performans Özeti</h2>
          <p style="font-size: 0.8125rem; color: var(--text-muted);">Aramacı bazında görüşme adetleri, dönüşüm ve havuz yükü.</p>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input class="form-control" type="date" id="sum-start-date" value="${startDate}" style="width: 140px; min-height: 38px;" />
          <span style="color: var(--text-muted);">-</span>
          <input class="form-control" type="date" id="sum-end-date" value="${endDate}" style="width: 140px; min-height: 38px;" />
          <button type="button" class="btn btn-primary" id="btn-refresh-summary" style="min-height: 38px;">
            ${icons.refresh(16)} Yenile
          </button>
        </div>
      </div>

      <!-- Genel İstatistik Kartları -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-title">Dönem İçi Toplam Görüşme</div>
          <div class="stat-card-value num">${totalCalls}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Olumlu Sonuç</div>
          <div class="stat-card-value num" style="color: var(--status-positive-text);">${totalPositive}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Olumsuz Sonuç</div>
          <div class="stat-card-value num" style="color: var(--status-negative-text);">${totalNegative}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Tekrar Görüşülecek</div>
          <div class="stat-card-value num" style="color: var(--status-followup-text);">${totalFollowup}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-title">Bekleyen Görüşülmemiş</div>
          <div class="stat-card-value num">${totalUncontacted}</div>
        </div>
      </div>

      <!-- Personel Tablosu -->
      <div class="table-container">
        <table class="data-table table-responsive-cards">
          <thead>
            <tr>
              <th>Aramacı Personel</th>
              <th>Durum</th>
              <th class="num" style="text-align: right;">Görüşme Sayısı</th>
              <th class="num" style="text-align: right;">Olumlu</th>
              <th class="num" style="text-align: right;">Olumsuz</th>
              <th class="num" style="text-align: right;">Tekrar Görüşülecek</th>
              <th class="num" style="text-align: right;">Dönüşüm Oranı</th>
              <th class="num" style="text-align: right;">Üzerindeki Görüşülmemiş</th>
              <th style="text-align: right;">Son Aktivite</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading ? html`
              <tr><td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Yükleniyor...</td></tr>
            ` : summaryData.length === 0 ? html`
              <tr><td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Kayıtlı aramacı bulunamadı.</td></tr>
            ` : summaryData.map(a => {
              const rate = a.total_calls > 0 ? Math.round((a.positive_count / a.total_calls) * 100) : 0;
              return html`
                <tr>
                  <td><strong>${a.full_name}</strong><br><small style="color:var(--text-muted);">@${a.username}</small></td>
                  <td>
                    <span class="badge ${a.active === 1 ? 'badge-positive' : 'badge-neutral'}">
                      ${a.active === 1 ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td class="num font-bold" style="text-align: right; font-size: 1rem;">${a.total_calls}</td>
                  <td class="num" style="text-align: right; color: var(--status-positive-text); font-weight: 600;">${a.positive_count}</td>
                  <td class="num" style="text-align: right; color: var(--status-negative-text);">${a.negative_count}</td>
                  <td class="num" style="text-align: right; color: var(--status-followup-text);">${a.followup_count}</td>
                  <td class="num" style="text-align: right; font-weight: 600;">%${rate}</td>
                  <td class="num" style="text-align: right;">
                    <span class="badge ${a.uncontacted_count > 0 ? 'badge-followup' : 'badge-neutral'}">
                      ${a.uncontacted_count}
                    </span>
                  </td>
                  <td class="num" style="text-align: right; font-size: 0.8125rem; color: var(--text-muted);">
                    ${a.last_activity ? a.last_activity.replace('T', ' ').substring(0, 16) : '-'}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    `;

    container.querySelector('#btn-refresh-summary')?.addEventListener('click', () => {
      startDate = (container.querySelector('#sum-start-date') as HTMLInputElement).value;
      endDate = (container.querySelector('#sum-end-date') as HTMLInputElement).value;
      loadData();
    });
  }

  loadData();
}
