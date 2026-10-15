import { html, raw } from './html.js';
import { icons } from './icons.js';

/**
 * CALL CENTER - Ortak UI Yardımcıları (Toast, Modal, Onay)
 */

// Toast Bildirimi
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = html`
    <div class="toast-icon">
      ${type === 'success' ? icons.check(18) : type === 'error' ? icons.alert(18) : icons.phone(18)}
    </div>
    <div class="toast-message">${message}</div>
    <button type="button" class="toast-close" aria-label="Kapat">
      ${icons.close(16)}
    </button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const remove = () => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 200);
  };

  closeBtn?.addEventListener('click', remove);
  setTimeout(remove, duration);

  container.appendChild(toast);
}

// Onay Penceresi (Confirm Modal)
export function showConfirm(
  title: string,
  message: string,
  confirmText = 'Evet, Onayla',
  cancelText = 'Vazgeç',
  isDanger = false
): Promise<boolean> {
  return new Promise((resolve) => {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    modalBackdrop.innerHTML = html`
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button type="button" class="btn-icon modal-close-btn" aria-label="Kapat">
            ${icons.close(18)}
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-message">${message}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary btn-cancel">${cancelText}</button>
          <button type="button" class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} btn-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      modalBackdrop.remove();
    };

    const confirmBtn = modalBackdrop.querySelector('.btn-confirm') as HTMLButtonElement;
    const cancelBtn = modalBackdrop.querySelector('.btn-cancel') as HTMLButtonElement;
    const closeBtn = modalBackdrop.querySelector('.modal-close-btn') as HTMLButtonElement;

    confirmBtn.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    closeBtn.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        cleanup();
        resolve(false);
      }
    });

    document.body.appendChild(modalBackdrop);
    confirmBtn.focus();
  });
}
