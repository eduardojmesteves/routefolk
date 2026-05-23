// ============================================================
// routefolk — weather-rules.js
// Warning thresholds for the v3 weather panel.
// ============================================================

export const WX_WARN = {
  windKmh: 30,
  gustKmh: 45,
  precipPct: 40,
  tempLo: 5,
  tempHi: 35,
};

export function evaluateWaypoint(w, rules = WX_WARN) {
  const flags = [];

  if (Number(w?.windKmh) >= rules.windKmh) flags.push('wind');
  if (Number(w?.gustKmh) >= rules.gustKmh) flags.push('gust');
  if (Number(w?.precipPct) >= rules.precipPct) flags.push('rain');

  const lo = typeof w?.tempC === 'object' ? Number(w.tempC?.lo) : Number(w?.tempC);
  const hi = typeof w?.tempC === 'object' ? Number(w.tempC?.hi) : Number(w?.tempC);

  if (Number.isFinite(lo) && lo <= rules.tempLo) flags.push('cold');
  if (Number.isFinite(hi) && hi >= rules.tempHi) flags.push('heat');

  return { warn: flags.length > 0, flags };
}
