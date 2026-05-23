// ============================================================
// routefolk — wx-icon.js
// Inline SVG icons for the v3 weather atom.
// ============================================================

import { esc } from '../../utils/dom.js';

const common = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  sun: `<circle cx="12" cy="12" r="3.4"/><path d="M12 2.8v2.1M12 19.1v2.1M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/>`,
  partly: `<path d="M7.2 15.4a4.2 4.2 0 1 1 5.7-5.7"/><path d="M7.8 17.6h8.3a3.1 3.1 0 0 0 .3-6.2 4.5 4.5 0 0 0-8.6 1.4 2.4 2.4 0 0 0 0 4.8Z"/>`,
  cloud: `<path d="M6.8 17.2h9.5a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.7 1.5 2.7 2.7 0 0 0-.1 5.3Z"/>`,
  fog: `<path d="M6.8 13.8h9.5a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.7 1.4 2.6 2.6 0 0 0-.1 5.2Z"/><path d="M4 17h16M6 20h12"/>`,
  rain: `<path d="M6.8 13.7h9.5a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.7 1.4 2.6 2.6 0 0 0-.1 5.2Z"/><path d="M8.5 17.2 7.6 20M12.5 17.2 11.6 20M16.5 17.2 15.6 20"/>`,
  thunder: `<path d="M6.8 13.7h9.5a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.7 1.4 2.6 2.6 0 0 0-.1 5.2Z"/><path d="M12.7 15.4 10.8 19h2.3l-1 3"/>`,
  snow: `<path d="M6.8 13.7h9.5a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.7 1.4 2.6 2.6 0 0 0-.1 5.2Z"/><path d="M9 18.5h.01M12 20h.01M15 18.5h.01"/>`,
  wind: `<path d="M4 9h10.4a2 2 0 1 0-2-2M4 13h14.4a2 2 0 1 1-2 2M4 17h7.5"/>`,
};

export function wxIcon(kind, size = 22, className = '') {
  const safeKind = PATHS[kind] ? kind : 'cloud';
  const safeSize = Number.isFinite(Number(size)) ? Number(size) : 22;
  return `<svg class="${esc(className)}" width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" aria-hidden="true" ${common}>${PATHS[safeKind]}</svg>`;
}
