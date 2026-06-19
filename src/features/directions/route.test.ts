import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatDuration,
  straightLineRoute,
  type LatLng,
} from './route';

describe('formatDistance (REQ-F2-002 — distance in metres)', () => {
  it('shows whole metres under 1km', () => {
    expect(formatDistance(450)).toBe('450m');
  });
  it('shows km with one decimal at/over 1km', () => {
    expect(formatDistance(1500)).toBe('1.5km');
  });
});

describe('formatDuration (REQ-F2-002 — estimated time in minutes)', () => {
  it('rounds seconds up to whole minutes (min 1)', () => {
    expect(formatDuration(0)).toBe('1분');
    expect(formatDuration(59)).toBe('1분');
    expect(formatDuration(120)).toBe('2분');
    expect(formatDuration(150)).toBe('3분');
  });
});

describe('straightLineRoute (A11 fallback when Kakao gives no route)', () => {
  const a: LatLng = { lat: 37.5, lng: 127.0 };
  const b: LatLng = { lat: 37.51, lng: 127.0 };

  it('produces a 2-point path, a distance, and an estimated walking duration', () => {
    const r = straightLineRoute(a, b);
    expect(r.path).toHaveLength(2);
    expect(r.path[0]).toEqual(a);
    expect(r.path[1]).toEqual(b);
    expect(r.distanceM).toBeGreaterThan(1000); // ~1.1km
    expect(r.durationSec).toBeGreaterThan(0);
    expect(r.fallback).toBe(true);
  });

  it('estimates duration from distance at walking speed (longer = more time)', () => {
    const near = straightLineRoute(a, { lat: 37.501, lng: 127.0 });
    const far = straightLineRoute(a, { lat: 37.55, lng: 127.0 });
    expect(far.durationSec).toBeGreaterThan(near.durationSec);
  });
});
