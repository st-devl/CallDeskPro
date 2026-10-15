import { html, raw } from './html.js';
import { api } from './api.js';
import { icons } from './icons.js';
import { showToast, showConfirm } from './ui.js';
import { renderLoginPage } from './pages/login.js';
import { renderUsersPage } from './pages/users.js';

interface CurrentUser {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'agent';
  must_change_password: boolean;
}

let currentUser: CurrentUser | null = null;
const appEl = document.getElementById('app') as HTMLElement;

// Oturum kontrolü
async function checkAuth(): Promise<boolean> {
  try {
    const res = await api.get('auth/me');
    currentUser = res.user;
    return true;
  } catch {
    currentUser = null;
    return false;
  }
}

// Ana Uygulama Kabuğu (Sidebar + Content)
function renderAppShell(contentRenderer: (container: HTMLElement) => void, activeNav: string) {
  if (!currentUser) {
    window.location.hash = '#/giris';
    return;
  }

  appEl.innerHTML = html`
    <div class="app-layout">
      <!-- Kenar Çubuğu (Sidebar) -->
      <aside class="app-sidebar">
        <div class="sidebar-header">
          ${icons.phone(22)}
          <span class="sidebar-logo">CALL CENTER</span>
        </div>

        <nav class="sidebar-nav">
          ${currentUser.role === 'agent'
            ? html`
                <a href="#/kayitlarim" class="nav-item ${activeNav === 'kayitlarim' ? 'active' : ''}">
                  ${icons.lists(18)} Kayıtlarım
                </a>
              `
            : html`
                <a href="#/kayitlar" class="nav-item ${activeNav === 'kayitlar' ? 'active' : ''}">
                  ${icons.lists(18)} Kayıtlar
                </a>
                <a href="#/listeler" class="nav-item ${activeNav === 'listeler' ? 'active' : ''}">
                  ${icons.filter(18)} Listeler
                </a>
                <a href="#/kullanicilar" class="nav-item ${activeNav === 'kullanicilar' ? 'active' : ''}">
                  ${icons.user(18)} Kullanıcılar
                </a>
                <a href="#/gorusmeler" class="nav-item ${activeNav === 'gorusmeler' ? 'active' : ''}">
                  ${icons.history(18)} Görüşme Kayıtları
                </a>
                <a href="#/ozet" class="nav-item ${activeNav === 'ozet' ? 'active' : ''}">
                  ${icons.summary(18)} Özet & Performans
                </a>
              `}

          <a href="#/ayarlar" class="nav-item ${activeNav === 'ayarlar' ? 'active' : ''}">
            ${icons.settings(18)} Ayarlar
          </a>
        </nav>

        <div class="sidebar-footer">
          <div class="user-profile">
            <div class="user-avatar">${currentUser.full_name.charAt(0).toUpperCase()}</div>
            <div class="user-info">
              <div class="user-name">${currentUser.full_name}</div>
              <div class="user-role">${currentUser.role === 'admin' ? 'Yönetici' : 'Aramacı'}</div>
            </div>
          </div>
          <button type="button" class="btn-icon" id="btn-logout" title="Çıkış Yap">
            ${icons.logout(18)}
          </button>
        </div>
      </aside>

      <!-- Ana İçerik -->
      <main class="app-main">
        <header class="app-header">
          <div class="page-title" id="page-title">
            ${activeNav === 'kullanicilar'
              ? 'Kullanıcı Yönetimi'
              : activeNav === 'kayitlarim'
              ? 'Aramacı Kayıtlarım'
              : activeNav === 'kayitlar'
              ? 'Yönetici Kayıtları'
              : 'CALL CENTER'}
          </div>
          <div>
            <span style="font-size: 0.8125rem; color: var(--text-muted);">
              Hoş geldiniz, <strong>${currentUser.full_name}</strong>
            </span>
          </div>
        </header>

        <div class="app-content" id="app-content"></div>
      </main>
    </div>
  `;

  // Çıkış yap butonu
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    const confirmed = await showConfirm('Çıkış Yap', 'Oturumunuzu kapatmak istediğinize emin misiniz?', 'Çıkış Yap', 'Vazgeç');
    if (!confirmed) return;

    try {
      await api.post('auth/logout');
      currentUser = null;
      showToast('Başarıyla çıkış yapıldı', 'info');
      window.location.hash = '#/giris';
    } catch {
      window.location.hash = '#/giris';
    }
  });

  const contentContainer = document.getElementById('app-content') as HTMLElement;
  contentRenderer(contentContainer);
}

// Router
async function handleRoute() {
  const hash = window.location.hash || '#/';

  if (hash === '#/giris') {
    renderLoginPage(appEl, (user) => {
      currentUser = user;
      const returnHash = sessionStorage.getItem('return_hash');
      sessionStorage.removeItem('return_hash');
      if (returnHash) {
        window.location.hash = returnHash;
      } else {
        window.location.hash = user.role === 'admin' ? '#/kullanicilar' : '#/kayitlarim';
      }
    });
    return;
  }

  // Oturum kontrolü
  if (!currentUser) {
    const isAuthed = await checkAuth();
    if (!isAuthed) {
      window.location.hash = '#/giris';
      return;
    }
  }

  if (currentUser?.must_change_password) {
    window.location.hash = '#/giris';
    return;
  }

  if (hash === '#/' || hash === '') {
    window.location.hash = currentUser?.role === 'admin' ? '#/kullanicilar' : '#/kayitlarim';
    return;
  }

  if (hash === '#/kullanicilar') {
    if (currentUser?.role !== 'admin') {
      window.location.hash = '#/kayitlarim';
      return;
    }
    renderAppShell((container) => {
      renderUsersPage(container, currentUser);
    }, 'kullanicilar');
    return;
  }

  // Henüz sonraki aşamalarda kodlanacak ekranlar için geçici bilgi görünümü
  const routeMap: Record<string, string> = {
    '#/kayitlarim': 'kayitlarim',
    '#/kayitlar': 'kayitlar',
    '#/listeler': 'listeler',
    '#/gorusmeler': 'gorusmeler',
    '#/ozet': 'ozet',
    '#/ayarlar': 'ayarlar'
  };

  const navKey = routeMap[hash] || 'kayitlar';
  renderAppShell((container) => {
    container.innerHTML = html`
      <div class="card" style="text-align: center; padding: 3rem;">
        <h3 style="margin-bottom: 0.5rem;">Bu ekran sonraki aşamada entegre edilecektir.</h3>
        <p style="color: var(--text-muted); font-size: 0.875rem;">
          Aşama 1 kapsamında Temel Güvenlik ve Kullanıcı Yönetimi tamamlanmıştır.
        </p>
      </div>
    `;
  }, navKey);
}

window.addEventListener('hashchange', handleRoute);
handleRoute();
