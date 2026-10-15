import { html, raw } from './html.js';
import { api } from './api.js';
import { icons } from './icons.js';
import { showToast, showConfirm } from './ui.js';
import { renderLoginPage } from './pages/login.js';
import { renderUsersPage } from './pages/users.js';
import { renderRecordsPage } from './pages/records.js';
import { renderAdminRecordsPage } from './pages/admin-records.js';
import { renderListsPage } from './pages/lists.js';
import { renderCallsPage } from './pages/calls.js';
import { renderSummaryPage } from './pages/summary.js';
import { renderSettingsPage } from './pages/settings.js';

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

  const isCollapsed = localStorage.getItem('cc_sidebar_collapsed') === 'true';

  appEl.innerHTML = html`
    <div class="app-layout">
      <!-- Kenar Çubuğu (Sidebar) -->
      <aside class="app-sidebar ${isCollapsed ? 'collapsed' : ''}" id="app-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand">
            ${icons.phone(20)}
            <span class="sidebar-logo">CALL CENTER</span>
          </div>
          <button type="button" class="btn-sidebar-toggle" id="btn-sidebar-toggle" title="${isCollapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}">
            ${isCollapsed ? icons.chevronRight(18) : icons.chevronLeft(18)}
          </button>
        </div>

        <nav class="sidebar-nav">
          ${currentUser.role === 'agent'
            ? html`
                <a href="#/kayitlarim" class="nav-item ${activeNav === 'kayitlarim' ? 'active' : ''}" title="Kayıtlarım">
                  ${icons.lists(18)} <span class="nav-text">Kayıtlarım</span>
                </a>
              `
            : html`
                <a href="#/kayitlar" class="nav-item ${activeNav === 'kayitlar' ? 'active' : ''}" title="Kayıtlar">
                  ${icons.lists(18)} <span class="nav-text">Kayıtlar</span>
                </a>
                <a href="#/listeler" class="nav-item ${activeNav === 'listeler' ? 'active' : ''}" title="Listeler">
                  ${icons.filter(18)} <span class="nav-text">Listeler</span>
                </a>
                <a href="#/kullanicilar" class="nav-item ${activeNav === 'kullanicilar' ? 'active' : ''}" title="Kullanıcılar">
                  ${icons.user(18)} <span class="nav-text">Kullanıcılar</span>
                </a>
                <a href="#/gorusmeler" class="nav-item ${activeNav === 'gorusmeler' ? 'active' : ''}" title="Görüşme Kayıtları">
                  ${icons.history(18)} <span class="nav-text">Görüşme Kayıtları</span>
                </a>
                <a href="#/ozet" class="nav-item ${activeNav === 'ozet' ? 'active' : ''}" title="Özet & Performans">
                  ${icons.summary(18)} <span class="nav-text">Özet & Performans</span>
                </a>
              `}

          <a href="#/ayarlar" class="nav-item ${activeNav === 'ayarlar' ? 'active' : ''}" title="Ayarlar">
            ${icons.settings(18)} <span class="nav-text">Ayarlar</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <div class="user-profile" title="${currentUser.full_name} (${currentUser.role === 'admin' ? 'Yönetici' : 'Aramacı'})">
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

  // Kenar çubuğu daralt/genişlet butonu
  const sidebarEl = document.getElementById('app-sidebar');
  const toggleBtn = document.getElementById('btn-sidebar-toggle');
  toggleBtn?.addEventListener('click', () => {
    const collapsed = sidebarEl?.classList.toggle('collapsed');
    localStorage.setItem('cc_sidebar_collapsed', collapsed ? 'true' : 'false');
    if (toggleBtn) {
      toggleBtn.innerHTML = (collapsed ? icons.chevronRight(18) : icons.chevronLeft(18)) as any;
      toggleBtn.title = collapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt';
    }
  });

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
    window.location.hash = currentUser?.role === 'admin' ? '#/kayitlar' : '#/kayitlarim';
    return;
  }

  if (hash.startsWith('#/kayitlarim') || (currentUser?.role === 'agent' && hash.startsWith('#/kayitlar'))) {
    renderAppShell((container) => {
      renderRecordsPage(container, currentUser);
    }, 'kayitlarim');
    return;
  }

  if (hash.startsWith('#/kayitlar')) {
    if (currentUser?.role !== 'admin') {
      window.location.hash = '#/kayitlarim';
      return;
    }
    renderAppShell((container) => {
      renderAdminRecordsPage(container, currentUser);
    }, 'kayitlar');
    return;
  }

  if (hash.startsWith('#/listeler')) {
    if (currentUser?.role !== 'admin') {
      window.location.hash = '#/kayitlarim';
      return;
    }
    renderAppShell((container) => {
      renderListsPage(container, currentUser);
    }, 'listeler');
    return;
  }

  if (hash.startsWith('#/gorusmeler')) {
    if (currentUser?.role !== 'admin') {
      window.location.hash = '#/kayitlarim';
      return;
    }
    renderAppShell((container) => {
      renderCallsPage(container, currentUser);
    }, 'gorusmeler');
    return;
  }

  if (hash.startsWith('#/ozet')) {
    if (currentUser?.role !== 'admin') {
      window.location.hash = '#/kayitlarim';
      return;
    }
    renderAppShell((container) => {
      renderSummaryPage(container, currentUser);
    }, 'ozet');
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

  if (hash === '#/ayarlar') {
    renderAppShell((container) => {
      renderSettingsPage(container, currentUser);
    }, 'ayarlar');
    return;
  }

  window.location.hash = currentUser?.role === 'admin' ? '#/kayitlar' : '#/kayitlarim';
}

window.addEventListener('hashchange', handleRoute);
handleRoute();
