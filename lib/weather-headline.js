// ============================================================
// routefolk — weather-headline.js
// One-line generated warning copy for the weather panel.
// ============================================================

const PRIORITY = ['gust', 'wind', 'rain', 'heat', 'cold'];

function firstWarn(wx) {
  const waypoints = Array.isArray(wx?.waypoints) ? wx.waypoints : [];
  for (const flag of PRIORITY) {
    const waypoint = waypoints.find((candidate) => Array.isArray(candidate?.flags) && candidate.flags.includes(flag));
    if (waypoint) return { flag, waypoint };
  }
  return null;
}

function rounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

export function weatherHeadline(wx) {
  const picked = firstWarn(wx);
  if (!picked) return null;

  const { flag, waypoint } = picked;
  if (flag === 'gust') {
    const gust = rounded(waypoint.gustKmh);
    return gust == null
      ? 'Gusts pick up around midday.'
      : `Crosswind picks up around midday — gusts ${gust} km/h.`;
  }
  if (flag === 'wind') {
    const wind = rounded(waypoint.windKmh);
    return wind == null
      ? 'Wind picks up around midday.'
      : `Wind picks up around midday — ${wind} km/h.`;
  }
  if (flag === 'rain') {
    const rain = rounded(waypoint.precipPct);
    return rain == null
      ? 'Rain risk rises around midday.'
      : `Rain risk rises around midday — ${rain}% chance.`;
  }
  if (flag === 'heat') {
    const temp = typeof waypoint.tempC === 'object' ? rounded(waypoint.tempC?.hi) : rounded(waypoint.tempC);
    return temp == null
      ? 'Heat risk builds around midday.'
      : `Heat risk builds around midday — ${temp}°C.`;
  }
  if (flag === 'cold') {
    const temp = typeof waypoint.tempC === 'object' ? rounded(waypoint.tempC?.lo) : rounded(waypoint.tempC);
    return temp == null
      ? 'Cold conditions are possible around midday.'
      : `Cold conditions are possible around midday — ${temp}°C.`;
  }
  return null;
}
