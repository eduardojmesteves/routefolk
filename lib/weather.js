// ============================================================
// routefolk — weather.js
// Wrapper around Open-Meteo's forecast API.
// Returns a daily forecast for a given date and location.
// Caches results for 1 hour.
// ============================================================

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_KEY_PREFIX = 'rf:wx:';
const memoryCache = new Map();

// WMO weather codes → label + emoji icon. Compact subset, good enough for the
// trip-planning use case. Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
export const WEATHER_CODES = {
  0:  { label: 'Clear sky',          icon: '☀️' },
  1:  { label: 'Mainly clear',       icon: '🌤️' },
  2:  { label: 'Partly cloudy',      icon: '⛅' },
  3:  { label: 'Overcast',           icon: '☁️' },
  45: { label: 'Fog',                icon: '🌫️' },
  48: { label: 'Rime fog',           icon: '🌫️' },
  51: { label: 'Light drizzle',      icon: '🌦️' },
  53: { label: 'Drizzle',            icon: '🌦️' },
  55: { label: 'Dense drizzle',      icon: '🌧️' },
  56: { label: 'Freezing drizzle',   icon: '🌧️' },
  57: { label: 'Freezing drizzle',   icon: '🌧️' },
  61: { label: 'Light rain',         icon: '🌦️' },
  63: { label: 'Rain',               icon: '🌧️' },
  65: { label: 'Heavy rain',         icon: '🌧️' },
  66: { label: 'Freezing rain',      icon: '🌧️' },
  67: { label: 'Freezing rain',      icon: '🌧️' },
  71: { label: 'Light snow',         icon: '🌨️' },
  73: { label: 'Snow',               icon: '🌨️' },
  75: { label: 'Heavy snow',         icon: '❄️' },
  77: { label: 'Snow grains',        icon: '🌨️' },
  80: { label: 'Rain showers',       icon: '🌦️' },
  81: { label: 'Rain showers',       icon: '🌧️' },
  82: { label: 'Heavy rain showers', icon: '⛈️' },
  85: { label: 'Snow showers',       icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm',       icon: '⛈️' },
  96: { label: 'Thunderstorm + hail',icon: '⛈️' },
  99: { label: 'Thunderstorm + hail',icon: '⛈️' },
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] || { label: 'Unknown', icon: '·' };
}

function cacheKey(lat, lng, date) {
  return `${CACHE_KEY_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)},${date}`;
}

function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, entry.v);
    return entry.v;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  memoryCache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {}
}

/** True if `date` (YYYY-MM-DD) is safely inside Open-Meteo's forecast window.
 *  Keep this conservative: trip dates often sit outside the near forecast range,
 *  and requesting them only produces noisy 400 responses. */
function inForecastWindow(date) {
  if (!date) return false;
  const target = new Date(date + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAhead = Math.floor((target - today) / (24 * 60 * 60 * 1000));
  return daysAhead >= 0 && daysAhead <= 13;
}

/** Fetch the daily forecast for one date at one location.
 *  Returns { date, code, label, icon, tempMin, tempMax, precipMm, precipProb, windKmh }
 *  or null if not available (out of window, fetch failed, etc.).
 *  Never throws. */
export async function fetchDailyForecast(lat, lng, date) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !date) return null;
  if (!inForecastWindow(date)) return null;

  const key = cacheKey(lat, lng, date);
  const cached = readCache(key);
  if (cached !== null) return cached;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'precipitation_probability_max',
    'wind_speed_10m_max',
  ].join(','));
  url.searchParams.set('start_date', date);
  url.searchParams.set('end_date', date);
  url.searchParams.set('timezone', 'auto');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      writeCache(key, null);
      return null;
    }
    const data = await res.json();
    const d = data?.daily;
    if (!d || !Array.isArray(d.time) || !d.time.length) {
      writeCache(key, null);
      return null;
    }
    const meta = describeWeatherCode(d.weather_code?.[0]);
    const value = {
      date: d.time[0],
      code: d.weather_code?.[0] ?? null,
      label: meta.label,
      icon: meta.icon,
      tempMin: d.temperature_2m_min?.[0] ?? null,
      tempMax: d.temperature_2m_max?.[0] ?? null,
      precipMm: d.precipitation_sum?.[0] ?? null,
      precipProb: d.precipitation_probability_max?.[0] ?? null,
      windKmh: d.wind_speed_10m_max?.[0] ?? null,
    };
    writeCache(key, value);
    return value;
  } catch {
    return null;
  }
}

/** Distance between two coordinates in km using the haversine formula. */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Compute up to 3 forecast points for a stage: start, midpoint, end.
 *  Skips midpoint if start and end are very close (< 50 km).
 *  Returns array of { label, lat, lng, forecast } where forecast may be null. */
export async function fetchStageForecasts(stage) {
  const points = [];
  const { start_lat, start_lng, end_lat, end_lng, planned_date } = stage;

  if (typeof start_lat === 'number' && typeof start_lng === 'number') {
    points.push({ label: 'Start', lat: start_lat, lng: start_lng });
  }
  if (typeof end_lat === 'number' && typeof end_lng === 'number') {
    if (typeof start_lat === 'number' && typeof start_lng === 'number') {
      const d = distanceKm(start_lat, start_lng, end_lat, end_lng);
      if (d >= 50) {
        points.push({
          label: 'Midpoint',
          lat: (start_lat + end_lat) / 2,
          lng: (start_lng + end_lng) / 2,
        });
      }
    }
    points.push({ label: 'End', lat: end_lat, lng: end_lng });
  }

  if (!planned_date || !points.length) return [];
  if (!inForecastWindow(planned_date)) return points.map((p) => ({ ...p, forecast: null }));

  const forecasts = await Promise.all(
    points.map(async (p) => ({
      ...p,
      forecast: await fetchDailyForecast(p.lat, p.lng, planned_date),
    }))
  );
  return forecasts;
}
