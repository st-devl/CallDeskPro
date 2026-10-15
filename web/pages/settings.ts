import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast } from '../ui.js';

export function renderSettingsPage(container: HTMLElement, currentUser: any) {
  let waMode = 'app';
  try {
    waMode = localStorage.getItem('whatsapp_mode') || 'app';
  } catch {
    waMode = 'app';
  }

  let uncontactedLimit = 1;

  async function loadAdminSettings() {
    if (currentUser.role !== 'admin') return;
    try {
      const res = await api.get('admin/settings');
      if (res && res.uncontacted_limit) {
        uncontactedLimit = res.uncontacted_limit;
        const input = container.querySelector('#set-limit') as HTMLInputElement;
        if (input) input.value = String(uncontactedLimit);
      }
    } catch (err: any) {
      showToast(err.message || 'Ayarlar yüklenemedi', 'error');
    }
  }

  function render() {
    container.innerHTML = html`
      <div style="max-width: 650px;">
        <div style="margin-bottom: 1.5rem;">
          <h2 style="font-size: 1.25rem; font-weight: 700;">Kullanıcı ve Sistem Ayarları</h2>
          <p style="font-size: 0.8125rem; color: var(--text-muted);">Kişisel tercihlerinizi ve sistem ayarlarını yapılandırın.</p>
        </div>

        <!-- WhatsApp Tercihi -->
        <div class="panel-section">
          <h3 class="panel-section-title">WhatsApp Açma Modu (Tarayıcı Ayarı)</h3>
          <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 1rem;">
            Bilgisayardan arama yaparken WhatsApp butonuna tıklandığında hangi uygulamanın açılacağını seçin.
          </p>

          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer;">
              <input type="radio" name="wa-mode" value="app" ${waMode === 'app' ? raw('checked') : ''} />
              <span><strong>Masaüstü Uygulaması</strong> (Varsayılan - <code>whatsapp://</code> protokolü)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer;">
              <input type="radio" name="wa-mode" value="web" ${waMode === 'web' ? raw('checked') : ''} />
              <span><strong>WhatsApp Web</strong> (Tarayıcı sekmesinde açılır)</span>
            </label>
          </div>
        </div>

        <!-- Şifre Değiştirme -->
        <div class="panel-section">
          <h3 class="panel-section-title">Kendi Şifrenizi Değiştirin</h3>
          <div id="settings-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

          <form id="settings-pass-form">
            <div class="form-group">
              <label class="form-label" for="set-current-pass">Mevcut Şifre</label>
              <input class="form-control" type="password" id="set-current-pass" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="set-new-pass">Yeni Şifre (En az 10 karakter)</label>
              <input class="form-control" type="password" id="set-new-pass" minlength="10" required />
            </div>

            <button type="submit" class="btn btn-secondary" id="btn-change-my-pass">
              Şifremi Güncelle
            </button>
          </form>
        </div>

        ${currentUser.role === 'admin' ? html`
          <!-- Yönetici Sistem Ayarları -->
          <div class="panel-section">
            <h3 class="panel-section-title">Yönetici Sistem Ayarları</h3>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 1rem;">
              Aramacı başına üzerindeki görüşülmemiş (status NULL) kayıt limitini ve anlık veritabanı yedeğini indirmeyi yönetin.
            </p>

            <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1.5rem;">
              <div class="form-group" style="margin-bottom: 0; width: 220px;">
                <label class="form-label" for="set-limit">Aramacı Başına Görüşülmemiş Limit</label>
                <input class="form-control" type="number" id="set-limit" min="1" max="10" value="${uncontactedLimit}" />
              </div>
              <button type="button" class="btn btn-primary" id="btn-save-limit">Kaydet</button>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
              <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: 0.35rem;">Veritabanı Yedeği</h4>
              <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                SQLite veritabanının anlık güvenli yedeğini <code>callcenter.db</code> dosyası olarak doğrudan bilgisayarınıza indirin.
              </p>
              <a href="/api/admin/backup-download" class="btn btn-secondary" target="_blank">
                ${icons.download(16)} Anlık Yedek İndir (.db)
              </a>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // WhatsApp Tercihi Kaydetme
    container.querySelectorAll('input[name="wa-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        waMode = (e.target as HTMLInputElement).value;
        try {
          localStorage.setItem('whatsapp_mode', waMode);
          showToast('WhatsApp açma modu kaydedildi.', 'success');
        } catch {
          showToast('Ayar tarayıcıya kaydedilemedi.', 'error');
        }
      });
    });

    // Şifre Değiştirme
    const form = container.querySelector('#settings-pass-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current_password = (container.querySelector('#set-current-pass') as HTMLInputElement).value;
      const new_password = (container.querySelector('#set-new-pass') as HTMLInputElement).value;
      const alertBox = container.querySelector('#settings-alert') as HTMLElement;
      alertBox.style.display = 'none';

      try {
        await api.post('auth/change-password', { current_password, new_password });
        showToast('Şifreniz başarıyla güncellendi.', 'success');
        form.reset();
      } catch (err: any) {
        alertBox.textContent = err.message || 'Şifre güncellenemedi.';
        alertBox.style.display = 'block';
      }
    });

    // Yönetici Limit Kaydetme
    const saveLimitBtn = container.querySelector('#btn-save-limit') as HTMLButtonElement;
    saveLimitBtn?.addEventListener('click', async () => {
      const input = container.querySelector('#set-limit') as HTMLInputElement;
      const val = parseInt(input?.value || '1', 10);
      if (isNaN(val) || val < 1 || val > 10) {
        showToast('Limit 1 ile 10 arasında bir tam sayı olmalıdır.', 'error');
        return;
      }

      saveLimitBtn.disabled = true;
      try {
        await api.put('admin/settings', { uncontacted_limit: val });
        uncontactedLimit = val;
        showToast('Limit ayarı başarıyla güncellendi.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Ayar kaydedilemedi.', 'error');
      } finally {
        saveLimitBtn.disabled = false;
      }
    });
  }

  render();
  loadAdminSettings();
}
