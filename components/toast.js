// ============================================================
// routefolk — components/toast.js
// Toast notification helper.
// ============================================================

import { $ } from '../utils/dom.js';

// ---------- Toast ----------
let toastTimer = null;
export function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
