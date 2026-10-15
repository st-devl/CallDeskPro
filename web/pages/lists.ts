import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast, showConfirm } from '../ui.js';

export function renderListsPage(container: HTMLElement, currentUser: any) {
  let lists: any[] = [];
  let isLoading = false;

  async function loadLists() {
    isLoading = true;
    render();
    try {
      const res = await api.get('import/lists');
      lists = res.lists || [];
    } catch (err: any) {
      showToast(err.message || 'Listeler yüklenemedi', 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    container.innerHTML = html`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700;">Havuz Listeleri & İçe Aktarma</h2>
          <p style="font-size: 0.8125rem; color: var(--text-muted);">Excel (.xlsx) ve CSV dosyalarından kayıt yükleyin, havuz listelerini yönetin.</p>
        </div>
        <button type="button" class="btn btn-action-blue" id="btn-upload-list">
          ${icons.download(18)} Yeni Liste Yükle (XLSX / CSV)
        </button>
      </div>

      <!-- Listeler Tablosu -->
      <div class="table-container">
        <table class="data-table table-responsive-cards">
          <thead>
            <tr>
              <th>Liste Adı</th>
              <th>Yükleme Tarihi</th>
              <th>Yükleyen</th>
              <th>Toplam Kayıt</th>
              <th>Havuzda Bekleyen</th>
              <th>Görüşülen</th>
              <th>Havuz Durumu</th>
              <th style="text-align: right;">İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading ? html`
              <tr><td colspan="8" style="text-align: center; padding: 2rem;">Yükleniyor...</td></tr>
            ` : lists.length === 0 ? html`
              <tr><td colspan="8" style="text-align: center; padding: 2rem;">Henüz bir liste yüklenmemiş.</td></tr>
            ` : lists.map(l => html`
              <tr>
                <td><strong>${l.name}</strong></td>
                <td class="num">${l.created_at ? l.created_at.replace('T', ' ').substring(0, 16) : '-'}</td>
                <td>${l.creator_name || 'Sistem'}</td>
                <td class="num font-bold">${l.total_count || 0}</td>
                <td class="num" style="color: var(--secondary); font-weight: 600;">${l.pool_count || 0}</td>
                <td class="num" style="color: var(--status-positive-text); font-weight: 600;">${l.contacted_count || 0}</td>
                <td>
                  <button type="button" class="btn btn-icon btn-toggle-open" data-id="${l.id}" title="${l.is_open === 1 ? 'Havuzu Kapat (Sıradakini Al durur)' : 'Havuzu Aç'}" style="width: auto; padding: 0.3rem 0.6rem; gap: 0.35rem;">
                    <span class="badge ${l.is_open === 1 ? 'badge-positive' : 'badge-neutral'}">
                      ${l.is_open === 1 ? 'Açık' : 'Kapalı'}
                    </span>
                  </button>
                </td>
                <td style="text-align: right;">
                  ${l.name !== 'Manuel Kayıtlar' ? html`
                    <button type="button" class="btn-icon btn-delete-list" data-id="${l.id}" data-name="${l.name}" data-contacted="${l.contacted_count || 0}" title="Listeyi Sil">
                      ${icons.trash(16)}
                    </button>
                  ` : html`<span style="color:var(--text-muted); font-size: 0.75rem;">Sabit</span>`}
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;

    // Yeni Liste Yükleme Modalı
    container.querySelector('#btn-upload-list')?.addEventListener('click', () => {
      showUploadModal();
    });

    // Açık/Kapalı Durumu Değiştirme
    container.querySelectorAll('.btn-toggle-open').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id;
        try {
          await api.post(`import/lists/${id}/toggle-open`);
          showToast('Liste durumu güncellendi.', 'success');
          loadLists();
        } catch (err: any) {
          showToast(err.message || 'Durum değiştirilemedi.', 'error');
        }
      });
    });

    // Liste Silme
    container.querySelectorAll('.btn-delete-list').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id;
        const name = (btn as HTMLElement).dataset.name;
        const contacted = parseInt((btn as HTMLElement).dataset.contacted || '0', 10);

        let warnMsg = `"${name}" listesini silmek istediğinize emin misiniz? Bu listeye bağlı bütün kayıtlar silinecektir.`;
        if (contacted > 0) {
          warnMsg = `DİKKAT: "${name}" listesinde ${contacted} adet görüşme yapılmış kayıt bulunmaktadır! Silerseniz tüm görüşme geçmişi de silinecektir. Devam etmek istiyor musunuz?`;
        }

        const confirmed = await showConfirm('Listeyi Sil', warnMsg, 'Evet, Sil', 'Vazgeç', true);
        if (!confirmed) return;

        try {
          await api.delete(`import/lists/${id}`);
          showToast('Liste başarıyla silindi.', 'success');
          loadLists();
        } catch (err: any) {
          showToast(err.message || 'Silme işlemi başarısız.', 'error');
        }
      });
    });
  }

  // Liste Yükleme & Sütun Eşleştirme Modalı
  function showUploadModal() {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    modalBackdrop.innerHTML = html`
      <div class="modal-dialog" style="max-width: 700px;">
        <div class="modal-header">
          <h3 class="modal-title">Yeni Liste İçe Aktar</h3>
          <button type="button" class="btn-icon modal-close-btn">${icons.close(18)}</button>
        </div>
        <div class="modal-body">
          <div id="upload-step-1">
            <div id="upload-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.75rem; margin-bottom: 1rem; background: var(--bg-muted); border-radius: var(--radius-md); font-size: 0.8125rem;">
              <span style="color: var(--text-muted);">
                Hazır sütunlu Excel şablonunu indirip doldurabilirsiniz. Kendi dosyanızı da yükleyebilirsiniz.
              </span>
              <a href="/ornek-liste.xlsx" download="ornek-liste.xlsx" class="btn btn-secondary" style="white-space: nowrap;">
                ${icons.download(16)} Örnek Şablonu İndir
              </a>
            </div>

            <div class="form-group">
              <label class="form-label" for="inp-list-name">Liste Adı</label>
              <input class="form-control" type="text" id="inp-list-name" placeholder="Örn: İngiltere STK - Ekim 2026" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="inp-file">Dosya Seç (.xlsx veya .csv, maks 10 MB)</label>
              <input class="form-control" type="file" id="inp-file" accept=".xlsx,.csv" required />
              <small style="color: var(--text-muted); font-size: 0.75rem;">
                Dosya doğrudan bellekte okunur; diske kalıcı olarak yazılmaz.
              </small>
            </div>

            <div style="text-align: right; margin-top: 1.5rem;">
              <button type="button" class="btn btn-secondary modal-cancel-btn">Vazgeç</button>
              <button type="button" class="btn btn-action-blue" id="btn-do-preview">Dosyayı Oku ve Önizle</button>
            </div>
          </div>

          <div id="upload-step-2" style="display:none;">
            <div id="mapping-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 1rem;">
              Sütunlar otomatik olarak eşleştirildi. Lütfen doğruluğunu kontrol edin:
            </p>

            <div id="column-mappings-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.25rem;"></div>

            <h4 style="font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.5rem;">İlk Satırlar Önizleme:</h4>
            <div style="max-height: 160px; overflow: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 1.5rem;">
              <table class="data-table" id="preview-table" style="font-size: 0.75rem;"></table>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center;">
              <button type="button" class="btn btn-secondary" id="btn-back-step-1">Geri Dön</button>
              <button type="button" class="btn btn-primary" id="btn-confirm-import">Onayla ve Havuza Aktar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.modal-close-btn')?.addEventListener('click', close);
    modalBackdrop.querySelector('.modal-cancel-btn')?.addEventListener('click', close);

    const step1 = modalBackdrop.querySelector('#upload-step-1') as HTMLElement;
    const step2 = modalBackdrop.querySelector('#upload-step-2') as HTMLElement;
    const alertBox = modalBackdrop.querySelector('#upload-alert') as HTMLElement;
    const previewBtn = modalBackdrop.querySelector('#btn-do-preview') as HTMLButtonElement;

    let importToken = '';
    let previewData: any = null;

    // Adım 1: Dosyayı Yükle ve Önizleme İste
    previewBtn.addEventListener('click', async () => {
      alertBox.style.display = 'none';
      const listName = (modalBackdrop.querySelector('#inp-list-name') as HTMLInputElement).value.trim();
      const fileInput = modalBackdrop.querySelector('#inp-file') as HTMLInputElement;

      if (!listName) {
        alertBox.textContent = 'Lütfen bir liste adı giriniz.';
        alertBox.style.display = 'block';
        return;
      }

      if (!fileInput.files || fileInput.files.length === 0) {
        alertBox.textContent = 'Lütfen bir dosya seçiniz.';
        alertBox.style.display = 'block';
        return;
      }

      const file = fileInput.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alertBox.textContent = 'Dosya boyutu 10 MB sınırını aşıyor.';
        alertBox.style.display = 'block';
        return;
      }

      previewBtn.disabled = true;
      previewBtn.textContent = 'Dosya inceleniyor...';

      try {
        const arrayBuffer = await file.arrayBuffer();

        const response = await fetch('/api/import/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name),
            'X-List-Name': encodeURIComponent(listName)
          },
          body: arrayBuffer,
          credentials: 'same-origin'
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Dosya okunamadı');
        }

        importToken = data.token;
        previewData = data;

        // Adım 2'ye geç
        renderMappingStep(data);
        step1.style.display = 'none';
        step2.style.display = 'block';
      } catch (err: any) {
        alertBox.textContent = err.message || 'Yükleme başarısız.';
        alertBox.style.display = 'block';
      } finally {
        previewBtn.disabled = false;
        previewBtn.textContent = 'Dosyayı Oku ve Önizle';
      }
    });

    // Adım 2: Eşleştirme Arayüzü
    function renderMappingStep(data: any) {
      const mappingContainer = modalBackdrop.querySelector('#column-mappings-container') as HTMLElement;
      const headers = data.headers as string[];
      const suggested = data.suggestedMapping as Record<string, number>;

      const fields = [
        { key: 'organization_name', label: 'Kuruluş Adı (Zorunlu)', required: true },
        { key: 'country', label: 'Ülke', required: false },
        { key: 'city', label: 'Şehir', required: false },
        { key: 'whatsapp', label: 'WhatsApp Numarası', required: false },
        { key: 'phone', label: 'Telefon Numarası', required: false },
        { key: 'website', label: 'Web Sitesi', required: false },
        { key: 'contact_person', label: 'Görüşülen / İlgili Kişi', required: false }
      ];

      mappingContainer.innerHTML = html`
        ${fields.map(f => html`
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" style="font-size: 0.75rem;">${f.label}</label>
            <select class="form-control mapping-select" data-field="${f.key}" style="font-size: 0.8125rem;">
              <option value="">-- Eşleştirilmedi --</option>
              ${headers.map((h, idx) => html`
                <option value="${idx}" ${suggested[f.key] === idx ? raw('selected') : ''}>
                  ${idx + 1}. ${h || `(Sütun ${idx + 1})`}
                </option>
              `)}
            </select>
          </div>
        `)}
      `;

      // Tablo Önizlemesi
      const table = modalBackdrop.querySelector('#preview-table') as HTMLElement;
      table.innerHTML = html`
        <thead>
          <tr>
            ${headers.map((h, i) => html`<th>${i + 1}. ${h}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${(data.previewRows as string[][]).map(row => html`
            <tr>
              ${row.map(cell => html`<td>${cell || '-'}</td>`)}
            </tr>
          `)}
        </tbody>
      `;
    }

    // Geri Dön Butonu
    modalBackdrop.querySelector('#btn-back-step-1')?.addEventListener('click', () => {
      step2.style.display = 'none';
      step1.style.display = 'block';
    });

    // İçe Aktarmayı Onayla
    modalBackdrop.querySelector('#btn-confirm-import')?.addEventListener('click', async () => {
      const mappingAlert = modalBackdrop.querySelector('#mapping-alert') as HTMLElement;
      mappingAlert.style.display = 'none';

      const mapping: Record<string, number | null> = {};
      modalBackdrop.querySelectorAll('.mapping-select').forEach(sel => {
        const field = (sel as HTMLElement).dataset.field!;
        const val = (sel as HTMLSelectElement).value;
        mapping[field] = val !== '' ? parseInt(val, 10) : null;
      });

      if (mapping.organization_name == null) {
        mappingAlert.textContent = 'Kuruluş Adı sütunu mutlaka bir dosya sütunuyla eşleştirilmelidir.';
        mappingAlert.style.display = 'block';
        return;
      }

      const confirmBtn = modalBackdrop.querySelector('#btn-confirm-import') as HTMLButtonElement;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Kayıtlar yazılıyor...';

      try {
        const res = await api.post('import/confirm', {
          token: importToken,
          listName: previewData.listName,
          mapping
        });

        showToast(res.message, 'success', 5000);
        close();
        loadLists();
      } catch (err: any) {
        mappingAlert.textContent = err.message || 'İçe aktarma sırasında bir hata oluştu.';
        mappingAlert.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Onayla ve Havuza Aktar';
      }
    });

    document.body.appendChild(modalBackdrop);
  }

  loadLists();
}
