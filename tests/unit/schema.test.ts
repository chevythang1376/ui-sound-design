import { describe, expect, it } from 'vitest';
import { migrate, recipeMs, validateKit } from '../../src/engine/schema';
import { DEFAULT_KIT } from '../../src/presets/default-kit';

const kitWith = (sound: unknown, extra: Record<string, unknown> = {}) => ({
  v: 1,
  name: 'T',
  sounds: { x: sound },
  ...extra,
});

describe('validator: whole kits', () => {
  it('rejects non-objects and kits without sounds', () => {
    for (const bad of [null, 42, 'kit', [], { v: 1 }, { v: 1, sounds: [] }]) {
      const r = validateKit(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      expect(r.kit).toBeNull();
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('fills kit-level defaults', () => {
    const r = validateKit({ v: 1, sounds: {} });
    expect(r.ok).toBe(true);
    expect(r.kit!.name).toBe('Untitled kit');
    expect(r.kit!.theme).toEqual({ pitch: 0, volume: 0.5 });
    expect(r.kit!.options).toEqual({ hover: false, voiceCap: 8 });
  });

  it('clamps theme and options with readable warnings', () => {
    const r = validateKit({
      v: 1,
      sounds: {},
      theme: { pitch: 30, volume: 2 },
      options: { voiceCap: 0, hover: 'yes' },
    });
    expect(r.kit!.theme!.pitch).toBe(12);
    expect(r.kit!.theme!.volume).toBe(1);
    expect(r.kit!.options!.voiceCap).toBe(1);
    expect(r.kit!.options!.hover).toBe(false);
    expect(r.warnings).toContain('theme.pitch: 30 is outside -12..12; clamped to 12');
    expect(r.errors).toContain('options.hover: expected true or false, got "yes"; using false');
  });

  it('preserves unknown future fields at every level', () => {
    const r = validateKit({
      v: 1,
      library: { id: 'abc' },
      theme: { pitch: 2, brightness: 0.7, material: 'glass' },
      options: { voiceCap: 4, haptics: true },
      sounds: {
        x: {
          voices: [{ wave: 'sine', note: 'C5', drift: 3 }],
          fx: { room: 0.2, crush: 4 },
          lock: true,
        },
      },
    });
    expect(r.kit!.library).toEqual({ id: 'abc' });
    expect(r.kit!.theme).toMatchObject({ brightness: 0.7, material: 'glass' });
    expect(r.kit!.options).toMatchObject({ haptics: true });
    const x = r.kit!.sounds.x!;
    expect(x.fx).toEqual({ room: 0.2, crush: 4 });
    expect(x.lock).toBe(true);
    expect(x.voices[0]!.drift).toBe(3);
    expect(r.errors).toEqual([]);
  });

  it('keeps respectReducedMotion only when set', () => {
    expect(validateKit({ v: 1, sounds: {} }).kit!.options).not.toHaveProperty(
      'respectReducedMotion',
    );
    expect(
      validateKit({ v: 1, sounds: {}, options: { respectReducedMotion: false } }).kit!.options!
        .respectReducedMotion,
    ).toBe(false);
  });

  it('drops non-object sounds with an error', () => {
    const r = validateKit({ v: 1, sounds: { a: 3, b: { voices: [{ note: 'C5' }] } } });
    expect(Object.keys(r.kit!.sounds)).toEqual(['b']);
    expect(r.errors[0]).toMatch(/^sounds\.a: expected a recipe object/);
  });
});

describe('validator: recipes', () => {
  it('fills recipe, voice, env and filter defaults', () => {
    const r = validateKit(kitWith({ voices: [{ note: 'E5' }] }));
    expect(r.kit!.sounds.x).toEqual({
      id: 'x',
      voices: [
        {
          wave: 'sine',
          note: 'E5',
          sweepMs: 50,
          sweepCurve: 'exp',
          delayMs: 0,
          gain: 1,
          detune: 0,
        },
      ],
      env: { a: 2, d: 120, s: 0, r: 100, h: 0 },
      filter: { type: 'lowpass', cutoff: 16000, q: 0.7 },
      noise: 0,
      gain: 0.3,
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('clamps out-of-range values', () => {
    const r = validateKit(
      kitWith({
        voices: [{ note: 'C5', gain: 3, delayMs: -10, detune: 5000 }],
        env: { a: -1, d: 99999, s: 2 },
        filter: { cutoff: 50000, q: 0 },
        noise: 1.5,
        gain: -2,
      }),
    );
    const x = r.kit!.sounds.x!;
    expect(x.voices[0]).toMatchObject({ gain: 1, delayMs: 0, detune: 1200 });
    expect(x.env).toMatchObject({ a: 0, d: 5000, s: 1 });
    expect(x.filter).toMatchObject({ cutoff: 20000, q: 0.1 });
    expect(x.noise).toBe(1);
    expect(x.gain).toBe(0);
    expect(r.warnings).toContain(
      'sounds.x.filter.cutoff: 50000 is outside 20..20000; clamped to 20000',
    );
    expect(r.warnings.length).toBe(10);
    expect(r.errors).toEqual([]);
  });

  it('accepts numeric strings but reports wrong types', () => {
    const r = validateKit(kitWith({ voices: [{ note: 'C5' }], gain: '0.4', noise: 'loud' }));
    expect(r.kit!.sounds.x!.gain).toBe(0.4);
    expect(r.kit!.sounds.x!.noise).toBe(0);
    expect(r.errors).toEqual(['sounds.x.noise: expected a number, got "loud"; using 0']);
  });

  it('warns about unknown future waves but keeps them', () => {
    const r = validateKit(kitWith({ voices: [{ wave: 'fm', note: 'C5' }] }));
    expect(r.kit!.sounds.x!.voices[0]!.wave).toBe('fm');
    expect(r.warnings).toEqual([
      'sounds.x.voices[0].wave: unknown wave "fm" is kept but skipped during playback',
    ]);
  });

  it('normalizes notes and reports invalid ones', () => {
    const r = validateKit(
      kitWith({
        voices: [
          { note: 'e5', sweepTo: 'bb5' },
          { note: 'H9', sweepTo: 'nope' },
          { note: '440' },
          { note: 5 },
        ],
      }),
    );
    const v = r.kit!.sounds.x!.voices;
    expect(v[0]).toMatchObject({ note: 'E5', sweepTo: 'Bb5' });
    expect(v[1]!.note).toBe('A4');
    expect(v[1]).not.toHaveProperty('sweepTo');
    expect(v[2]!.note).toBe(440);
    expect(v[3]!.note).toBe(20);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/voices\[1\]\.note: "H9" is not a note name/);
  });

  it('needs at least one voice and caps the count', () => {
    const none = validateKit(kitWith({ voices: [] }));
    expect(none.kit!.sounds.x!.voices).toHaveLength(1);
    expect(none.errors[0]).toMatch(/needs at least one voice/);

    const many = validateKit(
      kitWith({ voices: Array.from({ length: 10 }, () => ({ note: 'C5' })) }),
    );
    expect(many.kit!.sounds.x!.voices).toHaveLength(8);
    expect(many.warnings.join('\n')).toMatch(/only the first 8 are kept/);
    expect(many.warnings.join('\n')).toMatch(/only edits the first 2/);
  });

  it('drops a non-object fx with an error, ignores unknown filter types with a warning', () => {
    const r = validateKit(kitWith({ voices: [{ note: 'C5' }], fx: 7, filter: { type: 'notch' } }));
    expect(r.kit!.sounds.x).not.toHaveProperty('fx');
    expect(r.kit!.sounds.x!.filter!.type).toBe('notch');
    expect(r.errors).toEqual(['sounds.x.fx: expected an object, got 7; dropped']);
    expect(r.warnings[0]).toMatch(/filter type "notch" is not part of v1/);
  });

  it('does not mutate its input', () => {
    const input = kitWith({ voices: [{ note: 'C5', gain: 9 }] });
    const copy = structuredClone(input);
    validateKit(input);
    expect(input).toEqual(copy);
  });
});

describe('migrate()', () => {
  const issues = () => {
    const w: string[] = [];
    return { w, warn: (p: string, m: string) => w.push(`${p}: ${m}`) };
  };

  it('assumes v1 when the version is missing', () => {
    const i = issues();
    expect(migrate({ sounds: {} }, i).v).toBe(1);
    expect(i.w[0]).toMatch(/assuming v1/);
  });

  it('keeps newer kits with a warning', () => {
    const i = issues();
    expect(migrate({ v: 2, sounds: {} }, i).v).toBe(2);
    expect(i.w[0]).toMatch(/newer than this editor/);
  });

  it('passes v1 through untouched', () => {
    const i = issues();
    const k = { v: 1, sounds: {} };
    expect(migrate(k, i)).toBe(k);
    expect(i.w).toEqual([]);
  });
});

describe('recipeMs', () => {
  it('is the latest voice start plus the envelope', () => {
    expect(recipeMs(DEFAULT_KIT.sounds.success!)).toBe(70 + 4 + 140);
    expect(recipeMs({ voices: [{ note: 'C5' }], env: { a: 1, d: 35 } })).toBe(36);
    expect(
      recipeMs({ voices: [{ note: 'C5' }], env: { a: 5, d: 50, s: 0.5, h: 100, r: 200 } }),
    ).toBe(355);
  });
});
