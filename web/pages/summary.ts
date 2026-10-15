import { html, raw, escapeHtml } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast } from '../ui.js';

function renderDonutChart(positive: number, negative: number, followup: number): string {
  const total = positive + negative + followup;
  if (total === 0) {
    return `<div style="text-align: center; color: var(--text-muted); padding: 2.5rem;">Bu dönemde henüz görüşme kaydedilmemiş.</div>`;
  }

  const r = 58;
  const c = 2 * Math.PI * r;
  const successRate = Math.round((positive / total) * 100);

  const pLen = (positive / total) * c;
  const nLen = (negative / total) * c;
  const fLen = (followup / total) * c;

  let offset = 0;
  const pOffset = -offset;
  offset += pLen;
  const nOffset = -offset;
  offset += nLen;
  const fOffset = -offset;

  return `
    <div style="display: flex; align-items: center; justify-content: center; gap: 1.5rem; flex-wrap: wrap; width: 100%;">
      <div class="donut-wrapper">
        <svg width="170" height="170" viewBox="0 0 170 170" style="transform: rotate(-90deg);">
          <circle cx="85" cy="85" r="${r}" fill="none" stroke="var(--bg-muted)" stroke-width="18" />
          ${positive > 0 ? `<circle cx="85" cy="85" r="${r}" fill="none" stroke="#10b981" stroke-width="18" stroke-dasharray="${pLen} ${c - pLen}" stroke-dashoffset="${pOffset}" />` : ''}
          ${negative > 0 ? `<circle cx="85" cy="85" r="${r}" fill="none" stroke="#ef4444" stroke-width="18" stroke-dasharray="${nLen} ${c - nLen}" stroke-dashoffset="${nOffset}" />` : ''}
          ${followup > 0 ? `<circle cx="85" cy="85" r="${r}" fill="none" stroke="#f59e0b" stroke-width="18" stroke-dasharray="${fLen} ${c - fLen}" stroke-dashoffset="${fOffset}" />` : ''}
        </svg>
        <div class="donut-center">
          <div class="donut-center-val">%${successRate}</div>
          <div class="donut-center-lbl">Başarı Oranı</div>
        </div>
      </div>
      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-dot" style="background:#10b981;"></span>
          <span class="legend-text">Olumlu:</span>
          <span class="legend-val" style="color:#10b981;">${positive} (%${Math.round((positive / total) * 100)})</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#ef4444;"></span>
          <span class="legend-text">Olumsuz:</span>
          <span class="legend-val" style="color:#ef4444;">${negative} (%${Math.round((negative / total) * 100)})</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#f59e0b;"></span>
          <span class="legend-text">Tekrar Görüşülecek:</span>
          <span class="legend-val" style="color:#f59e0b;">${followup} (%${Math.round((followup / total) * 100)})</span>
        </div>
        <div class="legend-item" style="border-top: 1px solid var(--border-color); padding-top: 0.35rem; margin-top: 0.25rem;">
          <span class="legend-text"><strong>Toplam Görüşme:</strong></span>
          <span class="legend-val"><strong>${total}</strong></span>
        </div>
      </div>
    </div>
  `;
}

function renderStaffBars(staffList: any[]): string {
  if (staffList.length === 0) {
    return `<div style="text-align: center; color: var(--text-muted); padding: 2.5rem; width: 100%;">Kayıtlı aramacı bulunamadı.</div>`;
  }
  const maxCalls = Math.max(...staffList.map(s => s.total_calls || 0), 1);

  return `
    <div class="perf-bar-list">
      ${staffList.map(s => {
        const total = s.total_calls || 0;
        const pos = s.positive_count || 0;
        const neg = s.negative_count || 0;
        const fol = s.followup_count || 0;
        const rate = total > 0 ? Math.round((pos / total) * 100) : 0;
        const trackWidthPct = Math.round((total / maxCalls) * 100);

        const posPct = total > 0 ? (pos / total) * 100 : 0;
        const negPct = total > 0 ? (neg / total) * 100 : 0;
        const folPct = total > 0 ? (fol / total) * 100 : 0;

        return `
          <div class="perf-bar-row">
            <div class="perf-bar-labels">
              <span><strong>${escapeHtml(s.full_name)}</strong></span>
              <span style="color: var(--text-muted); font-size: 0.75rem;">
                <strong>${total}</strong> görüşme | <span style="color: #10b981; font-weight: 600;">%${rate} Başarı</span>
              </span>
            </div>
            <div style="width: 100%; display: flex; align-items: center; gap: 0.5rem;">
              <div class="perf-bar-track" style="width: ${Math.max(trackWidthPct, 6)}%;">
                <div class="perf-bar-fill-positive" style="width: ${posPct}%;" title="Olumlu: ${pos}"></div>
                <div class="perf-bar-fill-negative" style="width: ${negPct}%;" title="Olumsuz: ${neg}"></div>
                <div class="perf-bar-fill-followup" style="width: ${folPct}%;" title="Tekrar Görüşme: ${fol}"></div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

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

      <!-- Grafikler Bölümü -->
      <div class="charts-grid" style="margin-bottom: 1.5rem;">
        <!-- Grafik 1: Başarı / Başarısızlık Dağılımı (Donut Grafiği) -->
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Görüşme Başarı & Dağılım Grafiği</div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Dönem Toplamı</span>
          </div>
          <div class="chart-body">
            ${raw(renderDonutChart(totalPositive, totalNegative, totalFollowup))}
          </div>
        </div>

        <!-- Grafik 2: Personel Performans Karşılaştırma Grafiği -->
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Personel Başarı Karşılaştırması</div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Arama Hacmi & Dönüşüm</span>
          </div>
          <div class="chart-body" style="align-items: flex-start; justify-content: flex-start;">
            ${raw(renderStaffBars(summaryData))}
          </div>
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
