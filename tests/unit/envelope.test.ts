import { describe, expect, it } from 'vitest';
import { applyEnv, envMs, FLOOR, fullEnv } from '../../src/engine/envelope';

/** Records AudioParam automation calls. */
const fakeParam = () => {
  const calls: [string, number, number][] = [];
  const rec = (name: string) => (v: number, t: number) => {
    calls.push([name, v, t]);
  };
  const p = {
    setValueAtTime: rec('set'),
    linearRampToValueAtTime: rec('lin'),
    exponentialRampToValueAtTime: rec('exp'),
  } as unknown as AudioParam;
  return { p, calls };
};

describe('envelope length', () => {
  it('s = 0 ends after a + d (hold and release unused)', () => {
    expect(envMs(fullEnv({ a: 4, d: 140, s: 0, r: 120, h: 50 }))).toBe(144);
  });

  it('s > 0 adds hold and release', () => {
    expect(envMs(fullEnv({ a: 4, d: 100, s: 0.5, h: 30, r: 120 }))).toBe(254);
  });

  it('enforces a 1 ms minimum attack', () => {
    expect(envMs(fullEnv({ a: 0, d: 35, s: 0 }))).toBe(36);
  });
});

describe('envelope scheduling', () => {
  it('starts at 0, linear attack to peak, never exponential-ramps to exactly 0', () => {
    const { p, calls } = fakeParam();
    const end = applyEnv(p, 1, fullEnv({ a: 4, d: 140, s: 0 }), 0.6);
    expect(calls[0]).toEqual(['set', 0, 1]);
    expect(calls[1]![0]).toBe('lin');
    expect(calls[1]![1]).toBe(0.6);
    expect(calls[1]![2]).toBeCloseTo(1.004, 9);
    expect(calls[2]![0]).toBe('exp');
    expect(calls[2]![1]).toBe(FLOOR);
    expect(calls[2]![2]).toBeCloseTo(1.144, 9);
    expect(calls.at(-1)).toEqual(['set', 0, end]);
    expect(end).toBeCloseTo(1.144, 9);
    for (const [name, v] of calls) if (name == 'exp') expect(v).toBeGreaterThan(0);
  });

  it('with sustain: decays to s * peak, holds, then releases', () => {
    const { p, calls } = fakeParam();
    const end = applyEnv(p, 0, fullEnv({ a: 2, d: 50, s: 0.5, h: 100, r: 80 }), 1);
    expect(calls.map((c) => c[0])).toEqual(['set', 'lin', 'exp', 'set', 'exp', 'set']);
    expect(calls[2]![1]).toBe(0.5);
    expect(calls[3]![1]).toBe(0.5);
    expect(calls[3]![2]).toBeCloseTo(0.152, 9);
    expect(calls[4]![1]).toBe(FLOOR);
    expect(end).toBeCloseTo(0.232, 9);
  });
});
