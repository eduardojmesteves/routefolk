// ============================================================
// routefolk — screens/wizards.js
// Backward-compatibility shim. The wizard layer was split into
// screens/wizards/* modules (host renderer + per-domain markup).
// This file re-exports the public surface so existing imports
// (`../screens/wizards.js`) keep working unchanged.
// ============================================================

export * from './wizards/index.js';
