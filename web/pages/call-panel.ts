import { html, raw } from '../html.js';
import { api, ApiError } from '../api.js';
import { icons } from '../icons.js';
import { showToast, showConfirm } from '../ui.js';

export interface CallPanelOptions {
  recordId: number;
  currentUser: any;
  onSaved: (wasNext: boolean) => void;
  onClose: () => void;
}

export function openCallPanel(options: CallPanelOptions) {
  const { recordId, currentUser, onSaved, onClose } = options;

  let currentRecord: any = null;
  let callsHistory: any[] = [];
  let isDirty = false;
  let selectedStatus: 'positive' | 'negative' | 'follow_up' | null = null;
  // Sonuç butonuna tıklandı mı? (Aynı sonucu tekrar seçmek de yeni görüşme sayılır)
  let statusTouched = false;
  let originalUpdatedAt = '';

  const backdrop = document.createElement('div');
  backdrop.className = 'panel-backdrop';

  const drawer = document.createElement('div');
  drawer.className = 'panel-drawer';

  backdrop.appendChild(drawer);
  document.body.appendChild(backdrop);

  // Paneli kapatma işlemi (değişiklik kontrolüyle)
  async function handleClose() {
    if (isDirty) {
      const confirmed = await showConfirm(
        'Kaydedilmemiş Değişiklikler',
        'Kaydedilmemiş not veya durum bilginiz var. Kapatmak istediğinize emin misiniz?',
        'Evet, Kapat',
        'Vazgeç',
        true
      );
      if (!confirmed) return;
    }
    backdrop.remove();
    window.removeEventListener('keydown', handleKeydown);
    onClose();
  }

  // Kısayollar
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveRecord(false);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveRecord(true);
      return;
    }

    // 1 / 2 / 3 kısayolları (input ve textarea dışındayken)
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag !== 'input' && activeTag !== 'textarea') {
      if (e.key === '1') selectStatus('positive');
      if (e.key === '2') selectStatus('negative');
      if (e.key === '3') selectStatus('follow_up');
    }
  }

  window.addEventListener('keydown', handleKeydown);

  function selectStatus(status: 'positive' | 'negative' | 'follow_up') {
    selectedStatus = status;
    statusTouched = true;
    isDirty = true;
    updateStatusUI();
  }

  function updateStatusUI() {
    drawer.querySelectorAll('.btn-disposition').forEach((btn) => {
      const s = (btn as HTMLElement).dataset.status;
      if (s === selectedStatus) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const followUpGroup = drawer.querySelector('#group-followup-date') as HTMLElement;
    if (followUpGroup) {
      followUpGroup.style.display = selectedStatus === 'follow_up' ? 'block' : 'none';
      const input = followUpGroup.querySelector('input') as HTMLInputElement;
      if (selectedStatus === 'follow_up' && !input.value) {
        // Yarının tarihini varsayılan yap
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        input.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(tomorrow);
      }
    }
  }

  async function loadData() {
    drawer.innerHTML = html`
      <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
        Yükleniyor...
      </div>
    `;

    try {
      const res = await api.get(`organizations/${recordId}`);
      currentRecord = res.record;
      callsHistory = res.calls || [];
      selectedStatus = currentRecord.status || null;
      originalUpdatedAt = currentRecord.updated_at;
      renderDrawer();
    } catch (err: any) {
      showToast(err.message || 'Kayıt yüklenemedi', 'error');
      handleClose();
    }
  }

  function renderDrawer() {
    drawer.innerHTML = html`
      <div class="panel-header">
        <div>
          <span class="badge ${currentRecord.status === 'positive' ? 'badge-positive' : currentRecord.status === 'negative' ? 'badge-negative' : currentRecord.status === 'follow_up' ? 'badge-followup' : 'badge-neutral'}">
            ${currentRecord.status === 'positive' ? 'Olumlu' : currentRecord.status === 'negative' ? 'Olumsuz' : currentRecord.status === 'follow_up' ? 'Tekrar Görüşülecek' : 'Görüşülmedi'}
          </span>
          <h2 class="panel-title">${currentRecord.organization_name}</h2>
          <small style="color: var(--text-muted);">${currentRecord.list_name || 'Liste Yok'}</small>
        </div>
        <button type="button" class="btn-icon btn-panel-close" title="Kapat (Esc)">
          ${icons.close(20)}
        </button>
      </div>

      <div class="panel-body">
        <div id="panel-error-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

        <!-- İletişim Butonları -->
        <div class="contact-actions-bar">
          <button type="button" class="btn btn-whatsapp" id="btn-open-wa">
            ${icons.whatsapp(20)} WhatsApp'ı Aç
          </button>
          ${currentRecord.phone ? html`
            <button type="button" class="btn btn-secondary" id="btn-copy-phone" title="Telefonu Kopyala">
              ${icons.copy(18)} ${currentRecord.phone}
            </button>
          ` : ''}
          ${currentRecord.website ? html`
            <a href="${currentRecord.website.startsWith('http') ? currentRecord.website : `https://${currentRecord.website}`}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" title="Web Sitesini Aç">
              ${icons.globe(18)} Web Sitesi
            </a>
          ` : ''}
        </div>

        <!-- Kuruluş & İletişim Bilgileri Düzenleme -->
        <div class="panel-section">
          <h3 class="panel-section-title">Kuruluş & İletişim Bilgileri</h3>
          
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="inp-country">Ülke</label>
              <input class="form-control" type="text" id="inp-country" value="${currentRecord.country || ''}" />
            </div>
            <div class="form-group flex-1">
              <label class="form-label" for="inp-city">Şehir</label>
              <input class="form-control" type="text" id="inp-city" value="${currentRecord.city || ''}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="inp-whatsapp">WhatsApp Numarası</label>
              <input class="form-control" type="text" id="inp-whatsapp" value="${currentRecord.whatsapp || ''}" placeholder="+90555..." />
            </div>
            <div class="form-group flex-1">
              <label class="form-label" for="inp-phone">Telefon Numarası</label>
              <input class="form-control" type="text" id="inp-phone" value="${currentRecord.phone || ''}" placeholder="+90212..." />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="inp-website">Web Sitesi</label>
            <input class="form-control" type="text" id="inp-website" value="${currentRecord.website || ''}" placeholder="www.ornek.org" />
          </div>

          <div class="form-group">
            <label class="form-label" for="inp-contact">Görüşülen / Yetkili Kişi</label>
            <input class="form-control" type="text" id="inp-contact" value="${currentRecord.contact_person || ''}" />
          </div>
        </div>

        <!-- Görüşme Sonucu -->
        <div class="panel-section">
          <h3 class="panel-section-title">Görüşme Sonucu (1 / 2 / 3)</h3>
          
          <div class="disposition-selector">
            <button type="button" class="btn-disposition btn-disp-positive" data-status="positive">
              ${icons.check(18)} Olumlu (1)
            </button>
            <button type="button" class="btn-disposition btn-disp-negative" data-status="negative">
              ${icons.close(18)} Olumsuz (2)
            </button>
            <button type="button" class="btn-disposition btn-disp-followup" data-status="follow_up">
              ${icons.refresh(18)} Tekrar Görüşülecek (3)
            </button>
          </div>

          <div class="form-group" id="group-followup-date" style="display: none; margin-top: 1rem;">
            <label class="form-label" for="inp-followup-date">Tekrar Görüşme Tarihi</label>
            <input class="form-control" type="date" id="inp-followup-date" value="${currentRecord.follow_up_date || ''}" />
          </div>

          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label" for="inp-call-note">Görüşme Notu</label>
            <textarea class="form-control" id="inp-call-note" rows="4" placeholder="Görüşme detayları, konuşulanlar...">${currentRecord.note || ''}</textarea>
          </div>
        </div>

        <!-- Görüşme Geçmişi -->
        <div class="panel-section">
          <h3 class="panel-section-title">Görüşme Geçmişi (${callsHistory.length})</h3>
          
          ${callsHistory.length === 0 ? html`
            <p style="color: var(--text-muted); font-size: 0.8125rem;">Bu kuruluşla henüz bir görüşme kaydedilmemiş.</p>
          ` : html`
            <div class="history-timeline">
              ${callsHistory.map((c) => html`
                <div class="history-item">
                  <div class="history-header">
                    <span class="badge ${c.status === 'positive' ? 'badge-positive' : c.status === 'negative' ? 'badge-negative' : 'badge-followup'}">
                      ${c.status === 'positive' ? 'Olumlu' : c.status === 'negative' ? 'Olumsuz' : 'Tekrar Görüşülecek'}
                    </span>
                    <span class="history-meta">
                      ${c.user_name} · ${c.created_at ? c.created_at.replace('T', ' ').substring(0, 16) : ''}
                    </span>
                  </div>
                  ${c.follow_up_date ? html`
                    <div style="font-size: 0.75rem; color: var(--status-followup-text); margin-top: 0.25rem;">
                      Takip Tarihi: <strong>${c.follow_up_date}</strong>
                    </div>
                  ` : ''}
                  ${c.note ? html`
                    <p class="history-note">${c.note}</p>
                  ` : ''}
                </div>
              `)}
            </div>
          `}
        </div>
      </div>

      <div class="panel-footer">
        <button type="button" class="btn btn-secondary btn-cancel-panel">Kapat</button>
        <button type="button" class="btn btn-primary" id="btn-save">Kaydet (Ctrl+S)</button>
        <button type="button" class="btn btn-action-blue" id="btn-save-next">Kaydet ve Sıradakini Al (Ctrl+Enter)</button>
      </div>
    `;

    // Buton ve Etkileşimler
    drawer.querySelector('.btn-panel-close')?.addEventListener('click', handleClose);
    drawer.querySelector('.btn-cancel-panel')?.addEventListener('click', handleClose);

    drawer.querySelectorAll('.btn-disposition').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectStatus((btn as HTMLElement).dataset.status as any);
      });
    });

    drawer.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', () => {
        isDirty = true;
      });
    });

    // WhatsApp Butonu
    drawer.querySelector('#btn-open-wa')?.addEventListener('click', () => {
      const phoneVal = (drawer.querySelector('#inp-whatsapp') as HTMLInputElement).value || currentRecord.whatsapp || currentRecord.phone;
      const digits = (phoneVal || '').replace(/\D/g, '');

      if (!digits || digits.length < 8) {
        showToast('Geçerli bir telefon veya WhatsApp numarası bulunamadı.', 'error');
        return;
      }

      // WhatsApp linki açma
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      let waUrl = '';

      if (isMobile) {
        waUrl = `https://wa.me/${digits}`;
      } else {
        const mode = localStorage.getItem('whatsapp_mode') || 'app';
        if (mode === 'web') {
          waUrl = `https://web.whatsapp.com/send?phone=${digits}`;
        } else {
          waUrl = `whatsapp://send?phone=${digits}`;
        }
      }

      window.open(waUrl, '_blank', 'noopener,noreferrer');
    });

    // Telefon Kopyalama
    drawer.querySelector('#btn-copy-phone')?.addEventListener('click', async () => {
      if (currentRecord.phone) {
        try {
          await navigator.clipboard.writeText(currentRecord.phone);
          showToast('Telefon numarası panoya kopyalandı.', 'success');
        } catch {
          showToast('Kopyalama başarısız.', 'error');
        }
      }
    });

    // Kaydet ve Kaydet & Sıradakini Al Butonları
    drawer.querySelector('#btn-save')?.addEventListener('click', () => saveRecord(false));
    drawer.querySelector('#btn-save-next')?.addEventListener('click', () => saveRecord(true));

    updateStatusUI();
  }

  async function saveRecord(fetchNext: boolean) {
    const errorAlert = drawer.querySelector('#panel-error-alert') as HTMLElement;
    if (errorAlert) errorAlert.style.display = 'none';

    const country = (drawer.querySelector('#inp-country') as HTMLInputElement)?.value;
    const city = (drawer.querySelector('#inp-city') as HTMLInputElement)?.value;
    const website = (drawer.querySelector('#inp-website') as HTMLInputElement)?.value;
    const whatsapp = (drawer.querySelector('#inp-whatsapp') as HTMLInputElement)?.value;
    const phone = (drawer.querySelector('#inp-phone') as HTMLInputElement)?.value;
    const contact = (drawer.querySelector('#inp-contact') as HTMLInputElement)?.value;
    const note = (drawer.querySelector('#inp-call-note') as HTMLTextAreaElement)?.value;
    const followUpDate = (drawer.querySelector('#inp-followup-date') as HTMLInputElement)?.value;

    if (selectedStatus === 'follow_up' && !followUpDate) {
      if (errorAlert) {
        errorAlert.textContent = 'Tekrar görüşülecek kayıtlar için takip tarihi zorunludur.';
        errorAlert.style.display = 'block';
      }
      return;
    }

    const saveBtn = drawer.querySelector('#btn-save') as HTMLButtonElement;
    const saveNextBtn = drawer.querySelector('#btn-save-next') as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = true;
    if (saveNextBtn) saveNextBtn.disabled = true;

    // Yalnızca bilgi düzeltmesi (ülke, şehir, telefon vb.) yeni görüşme sayılmaz.
    // Sonuç seçildiyse veya not/takip tarihi değiştiyse görüşme olarak kaydedilir.
    const isNewCall =
      statusTouched ||
      note !== (currentRecord.note || '') ||
      (selectedStatus === 'follow_up' && followUpDate !== (currentRecord.follow_up_date || ''));

    try {
      const res = await api.put(`organizations/${recordId}`, {
        country,
        city,
        website: website || null,
        whatsapp,
        phone,
        contact_person: contact,
        status: isNewCall ? selectedStatus : undefined,
        note,
        follow_up_date: followUpDate,
        client_updated_at: originalUpdatedAt
      });

      showToast(res.message || 'Kayıt başarıyla kaydedildi.', 'success');
      isDirty = false;
      backdrop.remove();
      window.removeEventListener('keydown', handleKeydown);
      onSaved(fetchNext);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // Eşzamanlı düzenleme çakışması
        const conflictMsg = 'Bu kayıt siz düzenlerken başka biri tarafından değiştirildi! Lütfen güncel kaydı inceleyin; yazdığınız not kaybolmamıştır.';
        if (errorAlert) {
          errorAlert.textContent = conflictMsg;
          errorAlert.style.display = 'block';
        }
        showToast(conflictMsg, 'error', 6000);
      } else {
        if (errorAlert) {
          errorAlert.textContent = err.message || 'Kayıt güncellenemedi.';
          errorAlert.style.display = 'block';
        }
        showToast(err.message || 'Kayıt güncellenemedi.', 'error');
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (saveNextBtn) saveNextBtn.disabled = false;
    }
  }

  loadData();
}
