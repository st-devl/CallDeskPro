import { html, raw } from '../html.js';
import { api } from '../api.js';
import { icons } from '../icons.js';
import { showToast, showConfirm } from '../ui.js';

export function renderUsersPage(container: HTMLElement, currentUser: any) {
  let users: any[] = [];
  let isLoading = true;

  async function loadUsers() {
    isLoading = true;
    render();
    try {
      const res = await api.get('admin/users');
      users = res.users || [];
    } catch (err: any) {
      showToast(err.message || 'Kullanıcılar yüklenemedi', 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    container.innerHTML = html`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700;">Kullanıcı Yönetimi</h2>
          <p style="font-size: 0.8125rem; color: var(--text-muted);">Sistemdeki aramacıları ve yöneticileri yönetin.</p>
        </div>
        <button type="button" class="btn btn-action-blue" id="btn-add-user">
          ${icons.plus(18)} Yeni Kullanıcı Ekle
        </button>
      </div>

      <div class="table-container">
        <table class="data-table table-responsive-cards">
          <thead>
            <tr>
              <th>Ad Soyad</th>
              <th>Kullanıcı Adı</th>
              <th>Rol</th>
              <th>Durum</th>
              <th>Şifre Değişimi</th>
              <th>Son Giriş</th>
              <th style="text-align: right;">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading
              ? html`<tr><td colspan="7" style="text-align:center; padding: 2rem;">Yükleniyor...</td></tr>`
              : users.length === 0
              ? html`<tr><td colspan="7" style="text-align:center; padding: 2rem;">Kayıtlı kullanıcı bulunamadı.</td></tr>`
              : users.map(u => html`
                  <tr>
                    <td><strong>${u.full_name}</strong></td>
                    <td><code>${u.username}</code></td>
                    <td>
                      <span class="badge ${u.role === 'admin' ? 'badge-neutral' : 'badge-followup'}">
                        ${u.role === 'admin' ? 'Yönetici' : 'Aramacı'}
                      </span>
                    </td>
                    <td>
                      <span class="badge ${u.active === 1 ? 'badge-positive' : 'badge-negative'}">
                        ${u.active === 1 ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td>
                      ${u.must_change_password === 1
                        ? html`<span style="color: var(--status-followup-text); font-size: 0.8125rem;">Zorunlu</span>`
                        : html`<span style="color: var(--text-muted); font-size: 0.8125rem;">Değiştirildi</span>`}
                    </td>
                    <td class="num">${u.last_login_at ? u.last_login_at.replace('T', ' ').substring(0, 16) : '-'}</td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 0.35rem;">
                        <button type="button" class="btn-icon btn-edit" data-id="${u.id}" title="Düzenle">
                          ${icons.edit(16)}
                        </button>
                        <button type="button" class="btn-icon btn-reset-pass" data-id="${u.id}" title="Şifre Sıfırla">
                          ${icons.lock(16)}
                        </button>
                        ${u.id !== currentUser.id
                          ? html`
                              <button type="button" class="btn-icon btn-toggle-active" data-id="${u.id}" data-active="${u.active}" title="${u.active === 1 ? 'Pasifleştir' : 'Aktifleştir'}">
                                ${u.active === 1 ? icons.alert(16) : icons.check(16)}
                              </button>
                            `
                          : ''}
                        ${u.role === 'agent'
                          ? html`
                              <button type="button" class="btn-icon btn-release" data-id="${u.id}" title="Kayıtlarını Havuza Bırak">
                                ${icons.refresh(16)}
                              </button>
                            `
                          : ''}
                      </div>
                    </td>
                  </tr>
                `)}
          </tbody>
        </table>
      </div>
    `;

    // Yeni Kullanıcı Ekle Butonu
    container.querySelector('#btn-add-user')?.addEventListener('click', () => {
      showAddUserModal();
    });

    // Tablo Butonları
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const target = users.find(u => String(u.id) === id);
        if (target) showEditUserModal(target);
      });
    });

    container.querySelectorAll('.btn-reset-pass').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const target = users.find(u => String(u.id) === id);
        if (target) showResetPasswordModal(target);
      });
    });

    container.querySelectorAll('.btn-toggle-active').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id;
        const isActive = (btn as HTMLElement).dataset.active === '1';
        const actionText = isActive ? 'pasifleştirmek' : 'aktifleştirmek';

        const confirmed = await showConfirm(
          'Kullanıcı Durumu Değiştir',
          `Bu kullanıcıyı ${actionText} istediğinize emin misiniz? ${isActive ? 'Kullanıcının aktif tüm oturumları kapatılacaktır.' : ''}`,
          isActive ? 'Evet, Pasifleştir' : 'Evet, Aktifleştir',
          'Vazgeç',
          isActive
        );

        if (!confirmed) return;

        try {
          await api.post(`admin/users/${id}/toggle-active`);
          showToast('Kullanıcı durumu güncellendi.', 'success');
          loadUsers();
        } catch (err: any) {
          showToast(err.message || 'İşlem başarısız.', 'error');
        }
      });
    });

    container.querySelectorAll('.btn-release').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id;
        const target = users.find(u => String(u.id) === id);

        const confirmed = await showConfirm(
          'Kayıtları Havuza Bırak',
          `"${target?.full_name}" adlı aramacının üzerinde bulunan tüm kayıtlar havuza bırakılacaktır. Onaylıyor musunuz?`,
          'Evet, Havuza Bırak',
          'Vazgeç',
          true
        );

        if (!confirmed) return;

        try {
          const res = await api.post(`admin/users/${id}/release-records`);
          showToast(res.message || 'Kayıtlar havuza bırakıldı.', 'success');
        } catch (err: any) {
          showToast(err.message || 'İşlem başarısız.', 'error');
        }
      });
    });
  }

  // Yeni Kullanıcı Modalı
  function showAddUserModal() {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    modalBackdrop.innerHTML = html`
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Yeni Kullanıcı Ekle</h3>
          <button type="button" class="btn-icon modal-close-btn">${icons.close(18)}</button>
        </div>
        <form id="add-user-form">
          <div class="modal-body">
            <div id="modal-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <div class="form-group">
              <label class="form-label" for="add-full-name">Ad Soyad</label>
              <input class="form-control" type="text" id="add-full-name" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="add-username">Kullanıcı Adı (küçük harf)</label>
              <input class="form-control" type="text" id="add-username" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="add-role">Rol</label>
              <select class="form-control" id="add-role" required>
                <option value="agent">Aramacı (agent)</option>
                <option value="admin">Yönetici (admin)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="add-password">Geçici Şifre (En az 10 karakter)</label>
              <input class="form-control" type="text" id="add-password" minlength="10" value="Gecici1234!" required />
              <small style="color: var(--text-muted); font-size: 0.75rem;">Kullanıcı ilk girişinde şifresini değiştirmek zorundadır.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Vazgeç</button>
            <button type="submit" class="btn btn-action-blue" id="btn-save-user">Kullanıcıyı Kaydet</button>
          </div>
        </form>
      </div>
    `;

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.modal-close-btn')?.addEventListener('click', close);
    modalBackdrop.querySelector('.modal-cancel-btn')?.addEventListener('click', close);

    const form = modalBackdrop.querySelector('#add-user-form') as HTMLFormElement;
    const alertBox = modalBackdrop.querySelector('#modal-alert') as HTMLElement;
    const saveBtn = modalBackdrop.querySelector('#btn-save-user') as HTMLButtonElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.style.display = 'none';

      const full_name = (modalBackdrop.querySelector('#add-full-name') as HTMLInputElement).value;
      const username = (modalBackdrop.querySelector('#add-username') as HTMLInputElement).value;
      const role = (modalBackdrop.querySelector('#add-role') as HTMLSelectElement).value;
      const password = (modalBackdrop.querySelector('#add-password') as HTMLInputElement).value;

      saveBtn.disabled = true;
      try {
        await api.post('admin/users', { full_name, username, role, password });
        showToast('Kullanıcı başarıyla oluşturuldu.', 'success');
        close();
        loadUsers();
      } catch (err: any) {
        alertBox.textContent = err.message || 'Kullanıcı eklenemedi.';
        alertBox.style.display = 'block';
      } finally {
        saveBtn.disabled = false;
      }
    });

    document.body.appendChild(modalBackdrop);
  }

  // Kullanıcı Düzenle Modalı
  function showEditUserModal(user: any) {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    modalBackdrop.innerHTML = html`
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Kullanıcı Düzenle: ${user.username}</h3>
          <button type="button" class="btn-icon modal-close-btn">${icons.close(18)}</button>
        </div>
        <form id="edit-user-form">
          <div class="modal-body">
            <div id="modal-edit-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <div class="form-group">
              <label class="form-label" for="edit-full-name">Ad Soyad</label>
              <input class="form-control" type="text" id="edit-full-name" value="${user.full_name}" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-role">Rol</label>
              <select class="form-control" id="edit-role" ${user.id === currentUser.id ? 'disabled' : ''}>
                <option value="agent" ${user.role === 'agent' ? 'selected' : ''}>Aramacı (agent)</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Yönetici (admin)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Vazgeç</button>
            <button type="submit" class="btn btn-primary" id="btn-update-user">Güncelle</button>
          </div>
        </form>
      </div>
    `;

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.modal-close-btn')?.addEventListener('click', close);
    modalBackdrop.querySelector('.modal-cancel-btn')?.addEventListener('click', close);

    const form = modalBackdrop.querySelector('#edit-user-form') as HTMLFormElement;
    const alertBox = modalBackdrop.querySelector('#modal-edit-alert') as HTMLElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const full_name = (modalBackdrop.querySelector('#edit-full-name') as HTMLInputElement).value;
      const role = (modalBackdrop.querySelector('#edit-role') as HTMLSelectElement).value;

      try {
        await api.put(`admin/users/${user.id}`, { full_name, role });
        showToast('Kullanıcı güncellendi.', 'success');
        close();
        loadUsers();
      } catch (err: any) {
        alertBox.textContent = err.message || 'Güncelleme başarısız.';
        alertBox.style.display = 'block';
      }
    });

    document.body.appendChild(modalBackdrop);
  }

  // Şifre Sıfırla Modalı
  function showResetPasswordModal(user: any) {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    modalBackdrop.innerHTML = html`
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Şifre Sıfırla: ${user.username}</h3>
          <button type="button" class="btn-icon modal-close-btn">${icons.close(18)}</button>
        </div>
        <form id="reset-pass-form">
          <div class="modal-body">
            <div id="modal-reset-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <p style="font-size: 0.875rem; margin-bottom: 1rem; color: var(--text-muted);">
              Kullanıcı için yeni bir geçici şifre belirleyin. Kullanıcı bu şifreyle ilk girişinde şifresini değiştirmek zorunda olacaktır.
            </p>

            <div class="form-group">
              <label class="form-label" for="reset-new-password">Yeni Geçici Şifre (En az 10 karakter)</label>
              <input class="form-control" type="text" id="reset-new-password" minlength="10" value="Gecici1234!" required />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Vazgeç</button>
            <button type="submit" class="btn btn-danger" id="btn-do-reset">Şifreyi Sıfırla</button>
          </div>
        </form>
      </div>
    `;

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.modal-close-btn')?.addEventListener('click', close);
    modalBackdrop.querySelector('.modal-cancel-btn')?.addEventListener('click', close);

    const form = modalBackdrop.querySelector('#reset-pass-form') as HTMLFormElement;
    const alertBox = modalBackdrop.querySelector('#modal-reset-alert') as HTMLElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const new_password = (modalBackdrop.querySelector('#reset-new-password') as HTMLInputElement).value;

      try {
        await api.post(`admin/users/${user.id}/reset-password`, { new_password });
        showToast('Kullanıcı şifresi sıfırlandı.', 'success');
        close();
        loadUsers();
      } catch (err: any) {
        alertBox.textContent = err.message || 'Şifre sıfırlanamadı.';
        alertBox.style.display = 'block';
      }
    });

    document.body.appendChild(modalBackdrop);
  }

  loadUsers();
}
