// ============================================================
// routefolk — app-shell.js
// Shell/nav helpers for Claude Design UI reset.
// ============================================================

import { STATE } from '../state/app-state.js';
import { $ } from '../utils/dom.js';

const NAV_ITEMS = [
  { key: 'trips', label: 'Trips' },
  { key: 'archive', label: 'Archive' },
  { key: 'account', label: 'You' },
];

export function offlineBannerHtml() {
  if (STATE.isOnline !== false) return '';
  return `
    <div class="offline-banner rf-offline-banner" role="status">
      <span class="rf-offline-stamp">Offline</span>
      <span>You can view cached content, but changes are disabled until you reconnect.</span>
    </div>
  `;
}

export function renderHeader() {
  // No-op. The Claude Design shell has no static top header.
}

export function renderNav() {
  const nav = $('nav');
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS.map((item) => {
    const active = STATE.tab === item.key;
    return `
      <button class="rf-tab ${active ? 'is-active active' : ''}" data-tab="${item.key}" role="tab" aria-selected="${active ? 'true' : 'false'}" aria-current="${active ? 'page' : 'false'}" type="button">
        <span class="rf-tab__bar" aria-hidden="true"></span>
        <span class="rf-tab__label">${item.label}</span>
      </button>
    `;
  }).join('');
}

export function bindNav(onNavigate) {
  const nav = $('nav');
  if (!nav) return;
  nav.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const btn = target?.closest('[data-tab]');
    if (!btn || !nav.contains(btn)) return;
    onNavigate?.(btn.dataset.tab);
  });
}
