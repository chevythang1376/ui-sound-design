/**
 * Data model shared by the editor, the validator and the exported runtime.
 * Keys are short on purpose: they ship to production inside every exported kit.
 */

/** Schema version written into every kit. Bump it and extend migrate() in schema.ts on a break. */
export const SCHEMA_VERSION = 1;

/** Oscillator waves playable in v1. "fm" and "noise" are reserved for later. */
export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export type Wave = (typeof WAVES)[number];

export const FILTER_TYPES = ['lowpass', 'bandpass'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

/** A note name ("E5", "C#4", "Bb3") or a frequency in Hz. A4 = 440 Hz, equal temperament. */
export type NoteValue = string | number;

export interface Voice {
  /** Unknown (future) waves are preserved by the validator and skipped during playback. */
  wave?: Wave | (string & {});
  note: NoteValue;
  /** Optional sweep target; the sweep starts at the voice's delayMs. */
  sweepTo?: NoteValue;
  sweepMs?: number;
  sweepCurve?: 'exp' | 'lin';
  /** Offset from trigger time, for two-note chimes. */
  delayMs?: number;
  /** Voice level before the shared envelope. */
  gain?: number;
  /** Cents. */
  detune?: number;
  [future: string]: unknown;
}

/**
 * Envelope, all in ms except `s` (sustain level 0-1).
 * s = 0: the sound ends after a + d (h and r are unused).
 * s > 0: attack, decay to s, hold s for h ms, then release over r ms.
 */
export interface Env {
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  h?: number;
}

export interface Filter {
  type?: FilterType | (string & {});
  cutoff?: number;
  q?: number;
}

export interface Recipe {
  id?: string;
  voices: Voice[];
  env?: Env;
  filter?: Filter;
  /** 0-1 blend of filtered white noise mixed into the voice bus. */
  noise?: number;
  /** Later: room reverb, humanize, bit-crush. Preserved on load/save, ignored by v1 playback. */
  fx?: Record<string, unknown>;
  /** Final recipe level, 0-1. */
  gain?: number;
  [future: string]: unknown;
}

/** Kit-level transforms applied at play time. Open object: brightness, length, material later. */
export interface Theme {
  /** Semitones, -12..+12. */
  pitch?: number;
  /** Master volume 0-1. */
  volume?: number;
  [future: string]: unknown;
}

export interface KitOptions {
  /** Hover sounds via bind(). Off by default. */
  hover?: boolean;
  /** Max concurrent plays; the oldest is stolen with a fast fade. */
  voiceCap?: number;
  /** Treat prefers-reduced-motion as "start muted" (there is no reduced-sound query). */
  respectReducedMotion?: boolean;
  [future: string]: unknown;
}

export interface Kit {
  v: number;
  name?: string;
  theme?: Theme;
  sounds: Record<string, Recipe>;
  options?: KitOptions;
  [future: string]: unknown;
}

export interface PlayOptions {
  /** Extra semitones for this play only (e.g. a slider tick that follows its value). */
  pitch?: number;
}

export interface CreateOptions extends KitOptions {
  /** Seed for noise and noise offsets. Only for deterministic tests; default is Math.random. */
  seed?: number;
  /** Called with each master gain node the kit creates (editor oscilloscope). */
  tap?: (master: AudioNode) => void;
}

export interface SoundKit {
  /** Play by semantic name. Dropped silently when muted, before unlock, or rate-limited. */
  play(name: string, opts?: PlayOptions): void;
  /** Auto-wire `<button data-sound="click">` (click), `<form data-sound>` (submit) and hover. */
  bind(selector?: string, root?: ParentNode & EventTarget): () => void;
  /** Master volume 0-1 (defaults to theme.volume). Returns the current value. */
  volume(v?: number): number;
  /** Mute (default true) or unmute; persisted per visitor in localStorage. */
  mute(muted?: boolean): boolean;
  isMuted(): boolean;
  /** Turn any button into an accessible mute toggle (aria-pressed). Returns an unmount function. */
  mountMuteToggle(el: HTMLElement): () => void;
  /** Hot-swap the kit JSON (the editor calls this on every knob change). */
  update(kit: Kit): void;
  /** Schedule a sound on any BaseAudioContext (e.g. OfflineAudioContext). Returns its length in s. */
  render(name: string, ctx: BaseAudioContext, opts?: PlayOptions): number;
  destroy(): void;
}

/*
 * Defaults. The engine fills these at play time, the validator fills them on load and the
 * exporter strips values equal to them. Sound-design judgment calls live here and in
 * src/presets/default-kit.ts.
 */
export const VOICE_DEFAULTS: {
  wave: string;
  sweepMs: number;
  delayMs: number;
  gain: number;
  detune: number;
} = { wave: 'sine', sweepMs: 50, delayMs: 0, gain: 1, detune: 0 };
/** The runtime treats anything but "lin" as exponential. */
export const SWEEP_CURVE_DEFAULT = 'exp';
export const ENV_DEFAULTS = { a: 2, d: 120, s: 0, r: 100, h: 0 };
export const FILTER_DEFAULTS = { type: 'lowpass', cutoff: 16000, q: 0.7 };
export const RECIPE_DEFAULTS = { noise: 0, gain: 0.3 };
export const THEME_DEFAULTS = { pitch: 0, volume: 0.5 };
export const OPTION_DEFAULTS = { hover: false, voiceCap: 8, respectReducedMotion: true };
