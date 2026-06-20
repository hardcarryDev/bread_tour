import { describe, expect, it } from 'vitest';
import { segmentColor } from './spotColors';

describe('segmentColor', () => {
  it('returns a valid #rrggbb hex string', () => {
    for (let i = 0; i < 10; i++) {
      expect(segmentColor(i)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('is deterministic for the same index', () => {
    expect(segmentColor(3)).toBe(segmentColor(3));
  });

  it('gives adjacent segments visibly different colors', () => {
    for (let i = 0; i < 8; i++) {
      expect(segmentColor(i)).not.toBe(segmentColor(i + 1));
    }
  });
});
