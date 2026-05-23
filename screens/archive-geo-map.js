// ============================================================
// routefolk — archive-geo-map.js (backward-compatibility shim)
//
// The implementation now lives under screens/render/archive/. This
// file is kept so index.html and the service worker shell can keep
// referencing it without coordination. Importing it pulls in the
// controller, which wires up its own event listeners on load.
// ============================================================

export { refreshArchiveMap } from './render/archive/archive-map-controller.js';
