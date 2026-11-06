import { describe, expect, it } from 'vitest';
import { LONG_SOUND_MS, recipeMs, validateKit } from '../../src/engine/schema';
import { DEFAULT_KIT, PRESET_INFO, defaultKit } from '../../src/presets/default-kit';

const ids = Object.keys(DEFAULT_KIT.sounds);

describe('default kit', () => {
  it('has the 8 sound types (open/close as one: 9 recipe ids)', () => {
    expect(ids).toEqual([
      'click',
      'hover',
      'toggleOn',
      'toggleOff',
      'success',
      'error',
      'notification',
      'open',
      'close',
    ]);
    expect(PRESET_INFO.map((p) => p.id)).toEqual(ids);
  });

  it('validates cleanly', () => {
    const r = validateKit(DEFAULT_KIT);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('has quiet defaults and hover off', () => {
    expect(DEFAULT_KIT.theme!.volume).toBe(0.5);
    expect(DEFAULT_KIT.options!.hover).toBe(false);
    expect(DEFAULT_KIT.options!.voiceCap).toBe(8);
    for (const id of ids) expect(DEFAULT_KIT.sounds[id]!.gain!, id).toBeLessThanOrEqual(0.35);
  });

  it('every preset is short (well under 500 ms)', () => {
    for (const id of ids) expect(recipeMs(DEFAULT_KIT.sounds[id]!), id).toBeLessThan(LONG_SOUND_MS);
  });

  it('sounds like one family: sine/triangle, 1-2 voices, low-pass or band-pass', () => {
    for (const id of ids) {
      const r = DEFAULT_KIT.sounds[id]!;
      expect(r.voices.length, id).toBeGreaterThanOrEqual(1);
      expect(r.voices.length, id).toBeLessThanOrEqual(2);
      for (const v of r.voices) expect(['sine', 'triangle'], id).toContain(v.wave);
      expect(['lowpass', 'bandpass'], id).toContain(r.filter!.type);
    }
  });

  it('success is exactly the example recipe from the brief', () => {
    expect(DEFAULT_KIT.sounds.success).toEqual({
      id: 'success',
      voices: [
        { wave: 'sine', note: 'E5', sweepTo: 'B5', sweepMs: 60 },
        { wave: 'triangle', note: 'B5', delayMs: 70, gain: 0.6 },
      ],
      env: { a: 4, d: 140, s: 0, r: 120 },
      filter: { type: 'lowpass', cutoff: 5200, q: 0.7 },
      noise: 0,
      fx: { room: 0.15, humanize: 0.03 },
      gain: 0.35,
    });
  });

  it('defaultKit() returns an independent copy', () => {
    const a = defaultKit();
    a.sounds.click!.gain = 0.9;
    expect(DEFAULT_KIT.sounds.click!.gain).toBe(0.25);
  });
});
