// ============================================================
// routefolk — components/modal.js
// Modal helper used by app.js forms and confirmation flows.
// ============================================================

import { $ } from '../utils/dom.js';

// ---------- Modal ----------
export function showModal(title, bodyHtml, buttons) {
  let overlay = $('modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" id="modalBox">
        <div class="modal-title" id="modalTitle"></div>
        <div id="modalBody"></div>
        <div class="modal-btns" id="modalBtns"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;

  const btnWrap = $('modalBtns');
  btnWrap.innerHTML = '';
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = `btn ${b.cls || 'btn-secondary'} btn-block`;
    btn.textContent = b.label;
    btn.addEventListener('click', () => b.fn?.());
    btnWrap.appendChild(btn);
  });

  overlay.style.display = 'flex';
}

export function closeModal() {
  const overlay = $('modal');
  if (overlay) overlay.style.display = 'none';
}
