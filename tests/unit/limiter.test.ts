import { describe, expect, it } from 'vitest';
import { createLimiter, HOVER_MS, RETRIGGER_MS } from '../../src/engine/limiter';

/** A fake clock: the limiter only ever sees the times we pass in. */
const clock = () => {
  let t = 1000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};

const voice = (log: string[], id: string, end: number) => ({ e: end, k: () => log.push(id) });

describe('limiter: per-sound retrigger interval', () => {
  it('blocks the same sound inside the interval and allows it after', () => {
    const c = clock();
    const l = createLimiter();
    expect(l.ok('click', c.now())).toBe(true);
    c.tick(RETRIGGER_MS - 1);
    expect(l.ok('click', c.now())).toBe(false);
    c.tick(1);
    expect(l.ok('click', c.now())).toBe(true);
  });

  it('is per sound', () => {
    const c = clock();
    const l = createLimiter();
    expect(l.ok('click', c.now())).toBe(true);
    expect(l.ok('success', c.now())).toBe(true);
    expect(l.ok('click', c.now())).toBe(false);
  });
});

describe('limiter: hover', () => {
  it('never plays hover when hover is off', () => {
    const c = clock();
    const l = createLimiter();
    expect(l.ok('hover', c.now(), true, false)).toBe(false);
    c.tick(1000);
    expect(l.ok('hover', c.now(), true, false)).toBe(false);
  });

  it('allows at most one hover per HOVER_MS when on', () => {
    const c = clock();
    const l = createLimiter();
    expect(l.ok('hover', c.now(), true, true)).toBe(true);
    c.tick(HOVER_MS - 1);
    expect(l.ok('hover', c.now(), true, true)).toBe(false);
    c.tick(1);
    expect(l.ok('hover', c.now(), true, true)).toBe(true);
  });

  it('a blocked hover does not reset the window', () => {
    const c = clock();
    const l = createLimiter();
    l.ok('hover', c.now(), true, true);
    c.tick(50);
    l.ok('hover', c.now(), true, true); // blocked
    c.tick(30); // 80 ms after the first
    expect(l.ok('hover', c.now(), true, true)).toBe(true);
  });

  it('direct (non-hover) plays are not hover-gated', () => {
    const c = clock();
    const l = createLimiter();
    expect(l.ok('hover', c.now(), false, false)).toBe(true);
  });
});

describe('limiter: voice cap', () => {
  it('steals the oldest voice first when at the cap', () => {
    const c = clock();
    const l = createLimiter();
    const stolen: string[] = [];
    for (let i = 0; i < 3; i++) l.add(voice(stolen, 'v' + i, c.now() + 500), c.now(), 3);
    expect(stolen).toEqual([]);
    l.add(voice(stolen, 'v3', c.now() + 500), c.now(), 3);
    expect(stolen).toEqual(['v0']);
    l.add(voice(stolen, 'v4', c.now() + 500), c.now(), 3);
    expect(stolen).toEqual(['v0', 'v1']);
  });

  it('does not count voices that already ended', () => {
    const c = clock();
    const l = createLimiter();
    const stolen: string[] = [];
    l.add(voice(stolen, 'short', c.now() + 40), c.now(), 2);
    l.add(voice(stolen, 'long', c.now() + 400), c.now(), 2);
    c.tick(100); // "short" ended at +40
    l.add(voice(stolen, 'new', c.now() + 400), c.now(), 2);
    expect(stolen).toEqual([]);
    l.add(voice(stolen, 'newer', c.now() + 400), c.now(), 2);
    expect(stolen).toEqual(['long']);
  });

  it('defaults hold 8 concurrent voices', () => {
    const c = clock();
    const l = createLimiter();
    const stolen: string[] = [];
    for (let i = 0; i < 8; i++) l.add(voice(stolen, 'v' + i, c.now() + 500), c.now(), 8);
    expect(stolen).toEqual([]);
    l.add(voice(stolen, 'v8', c.now() + 500), c.now(), 8);
    expect(stolen).toEqual(['v0']);
  });

  it('clear() steals everything', () => {
    const c = clock();
    const l = createLimiter();
    const stolen: string[] = [];
    l.add(voice(stolen, 'a', c.now() + 500), c.now(), 8);
    l.add(voice(stolen, 'b', c.now() + 500), c.now(), 8);
    expect(l.clear()).toBe(2);
    expect(stolen).toEqual(['a', 'b']);
    expect(l.clear()).toBe(0);
  });
});
