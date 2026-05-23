// @vitest-environment node
/**
 * Tests for screens/render/archive/archive-map-geometry.js.
 *
 * These helpers are pure — they accept plain GPX track records and an
 * STATE-like object and return geometry primitives that the Leaflet
 * and SVG renderers consume. Everything here is testable without a DOM
 * or window.L.
 */
import { describe, expect, it } from 'vitest';

import {
  bbox,
  collectCompletedGpxTracks,
  errorMessage,
  escapeHtml,
  normalizePoint,
  pointsForTrack,
  projectPointsToSvg,
  trackLabel,
} from '../../screens/render/archive/archive-map-geometry.js';

// ----------------------------------------------------------------------
// normalizePoint
// ----------------------------------------------------------------------

describe('normalizePoint', () => {
  it('returns [lat, lng] from a well-formed array', () => {
    expect(normalizePoint([38.7, -9.1])).toEqual([38.7, -9.1]);
  });

  it('swaps obvious [lng, lat] arrays based on latitude bounds', () => {
    // 150 cannot be a latitude, so the array is treated as [lng, lat].
    expect(normalizePoint([150, 38.7])).toEqual([38.7, 150]);
  });

  it('reads lat/lng object form', () => {
    expect(normalizePoint({ lat: 41, lng: -8 })).toEqual([41, -8]);
  });

  it('reads latitude/longitude aliases', () => {
    expect(normalizePoint({ latitude: 41, longitude: -8 })).toEqual([41, -8]);
  });

  it('reads x/y aliases', () => {
    expect(normalizePoint({ y: 41, x: -8 })).toEqual([41, -8]);
  });

  it('reads lon alias', () => {
    expect(normalizePoint({ lat: 41, lon: -8 })).toEqual([41, -8]);
  });

  it('returns null for non-finite values', () => {
    expect(normalizePoint([NaN, 0])).toBeNull();
    expect(normalizePoint({ lat: 'banana', lng: 0 })).toBeNull();
  });

  it('returns null for object form with out-of-range coordinates', () => {
    expect(normalizePoint({ lat: 95, lng: 0 })).toBeNull();
    expect(normalizePoint({ lat: 0, lng: 200 })).toBeNull();
  });

  it('returns null for nullish or non-object inputs', () => {
    expect(normalizePoint(null)).toBeNull();
    expect(normalizePoint(undefined)).toBeNull();
    expect(normalizePoint('38.7,-9.1')).toBeNull();
  });
});

// ----------------------------------------------------------------------
// pointsForTrack
// ----------------------------------------------------------------------

describe('pointsForTrack', () => {
  it('returns [] when the geometry entry is missing', () => {
    expect(pointsForTrack({ id: 't1' }, {})).toEqual([]);
  });

  it('returns [] when the geometry is still loading', () => {
    expect(pointsForTrack({ id: 't1' }, { t1: 'loading' })).toEqual([]);
  });

  it('returns [] for an empty geometry array (track without geometry)', () => {
    expect(pointsForTrack({ id: 't1' }, { t1: [] })).toEqual([]);
  });

  it('unwraps both the bare-array and { points } shapes', () => {
    const expected = [[1, 2]];
    expect(pointsForTrack({ id: 't1' }, { t1: [{ lat: 1, lng: 2 }] })).toEqual(expected);
    expect(pointsForTrack({ id: 't2' }, { t2: { points: [{ lat: 1, lng: 2 }] } })).toEqual(
      expected,
    );
  });

  it('drops points that fail normalization', () => {
    const points = pointsForTrack(
      { id: 't1' },
      { t1: [{ lat: 1, lng: 2 }, { lat: 'bad', lng: 0 }, null, { lat: 3, lng: 4 }] },
    );
    expect(points).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

// ----------------------------------------------------------------------
// collectCompletedGpxTracks
// ----------------------------------------------------------------------

describe('collectCompletedGpxTracks', () => {
  it('returns [] when there are no completed trips', () => {
    const state = {
      trips: [{ id: 'a', status: 'planned' }],
      gpxByTrip: { a: [{ id: 'tr1' }] },
    };
    expect(collectCompletedGpxTracks(state)).toEqual([]);
  });

  it('returns [] when completed trips have no GPX tracks', () => {
    const state = {
      trips: [{ id: 'a', status: 'completed' }],
      gpxByTrip: {},
    };
    expect(collectCompletedGpxTracks(state)).toEqual([]);
  });

  it('tags tracks with trip_id when missing', () => {
    const state = {
      trips: [
        { id: 'a', status: 'completed' },
        { id: 'b', status: 'cancelled' },
      ],
      gpxByTrip: {
        a: [{ id: 'tr1' }, { id: 'tr2', trip_id: 'override' }],
        b: [{ id: 'tr3' }],
      },
    };
    const tracks = collectCompletedGpxTracks(state);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ id: 'tr1', trip_id: 'a' });
    expect(tracks[1]).toMatchObject({ id: 'tr2', trip_id: 'override' });
  });

  it('ignores non-array entries in gpxByTrip', () => {
    const state = {
      trips: [{ id: 'a', status: 'completed' }],
      gpxByTrip: { a: null },
    };
    expect(collectCompletedGpxTracks(state)).toEqual([]);
  });

  it('tolerates missing gpxByTrip', () => {
    const state = { trips: [{ id: 'a', status: 'completed' }] };
    expect(collectCompletedGpxTracks(state)).toEqual([]);
  });
});

// ----------------------------------------------------------------------
// bbox
// ----------------------------------------------------------------------

describe('bbox', () => {
  it('returns null for an empty list', () => {
    expect(bbox([])).toBeNull();
    expect(bbox(null)).toBeNull();
  });

  it('computes [minLat, maxLat, minLng, maxLng]', () => {
    const points = [
      [38.7, -9.1],
      [41.2, -8.6],
      [40.0, -7.5],
    ];
    expect(bbox(points)).toEqual([38.7, 41.2, -9.1, -7.5]);
  });

  it('handles a single point', () => {
    expect(bbox([[1, 2]])).toEqual([1, 1, 2, 2]);
  });
});

// ----------------------------------------------------------------------
// projectPointsToSvg
// ----------------------------------------------------------------------

describe('projectPointsToSvg', () => {
  it('projects the bbox corners to the padded viewBox edges', () => {
    const box = [0, 10, 0, 10];
    const result = projectPointsToSvg(
      [
        [10, 0],
        [0, 10],
      ],
      box,
      100,
      100,
      10,
    );
    // (lat=10, lng=0) → top-left of inner padded box → x=10, y=10
    // (lat=0, lng=10) → bottom-right → x=90, y=90
    expect(result).toBe('10.0,10.0 90.0,90.0');
  });

  it('inverts latitude so north ends up at the top', () => {
    const box = [0, 10, 0, 10];
    const top = projectPointsToSvg([[10, 5]], box, 100, 100, 0);
    const bottom = projectPointsToSvg([[0, 5]], box, 100, 100, 0);
    const [, topY] = top.split(',').map(Number);
    const [, bottomY] = bottom.split(',').map(Number);
    expect(topY).toBeLessThan(bottomY);
  });

  it('returns an empty string for an empty list', () => {
    expect(projectPointsToSvg([], [0, 1, 0, 1], 100, 100, 10)).toBe('');
  });
});

// ----------------------------------------------------------------------
// trackLabel
// ----------------------------------------------------------------------

describe('trackLabel', () => {
  it('strips directory components from file_path', () => {
    expect(trackLabel({ file_path: 'uploads/user-1/route.gpx' })).toBe('route.gpx');
  });

  it('falls back to filename when file_path is missing', () => {
    expect(trackLabel({ filename: 'route.gpx' })).toBe('route.gpx');
  });

  it('falls back to "GPX route" when nothing is set', () => {
    expect(trackLabel({})).toBe('GPX route');
  });
});

// ----------------------------------------------------------------------
// escapeHtml
// ----------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes the dangerous quartet', () => {
    expect(escapeHtml('<a href="x">&"</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&quot;&lt;/a&gt;');
  });

  it('coerces nullish to empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

// ----------------------------------------------------------------------
// errorMessage
// ----------------------------------------------------------------------

describe('errorMessage', () => {
  it('returns the placeholder when no error is passed', () => {
    expect(errorMessage(null)).toBe('No drawable GPX geometry yet.');
    expect(errorMessage(undefined)).toBe('No drawable GPX geometry yet.');
  });

  it('uses Error#message for Error instances', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('coerces non-Errors via String()', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
  });
});

// ----------------------------------------------------------------------
// End-to-end: a small state through to a bbox
// ----------------------------------------------------------------------

describe('archive map states (integration)', () => {
  it('no completed GPX tracks → controller can render nothing', () => {
    const state = {
      trips: [{ id: 'a', status: 'planned' }],
      gpxByTrip: { a: [{ id: 'tr1' }] },
      gpxGeometryByTrack: {},
    };
    const tracks = collectCompletedGpxTracks(state);
    expect(tracks).toEqual([]);
    const allPoints = tracks.flatMap((t) => pointsForTrack(t, state.gpxGeometryByTrack));
    expect(bbox(allPoints)).toBeNull();
  });

  it('completed tracks without geometry → skipped', () => {
    const state = {
      trips: [{ id: 'a', status: 'completed' }],
      gpxByTrip: { a: [{ id: 'tr1' }, { id: 'tr2' }] },
      gpxGeometryByTrack: { tr1: 'loading', tr2: [] },
    };
    const tracks = collectCompletedGpxTracks(state);
    expect(tracks).toHaveLength(2);
    const drawable = tracks.filter(
      (t) => pointsForTrack(t, state.gpxGeometryByTrack).length >= 2,
    );
    expect(drawable).toEqual([]);
  });

  it('valid GPX geometry → bbox computed correctly and non-degenerate', () => {
    const state = {
      trips: [{ id: 'a', status: 'completed' }],
      gpxByTrip: { a: [{ id: 'tr1' }] },
      gpxGeometryByTrack: {
        tr1: [
          { lat: 38.7, lng: -9.1 },
          { lat: 41.2, lng: -8.6 },
          { lat: 40.0, lng: -7.5 },
        ],
      },
    };
    const tracks = collectCompletedGpxTracks(state);
    const points = tracks.flatMap((t) => pointsForTrack(t, state.gpxGeometryByTrack));
    expect(points).toHaveLength(3);
    const box = bbox(points);
    expect(box).toEqual([38.7, 41.2, -9.1, -7.5]);
    // Non-degenerate: lat and lng spans are both positive.
    expect(box[1] - box[0]).toBeGreaterThan(0);
    expect(box[3] - box[2]).toBeGreaterThan(0);
  });
});
