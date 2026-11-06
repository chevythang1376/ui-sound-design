import { describe, expect, it } from 'vitest';
import { masterLevel, pitchRatio } from '../../src/engine/theme';

describe('theme pitch', () => {
  it('multiplies frequencies by 2^(semitones/12)', () => {
    expect(pitchRatio({ pitch: 0 })).toBe(1);
    expect(pitchRatio({ pitch: 12 })).toBeCloseTo(2, 12);
    expect(pitchRatio({ pitch: -12 })).toBeCloseTo(0.5, 12);
    expect(pitchRatio({ pitch: 7 })).toBeCloseTo(1.498307, 6);
    expect(pitchRatio({ pitch: 1 })).toBeCloseTo(2 ** (1 / 12), 12);
  });

  it('defaults to 0 semitones and adds the per-play offset', () => {
    expect(pitchRatio(undefined)).toBe(1);
    expect(pitchRatio({})).toBe(1);
    expect(pitchRatio({ pitch: 5 }, 7)).toBeCloseTo(2, 12);
    expect(pitchRatio({ pitch: 0 }, -24)).toBeCloseTo(0.25, 12);
  });
});

describe('theme volume', () => {
  it('sets the master gain, default 0.5', () => {
    expect(masterLevel(undefined)).toBe(0.5);
    expect(masterLevel({ volume: 0.3 })).toBe(0.3);
  });

  it('prefers the runtime override (kit.volume())', () => {
    expect(masterLevel({ volume: 0.3 }, 0.8)).toBe(0.8);
    expect(masterLevel({ volume: 0.3 }, 0)).toBe(0);
  });

  it('clamps to 0..1 and survives garbage', () => {
    expect(masterLevel({ volume: 4 })).toBe(1);
    expect(masterLevel({ volume: -1 })).toBe(0);
    expect(masterLevel({ volume: NaN })).toBe(0);
  });
});
