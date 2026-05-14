// ============================================================
// routefolk — components/feedback.js
// Shared empty/error state HTML helpers.
// Phase 3: adds Ink & Rust empty/error card classes.
// ============================================================

import { esc } from '../utils/dom.js';

export function signedOutState(title, subtitle) {
  return `
    <div class="empty-state rf-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h12"/>
      </svg>
      <div class="empty-title">${esc(title)}</div>
      <div class="empty-sub">${esc(subtitle || '')}</div>
      <button class="btn btn-primary" id="emptySignInBtn" style="margin-top:14px;">Sign in with Google</button>
    </div>
  `;
}

export function errorCard(message, retryId) {
  return `
    <div class="card rf-card rf-error-card">
      <div class="card-title rf-error-title">Error</div>
      <div class="rf-error-body">${esc(message)}</div>
      <button class="btn btn-secondary btn-block" style="margin-top:12px;" id="${esc(retryId)}">Retry</button>
    </div>
  `;
}
