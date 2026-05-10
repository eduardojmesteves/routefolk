// ============================================================
// routefolk — geocoding.js
// Wrapper around Open-Meteo's geocoding API.
// Returns { latitude, longitude } or null if no result.
// Caches results in memory + localStorage for 7 days.
// ============================================================

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY_PREFIX = 'rf:geo:';
const memoryCache = new Map();

function cacheKey(name) {
  return CACHE_KEY_PREFIX + name.trim().toLowerCase();
}

function readCache(name) {
  const key = cacheKey(name);
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

function writeCache(name, value) {
  const key = cacheKey(name);
  memoryCache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Quota exceeded or storage disabled — fine, memory cache still works
  }
}

/** Geocode a place name to coordinates.
 *  Returns { latitude, longitude } or null on failure / not found.
 *  Never throws — this is best-effort. */
export async function geocode(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const cached = readCache(trimmed);
  if (cached !== null) return cached;

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      writeCache(trimmed, null);
      return null;
    }
    const data = await res.json();
    const hit = data?.results?.[0];
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') {
      writeCache(trimmed, null);
      return null;
    }
    const value = { latitude: hit.latitude, longitude: hit.longitude };
    writeCache(trimmed, value);
    return value;
  } catch (err) {
    console.warn('Geocode failed:', err);
    return null;
  }
}
