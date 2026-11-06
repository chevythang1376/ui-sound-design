import { ENV_DEFAULTS, type Env } from './types';

export type FullEnv = typeof ENV_DEFAULTS;

/** Exponential ramps never target exactly 0: ramp to this, then set 0. */
export const FLOOR = 1e-4;

export const fullEnv = (e?: Env): FullEnv => ({ ...ENV_DEFAULTS, ...e });

/** Attack is at least this long, to avoid clicks. */
export const MIN_ATTACK_MS = 1;

/**
 * Envelope length in ms.
 * s = 0: ends after a + d (hold and release are unused).
 * s > 0: a + d + h (hold at sustain) + r.
 */
export const envMs = (e: FullEnv): number =>
  Math.max(e.a, MIN_ATTACK_MS) + e.d + (e.s > 0 ? e.h + e.r : 0);

/**
 * Schedule the envelope on a gain AudioParam from time t (seconds), peaking at `peak`:
 * linear attack from 0, exponential decay toward sustain, then (s > 0) hold + exponential
 * release. Returns the time at which the envelope reaches 0.
 */
export const applyEnv = (p: AudioParam, t: number, e: FullEnv, peak: number): number => {
  const s = Math.max(e.s * peak, FLOOR);
  const exp = (v: number, ms: number) => p.exponentialRampToValueAtTime(v, (t += ms / 1e3));
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, (t += Math.max(e.a, MIN_ATTACK_MS) / 1e3));
  exp(s, e.d);
  if (e.s > 0) {
    p.setValueAtTime(s, (t += e.h / 1e3));
    exp(FLOOR, e.r);
  }
  p.setValueAtTime(0, t);
  return t;
};
