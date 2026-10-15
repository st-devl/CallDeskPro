import { html } from '../html.js';
import { api, ApiError } from '../api.js';
import { icons } from '../icons.js';
import { showToast } from '../ui.js';

export function renderLoginPage(container: HTMLElement, onLoginSuccess: (user: any) => void) {
  let isChangingPassword = false;
  let tempUser: any = null;

  function render() {
    if (isChangingPassword) {
      container.innerHTML = html`
        <div class="auth-page">
          <div class="auth-card">
            <div class="auth-header">
              <h1 class="auth-title">Şifre Değiştirme</h1>
              <p class="auth-subtitle">İlk girişiniz için güvenliğiniz amacıyla şifrenizi değiştirmeniz gerekmektedir.</p>
            </div>

            <div id="auth-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

            <form id="change-pass-form">
              <div class="form-group">
                <label class="form-label" for="current-password">Mevcut / Geçici Şifre</label>
                <input class="form-control" type="password" id="current-password" required autocomplete="current-password" />
              </div>

              <div class="form-group">
                <label class="form-label" for="new-password">Yeni Şifre (En az 10 karakter)</label>
                <input class="form-control" type="password" id="new-password" minlength="10" required autocomplete="new-password" />
              </div>

              <div class="form-group">
                <label class="form-label" for="confirm-password">Yeni Şifre (Tekrar)</label>
                <input class="form-control" type="password" id="confirm-password" minlength="10" required autocomplete="new-password" />
              </div>

              <button type="submit" class="btn btn-action-blue" style="width: 100%; margin-top: 0.5rem;" id="change-pass-btn">
                Şifreyi Güncelle ve Başla
              </button>
            </form>
          </div>
        </div>
      `;

      const form = container.querySelector('#change-pass-form') as HTMLFormElement;
      const alertBox = container.querySelector('#auth-alert') as HTMLElement;
      const submitBtn = container.querySelector('#change-pass-btn') as HTMLButtonElement;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.style.display = 'none';

        const currentPass = (container.querySelector('#current-password') as HTMLInputElement).value;
        const newPass = (container.querySelector('#new-password') as HTMLInputElement).value;
        const confirmPass = (container.querySelector('#confirm-password') as HTMLInputElement).value;

        if (newPass !== confirmPass) {
          alertBox.textContent = 'Yeni şifreler eşleşmiyor.';
          alertBox.style.display = 'block';
          return;
        }

        if (newPass.length < 10) {
          alertBox.textContent = 'Şifre en az 10 karakter olmalıdır.';
          alertBox.style.display = 'block';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Güncelleniyor...';

        try {
          await api.post('auth/change-password', {
            current_password: currentPass,
            new_password: newPass
          });

          showToast('Şifreniz başarıyla güncellendi.', 'success');
          tempUser.must_change_password = false;
          onLoginSuccess(tempUser);
        } catch (err: any) {
          alertBox.textContent = err.message || 'Şifre güncellenemedi.';
          alertBox.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Şifreyi Güncelle ve Başla';
        }
      });
      return;
    }

    // Normal Giriş Ekranı
    container.innerHTML = html`
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-header">
            <h1 class="auth-title">CALL CENTER</h1>
            <p class="auth-subtitle">Görüşme ve Takip Sistemi</p>
          </div>

          <div id="auth-alert" style="display:none;" class="auth-alert auth-alert-error"></div>

          <form id="login-form">
            <div class="form-group">
              <label class="form-label" for="username">Kullanıcı Adı</label>
              <input class="form-control" type="text" id="username" required autocomplete="username" autofocus />
            </div>

            <div class="form-group">
              <label class="form-label" for="password">Şifre</label>
              <input class="form-control" type="password" id="password" required autocomplete="current-password" />
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;" id="login-btn">
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    `;

    const form = container.querySelector('#login-form') as HTMLFormElement;
    const alertBox = container.querySelector('#auth-alert') as HTMLElement;
    const loginBtn = container.querySelector('#login-btn') as HTMLButtonElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.style.display = 'none';

      const username = (container.querySelector('#username') as HTMLInputElement).value;
      const password = (container.querySelector('#password') as HTMLInputElement).value;

      loginBtn.disabled = true;
      loginBtn.textContent = 'Giriş yapılıyor...';

      try {
        const res = await api.post('auth/login', { username, password });
        if (res.user.must_change_password) {
          tempUser = res.user;
          isChangingPassword = true;
          render();
        } else {
          onLoginSuccess(res.user);
        }
      } catch (err: any) {
        alertBox.textContent = err.message || 'Kullanıcı adı veya şifre hatalı';
        alertBox.style.display = 'block';
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Giriş Yap';
      }
    });
  }

  render();
}
