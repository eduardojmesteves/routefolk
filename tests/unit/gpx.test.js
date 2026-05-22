// @vitest-environment jsdom
/**
 * Tests for pure functions in lib/gpx.js.
 *
 * The module imports lib/supabase.js (CDN-based), so we mock it.
 * We test the exported pure functions: parseGpxText, geometryFromGpxTrackRecord,
 * and trackFileName.
 *
 * Note: safeFileName and normalizeStoredPoints are not exported — we test their
 * effects indirectly via the exported functions that call them.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }));

const { parseGpxText, geometryFromGpxTrackRecord, trackFileName } = await import('../../lib/gpx.js');

// ============================================================
// Fixtures
// ============================================================

// Minimal valid GPX with 3 track points and timestamps
const VALID_GPX_TRKPT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="38.7169" lon="-9.1399">
        <time>2024-06-01T08:00:00Z</time>
      </trkpt>
      <trkpt lat="38.7200" lon="-9.1350">
        <time>2024-06-01T08:30:00Z</time>
      </trkpt>
      <trkpt lat="38.7250" lon="-9.1300">
        <time>2024-06-01T09:00:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

// Valid GPX using route points (rtept)
const VALID_GPX_RTEPT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <rte>
    <rtept lat="41.1579" lon="-8.6291"/>
    <rtept lat="41.1600" lon="-8.6200"/>
  </rte>
</gpx>`;

// GPX with no points at all
const EMPTY_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><trkseg></trkseg></trk>
</gpx>`;

// Invalid XML (not well-formed)
const INVALID_XML = `<gpx><trk><trkseg><trkpt lat="38.7" lon="-9.1"></trkpt>`;

// GPX with out-of-range coordinates (should be filtered out)
const INVALID_COORDS_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="200.0" lon="-9.1"/>
      <trkpt lat="-100.0" lon="200.0"/>
    </trkseg>
  </trk>
</gpx>`;

// ============================================================
// parseGpxText
// ============================================================
describe('parseGpxText', () => {
  it('parses track points from a valid GPX (trkpt)', () => {
    const result = parseGpxText(VALID_GPX_TRKPT);
    expect(result.points).toHaveLength(3);
    expect(result.points[0]).toMatchObject({ lat: 38.7169, lng: -9.1399 });
  });

  it('parses route points from a valid GPX (rtept)', () => {
    const result = parseGpxText(VALID_GPX_RTEPT);
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({ lat: 41.1579, lng: -8.6291 });
  });

  it('returns empty points array for GPX with no track/route points', () => {
    const result = parseGpxText(EMPTY_GPX);
    expect(result.points).toHaveLength(0);
  });

  it('throws an error for invalid XML', () => {
    // jsdom DOMParser returns parsererror for malformed XML
    expect(() => parseGpxText(INVALID_XML)).toThrow('This GPX file is not valid XML.');
  });

  it('throws when passed empty string (treated as invalid XML)', () => {
    // DOMParser on empty string in jsdom returns parsererror
    expect(() => parseGpxText('')).toThrow('This GPX file is not valid XML.');
  });

  it('filters out points with out-of-range coordinates', () => {
    const result = parseGpxText(INVALID_COORDS_GPX);
    expect(result.points).toHaveLength(0);
  });

  it('computes distance_km approximately for known points', () => {
    // Two points ~5.6 km apart (Lisbon area)
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
      <trkpt lat="38.7169" lon="-9.1399"/>
      <trkpt lat="38.7669" lon="-9.1399"/>
    </trkseg></trk></gpx>`;
    const result = parseGpxText(gpx);
    // ~5.5 km north (0.05 degrees lat ≈ 5.56 km)
    expect(result.distance_km).toBeCloseTo(5.56, 0);
  });

  it('returns null distance for no usable points', () => {
    const result = parseGpxText(EMPTY_GPX);
    expect(result.distance_km).toBeNull();
  });

  it('computes bbox for valid points', () => {
    const result = parseGpxText(VALID_GPX_TRKPT);
    expect(result.bbox).not.toBeNull();
    expect(result.bbox).toHaveProperty('minLat');
    expect(result.bbox).toHaveProperty('maxLat');
    expect(result.bbox).toHaveProperty('minLng');
    expect(result.bbox).toHaveProperty('maxLng');
    expect(result.bbox.minLat).toBeLessThan(result.bbox.maxLat);
    expect(result.bbox.minLng).toBeLessThan(result.bbox.maxLng);
  });

  it('returns null bbox for no usable points', () => {
    const result = parseGpxText(EMPTY_GPX);
    expect(result.bbox).toBeNull();
  });

  it('parses timestamps into ISO strings when present', () => {
    const result = parseGpxText(VALID_GPX_TRKPT);
    expect(result.points[0].time).toBe('2024-06-01T08:00:00.000Z');
  });

  it('sets time to null when no time element is present', () => {
    const result = parseGpxText(VALID_GPX_RTEPT);
    expect(result.points[0].time).toBeNull();
  });

  it('computes duration_seconds when timestamps are present', () => {
    const result = parseGpxText(VALID_GPX_TRKPT);
    // 08:00 to 09:00 = 3600 seconds
    expect(result.duration_seconds).toBe(3600);
  });

  it('returns null duration when no timestamps present', () => {
    const result = parseGpxText(VALID_GPX_RTEPT);
    expect(result.duration_seconds).toBeNull();
  });
});

// ============================================================
// geometryFromGpxTrackRecord
// Tests normalizeStoredPoints indirectly (it's a private function).
// ============================================================
describe('geometryFromGpxTrackRecord', () => {
  it('returns null when simplified_points is missing or has fewer than 2 points', () => {
    expect(geometryFromGpxTrackRecord({})).toBeNull();
    expect(geometryFromGpxTrackRecord({ simplified_points: [] })).toBeNull();
    expect(geometryFromGpxTrackRecord({ simplified_points: [{ lat: 1, lng: 2 }] })).toBeNull();
    expect(geometryFromGpxTrackRecord(null)).toBeNull();
  });

  it('returns geometry when simplified_points has at least 2 valid points', () => {
    const track = {
      simplified_points: [
        { lat: 38.7169, lng: -9.1399 },
        { lat: 38.7200, lng: -9.1350 },
      ],
      distance_km: 3.5,
      duration_seconds: 1800,
      point_count: 2,
    };
    const result = geometryFromGpxTrackRecord(track);
    expect(result).not.toBeNull();
    expect(result.points).toHaveLength(2);
    expect(result.distance_km).toBe(3.5);
    expect(result.duration_seconds).toBe(1800);
    expect(result.cached).toBe(true);
  });

  it('normalises stored points — filters out invalid coords', () => {
    const track = {
      simplified_points: [
        { lat: 38.7169, lng: -9.1399 },
        { lat: 200, lng: -9.1350 },   // invalid lat
        { lat: 38.7250, lng: -9.1300 },
      ],
      distance_km: 2,
      point_count: 3,
    };
    const result = geometryFromGpxTrackRecord(track);
    // The invalid point should be filtered out
    expect(result.points).toHaveLength(2);
  });

  it('normalises stored points — coerces string numbers', () => {
    const track = {
      simplified_points: [
        { lat: '38.7169', lng: '-9.1399' },
        { lat: '38.7200', lng: '-9.1350' },
      ],
    };
    const result = geometryFromGpxTrackRecord(track);
    expect(result).not.toBeNull();
    expect(result.points[0].lat).toBe(38.7169);
  });

  it('uses stored bbox when valid', () => {
    const track = {
      simplified_points: [
        { lat: 38.7, lng: -9.14 },
        { lat: 38.72, lng: -9.13 },
      ],
      bbox: { minLat: 38.7, maxLat: 38.72, minLng: -9.14, maxLng: -9.13 },
    };
    const result = geometryFromGpxTrackRecord(track);
    expect(result.bbox).toEqual(track.bbox);
  });

  it('computes bbox from points when stored bbox is invalid', () => {
    const track = {
      simplified_points: [
        { lat: 38.7169, lng: -9.1399 },
        { lat: 38.7200, lng: -9.1350 },
      ],
      bbox: null,
    };
    const result = geometryFromGpxTrackRecord(track);
    expect(result.bbox).not.toBeNull();
    expect(result.bbox.minLat).toBe(38.7169);
    expect(result.bbox.maxLat).toBe(38.72);
  });

  it('falls back to points for heatPoints when heat_points < 2', () => {
    const track = {
      simplified_points: [
        { lat: 38.7169, lng: -9.1399 },
        { lat: 38.7200, lng: -9.1350 },
      ],
      heat_points: [{ lat: 38.71, lng: -9.14 }], // only 1 — too few
    };
    const result = geometryFromGpxTrackRecord(track);
    // Should fall back to points
    expect(result.heatPoints).toEqual(result.points);
  });
});

// ============================================================
// trackFileName
// Tests the exported helper (strips upload prefix from file_path).
// ============================================================
describe('trackFileName', () => {
  it('strips the timestamp-random prefix from file_path', () => {
    const track = { file_path: 'trip-id/stage-id/1716000000000-abc123-my-ride.gpx' };
    const result = trackFileName(track);
    expect(result).toBe('my-ride.gpx');
  });

  it('returns the raw filename when no prefix is present', () => {
    const track = { file_path: 'trip/stage/track.gpx' };
    const result = trackFileName(track);
    // No timestamp-random prefix to strip, so it returns the last segment
    expect(result).toBe('track.gpx');
  });

  it('returns "track.gpx" for a null track', () => {
    expect(trackFileName(null)).toBe('track.gpx');
  });

  it('returns "track.gpx" when file_path is empty', () => {
    expect(trackFileName({ file_path: '' })).toBe('track.gpx');
  });
});
