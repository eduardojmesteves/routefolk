// ============================================================
// routefolk — utils/dom.js
// Small DOM and HTML escaping helpers.
// ============================================================

export function $(id) { return document.getElementById(id); }

export function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[ch]));
}

export function attr(name, value) {
  return value ? ` ${name}="${esc(value)}"` : '';
}

export function boolAttr(name, condition) {
  return condition ? ` ${name}` : '';
}
