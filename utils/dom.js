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

// Star-rating icon (Roads feature): the exact 5-point path from the Route
// Atlas design mock, used everywhere a star renders — the wizard picker,
// road cards, and live-preview — instead of the font-dependent ★ glyph.
export function starSvg() {
  return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>';
}
