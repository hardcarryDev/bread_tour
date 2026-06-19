import { describe, expect, it } from 'vitest';
import type { Spot } from '../../types/database';
import {
  DwellTracker,
  accuracyOk,
  haversineMeters,
  resolveArrivalSpot,
  type GeoSample,
} from './geo';

// Helper to build a minimal Spot for arrival logic (only the geo fields matter).
function spot(partial: Partial<Spot> & Pick<Spot, 'id'>): Spot {
  return {
    tour_id: 't1',
    name: partial.name ?? partial.id,
    kind: 'bakery',
    lat: 37.5,
    lng: 127.0,
    radius_m: 50,
    order_index: 1,
    created_at: 'x',
    updated_at: 'x',
    ...partial,
  } as Spot;
}

describe('haversineMeters (distance between two coordinates)', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineMeters(37.5, 127.0, 37.5, 127.0)).toBeCloseTo(0, 5);
  });

  it('computes a known distance (~111m per 0.001 deg latitude)', () => {
    const d = haversineMeters(37.5, 127.0, 37.501, 127.0);
    // ~111.2m for 0.001 degrees of latitude.
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});

describe('accuracyOk — accuracy-ratio gate (REQ-F1-006 / A10 / AC-F1-03)', () => {
  it('accepts when accuracy < radius * 0.5 (50m radius => 25m threshold)', () => {
    expect(accuracyOk(20, 50)).toBe(true);
  });

  it('holds the stamp when accuracy >= radius * 0.5', () => {
    expect(accuracyOk(25, 50)).toBe(false);
    expect(accuracyOk(40, 50)).toBe(false);
  });

  it('scales with the spot radius', () => {
    // radius 100 => threshold 50.
    expect(accuracyOk(49, 100)).toBe(true);
    expect(accuracyOk(50, 100)).toBe(false);
  });
});

describe('DwellTracker — dwell-time / consecutive-sample gate (REQ-F1-002 / A9)', () => {
  it('requires consecutive in-radius samples before arrival (default 3)', () => {
    const t = new DwellTracker({ minConsecutive: 3, minDwellMs: 10_000 });
    expect(t.update('s1', 1000)).toBe(false); // 1st sample
    expect(t.update('s1', 1500)).toBe(false); // 2nd sample
    expect(t.update('s1', 2000)).toBe(true); // 3rd consecutive => arrived
  });

  it('arrives by sustained dwell time even with fewer than N samples', () => {
    const t = new DwellTracker({ minConsecutive: 99, minDwellMs: 10_000 });
    expect(t.update('s1', 0)).toBe(false);
    // 10s elapsed since first in-radius sample => arrived.
    expect(t.update('s1', 10_000)).toBe(true);
  });

  it('resets the streak when the user leaves the radius (null spot)', () => {
    const t = new DwellTracker({ minConsecutive: 3, minDwellMs: 10_000 });
    t.update('s1', 0);
    t.update('s1', 100);
    t.update(null, 200); // left the radius
    expect(t.update('s1', 300)).toBe(false); // streak restarted
    expect(t.update('s1', 400)).toBe(false);
    expect(t.update('s1', 500)).toBe(true);
  });

  it('resets the streak when the target spot changes', () => {
    const t = new DwellTracker({ minConsecutive: 2, minDwellMs: 10_000 });
    expect(t.update('s1', 0)).toBe(false);
    expect(t.update('s2', 100)).toBe(false); // different spot restarts
    expect(t.update('s2', 200)).toBe(true);
  });
});

describe('resolveArrivalSpot — overlap resolution (REQ-F1-008 / AC-F1-05)', () => {
  const A = spot({ id: 'A', lat: 37.5, lng: 127.0, radius_m: 50, order_index: 1 });
  const B = spot({ id: 'B', lat: 37.5001, lng: 127.0, radius_m: 50, order_index: 2 });

  it('returns the only in-radius unvisited spot', () => {
    const sample: GeoSample = { lat: 37.5, lng: 127.0, accuracy: 5, at: 0 };
    const r = resolveArrivalSpot(sample, [A, B], new Set());
    expect(r?.id).toBe('A');
  });

  it('prefers the earliest unvisited spot when inside multiple radii', () => {
    // A point inside both A and B radii (they overlap). A has earlier order.
    const sample: GeoSample = { lat: 37.50005, lng: 127.0, accuracy: 5, at: 0 };
    const r = resolveArrivalSpot(sample, [A, B], new Set());
    expect(r?.id).toBe('A');
  });

  it('skips already-stamped spots and picks the next unvisited one', () => {
    const sample: GeoSample = { lat: 37.50005, lng: 127.0, accuracy: 5, at: 0 };
    const r = resolveArrivalSpot(sample, [A, B], new Set(['A']));
    expect(r?.id).toBe('B');
  });

  it('returns null when no spot is within its radius', () => {
    const sample: GeoSample = { lat: 38.0, lng: 128.0, accuracy: 5, at: 0 };
    expect(resolveArrivalSpot(sample, [A, B], new Set())).toBeNull();
  });

  it('uses center distance as tie-break when order is equal', () => {
    const C = spot({ id: 'C', lat: 37.5, lng: 127.0, radius_m: 50, order_index: 1 });
    const D = spot({ id: 'D', lat: 37.5003, lng: 127.0, radius_m: 50, order_index: 1 });
    // Sample sits exactly on C's center => C is closer.
    const sample: GeoSample = { lat: 37.5, lng: 127.0, accuracy: 5, at: 0 };
    const r = resolveArrivalSpot(sample, [C, D], new Set());
    expect(r?.id).toBe('C');
  });
});
