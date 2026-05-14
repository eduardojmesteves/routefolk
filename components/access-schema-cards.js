// ============================================================
// routefolk — access-schema-cards.js
// Access and schema error card renderers.
// ============================================================

import { esc } from '../utils/dom.js';

export function accessErrorHtml(accessError = '') {
  return `
    <section class="hero-card empty-state">
      <div class="empty-title">Access pending</div>
      <div class="empty-sub">${esc(accessError || 'Your account is not active for this app yet.')}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;">
        <button class="btn btn-primary btn-sm" id="retryAccessBtn">Retry access check</button>
        <button class="btn btn-secondary btn-sm" id="signOutBtn">Sign out</button>
      </div>
    </section>
  `;
}

export function schemaErrorHtml(schemaError = '', expectedSchemaVersion = '') {
  return `
    <section class="hero-card empty-state">
      <div class="empty-title">Database update required</div>
      <div class="empty-sub">${esc(schemaError || 'The app database is not ready for this version.')}</div>
      <div class="form-help" style="max-width:620px;margin:12px auto 0;">
        Apply the latest SQL migrations in Supabase, then retry. Expected schema version: <strong>${esc(expectedSchemaVersion || 'unknown')}</strong>.
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;">
        <button class="btn btn-primary btn-sm" id="retrySchemaBtn">Retry schema check</button>
        <button class="btn btn-secondary btn-sm" id="signOutBtn">Sign out</button>
      </div>
    </section>
  `;
}
