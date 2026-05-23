// ============================================================
// routefolk — weather.js
// Open-Meteo forecast provider for the v3 stage weather panel.
// ============================================================

import { evaluateWaypoint } from './weather-rules.js';

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_KEY_PREFIX = 'rf:wx:v4:';
const FORECAST_DAYS = 16;
const RIDE_WINDOW = { start: '09:30', end: '17:00' };
const memoryCache = new Map();

export const WEATHER_CODES = {
  0: { label: 'Clear sky', kind: 'sun' },
  1: { label: 'Mainly clear', kind: 'sun' },
  2: { label: 'Partly cloudy', kind: 'partly' },
  3: { label: 'Overcast', kind: 'cloud' },
  45: { label: 'Fog', kind: 'fog' },
  48: { label: 'Rime fog', kind: 'fog' },
  51: { label: 'Light drizzle', kind: 'rain' },
  53: { label: 'Drizzle', kind: 'rain' },
  55: { label: 'Dense drizzle', kind: 'rain' },
  56: { label: 'Freezing drizzle', kind: 'rain' },
  57: { label: 'Freezing drizzle', kind: 'rain' },
  61: { label: 'Light rain', kind: 'rain' },
  63: { label: 'Rain', kind: 'rain' },
  65: { label: 'Heavy rain', kind: 'rain' },
  66: { label: 'Freezing rain', kind: 'rain' },
  67: { label: 'Freezing rain', kind: 'rain' },
  71: { label: 'Light snow', kind: 'snow' },
  73: { label: 'Snow', kind: 'snow' },
  75: { label: 'Heavy snow', kind: 'snow' },
  77: { label: 'Snow grains', kind: 'snow' },
  80: { label: 'Rain showers', kind: 'rain' },
  81: { label: 'Rain showers', kind: 'rain' },
  82: { label: 'Heavy rain showers', kind: 'thunder' },
  85: { label: 'Snow showers', kind: 'snow' },
  86: { label: 'Heavy snow showers', kind: 'snow' },
  95: { label: 'Thunderstorm', kind: 'thunder' },
  96: { label: 'Thunderstorm + hail', kind: 'thunder' },
  99: { label: 'Thunderstorm + hail', kind: 'thunder' },
};

export function mapWmoToKind(code) {
  return WEATHER_CODES[Number(code)]?.kind || 'cloud';
}

export function describeWeatherCode(code) {
  const meta = WEATHER_CODES[Number(code)] || { label: 'Unknown', kind: 'cloud' };
  return { ...meta, icon: meta.kind };
}

function numericCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normaliseDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function utcDate(date) {
  const safe = normaliseDate(date);
  if (!safe) return null;
  const [year, month, day] = safe.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function cacheKey(stage) {
  return `${CACHE_KEY_PREFIX}${stage?.id || 'stage'}:${stage?.planned_date || ''}:${stage?.start_lat || ''},${stage?.start_lng || ''}:${stage?.end_lat || ''},${stage?.end_lng || ''}`;
}

function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.t > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return undefined;
    }
    memoryCache.set(key, entry.v ?? null);
    return entry.v ?? null;
  } catch {
    return undefined;
  }
}

function writeCache(key, value) {
  memoryCache.set(key, value ?? null);
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value ?? null }));
  } catch {}
}

function inForecastWindow(date) {
  const target = utcDate(date);
  if (!target) return false;
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const daysAhead = Math.floor((target.getTime() - today.getTime()) / 86400000);
  return daysAhead >= 0 && daysAhead < FORECAST_DAYS;
}

function valueAt(values, index) {
  return Array.isArray(values) && index >= 0 ? values[index] ?? null : null;
}

function compactNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMaybe(value) {
  const number = compactNumber(value);
  return number == null ? null : Math.round(number);
}

function pointFromStage(stage, mark) {
  if (mark === 'start') {
    const lat = numericCoord(stage?.start_lat);
    const lng = numericCoord(stage?.start_lng);
    return lat !== null && lng !== null ? { mark, lat, lng } : null;
  }
  if (mark === 'end') {
    const lat = numericCoord(stage?.end_lat);
    const lng = numericCoord(stage?.end_lng);
    return lat !== null && lng !== null ? { mark, lat, lng } : null;
  }
  const start = pointFromStage(stage, 'start');
  const end = pointFromStage(stage, 'end');
  if (!start && !end) return null;
  if (!start) return { mark, lat: end.lat, lng: end.lng };
  if (!end) return { mark, lat: start.lat, lng: start.lng };
  return { mark, lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
}

export function computeWeatherWaypoints(stage) {
  return ['start', 'mid', 'end'].map((mark) => pointFromStage(stage, mark)).filter(Boolean);
}

export function bearingDeg(start, end) {
  if (!start || !end) return null;
  const lat1 = numericCoord(start.lat);
  const lng1 = numericCoord(start.lng);
  const lat2 = numericCoord(end.lat);
  const lng2 = numericCoord(end.lng);
  if ([lat1, lng1, lat2, lng2].some((v) => v === null)) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda = toRad(lng2 - lng1);
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function waypointFromDaily(point, daily, index) {
  const code = valueAt(daily.weather_code, index);
  const raw = {
    mark: point.mark,
    kind: mapWmoToKind(code),
    tempC: {
      lo: roundMaybe(valueAt(daily.temperature_2m_min, index)),
      hi: roundMaybe(valueAt(daily.temperature_2m_max, index)),
    },
    windKmh: roundMaybe(valueAt(daily.wind_speed_10m_max, index)),
    windDeg: roundMaybe(valueAt(daily.wind_direction_10m_dominant, index)),
    gustKmh: roundMaybe(valueAt(daily.wind_gusts_10m_max, index)),
    precipPct: roundMaybe(valueAt(daily.precipitation_probability_max, index)),
  };
  return { ...raw, ...evaluateWaypoint(raw) };
}

async function fetchDailyForecastForPoint(point, date) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(point.lat));
  url.searchParams.set('longitude', String(point.lng));
  url.searchParams.set('forecast_days', String(FORECAST_DAYS));
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'wind_speed_10m_max',
    'wind_direction_10m_dominant',
    'wind_gusts_10m_max',
  ].join(','));
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo failed: ${res.status}`);
  const data = await res.json();
  const d = data?.daily;
  const index = Array.isArray(d?.time) ? d.time.indexOf(date) : -1;
  if (!d || index === -1) return null;
  return waypointFromDaily(point, d, index);
}

export async function forecastForStage(stage) {
  const plannedDate = normaliseDate(stage?.planned_date);
  const points = computeWeatherWaypoints(stage);
  if (!plannedDate || !points.length) return null;
  if (!inForecastWindow(plannedDate)) return null;

  const key = cacheKey(stage);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  try {
    const waypoints = (await Promise.all(points.map((point) => fetchDailyForecastForPoint(point, plannedDate)))).filter(Boolean);
    if (!waypoints.length) {
      writeCache(key, null);
      return null;
    }
    const start = points.find((point) => point.mark === 'start') || points[0];
    const end = points.find((point) => point.mark === 'end') || points[points.length - 1];
    const value = {
      provider: 'open-meteo',
      fetchedAt: new Date().toISOString(),
      rideWindow: RIDE_WINDOW,
      headingDeg: bearingDeg(start, end),
      waypoints,
    };
    writeCache(key, value);
    return value;
  } catch (error) {
    console.warn('[routefolk weather] Forecast request failed', error);
    writeCache(key, null);
    return null;
  }
}

export async function fetchDailyForecast(lat, lng, date) {
  const latitude = numericCoord(lat);
  const longitude = numericCoord(lng);
  const safeDate = normaliseDate(date);
  if (latitude === null || longitude === null || !safeDate) return null;
  const result = await fetchDailyForecastForPoint({ mark: 'start', lat: latitude, lng: longitude }, safeDate).catch(() => null);
  if (!result) return null;
  return {
    date: safeDate,
    code: null,
    label: describeWeatherCode(null).label,
    icon: result.kind,
    tempMin: result.tempC?.lo ?? null,
    tempMax: result.tempC?.hi ?? null,
    precipProb: result.precipPct,
    windKmh: result.windKmh,
  };
}

export async function fetchStageForecasts(stage) {
  return forecastForStage(stage);
}
