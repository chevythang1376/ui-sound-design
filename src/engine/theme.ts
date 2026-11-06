import { THEME_DEFAULTS, type Theme } from './types';

/**
 * Kit-level transforms, applied at play time and never baked into recipes, so the global
 * pitch knob can always be moved back.
 */

/** Frequency multiplier for the theme's global pitch plus a per-play offset, in semitones. */
export const pitchRatio = (t: Theme | undefined, semis = 0): number =>
  2 ** (((t?.pitch ?? THEME_DEFAULTS.pitch) + semis) / 12);

/** Master gain: a runtime override (kit.volume()) or the theme volume, clamped to 0-1. */
export const masterLevel = (t: Theme | undefined, override?: number): number =>
  Math.min(1, Math.max(0, override ?? t?.volume ?? THEME_DEFAULTS.volume)) || 0;
