import type { Kit } from '../engine/types';

/**
 * The 8 starter sound types (open/close count as one type: 9 recipe ids).
 * One family: mostly sine/triangle, a shared pitch neighborhood around E5-B5, soft low-pass,
 * short tails. These are starting values, tuned by ear in the editor.
 */
export const DEFAULT_KIT: Kit = {
  v: 1,
  name: 'My Kit',
  theme: { pitch: 0, volume: 0.5 },
  options: { hover: false, voiceCap: 8 },
  sounds: {
    click: {
      id: 'click',
      voices: [{ wave: 'triangle', note: 'C6', sweepTo: 'G5', sweepMs: 18 }],
      env: { a: 1, d: 35, s: 0, r: 0 },
      filter: { type: 'lowpass', cutoff: 4200, q: 0.8 },
      noise: 0.25,
      gain: 0.25,
    },
    hover: {
      id: 'hover',
      voices: [{ wave: 'sine', note: 'E6' }],
      env: { a: 2, d: 25, s: 0, r: 0 },
      filter: { type: 'lowpass', cutoff: 3000, q: 0.7 },
      noise: 0,
      gain: 0.08,
    },
    toggleOn: {
      id: 'toggleOn',
      voices: [{ wave: 'sine', note: 'G5', sweepTo: 'C6', sweepMs: 40 }],
      env: { a: 2, d: 80, s: 0, r: 0 },
      filter: { type: 'lowpass', cutoff: 4800, q: 0.7 },
      noise: 0,
      gain: 0.25,
    },
    toggleOff: {
      id: 'toggleOff',
      voices: [{ wave: 'sine', note: 'C6', sweepTo: 'G5', sweepMs: 40 }],
      env: { a: 2, d: 70, s: 0, r: 0 },
      filter: { type: 'lowpass', cutoff: 4000, q: 0.7 },
      noise: 0,
      gain: 0.22,
    },
    success: {
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
    },
    error: {
      id: 'error',
      voices: [
        { wave: 'triangle', note: 'E4', sweepTo: 'C4', sweepMs: 120 },
        { wave: 'triangle', note: 'Eb4', delayMs: 90, gain: 0.5 },
      ],
      env: { a: 3, d: 170, s: 0, r: 0 },
      filter: { type: 'lowpass', cutoff: 1800, q: 1 },
      noise: 0,
      gain: 0.3,
    },
    notification: {
      id: 'notification',
      voices: [
        { wave: 'sine', note: 'B5' },
        { wave: 'sine', note: 'E6', delayMs: 110, gain: 0.7 },
      ],
      env: { a: 4, d: 230, s: 0, r: 0 },
      filter: { type: 'lowpass', cutoff: 5000, q: 0.7 },
      noise: 0,
      gain: 0.3,
    },
    open: {
      id: 'open',
      voices: [{ wave: 'triangle', note: 'C5', sweepTo: 'G5', sweepMs: 90 }],
      env: { a: 8, d: 120, s: 0, r: 0 },
      filter: { type: 'bandpass', cutoff: 2200, q: 1.2 },
      noise: 0.15,
      gain: 0.22,
    },
    close: {
      id: 'close',
      voices: [{ wave: 'triangle', note: 'G5', sweepTo: 'C5', sweepMs: 90 }],
      env: { a: 8, d: 120, s: 0, r: 0 },
      filter: { type: 'bandpass', cutoff: 1600, q: 1.2 },
      noise: 0.15,
      gain: 0.22,
    },
  },
};

/** Sound list order and the character each preset is going for. */
export const PRESET_INFO: { id: string; label: string; character: string }[] = [
  { id: 'click', label: 'Click', character: 'Tight, woody tick' },
  { id: 'hover', label: 'Hover', character: 'Barely there (off by default)' },
  { id: 'toggleOn', label: 'Toggle on', character: 'Small rising blip' },
  { id: 'toggleOff', label: 'Toggle off', character: 'Mirror of toggle on' },
  { id: 'success', label: 'Success', character: 'Two-note rising chime' },
  { id: 'error', label: 'Error', character: 'Soft downward pair, not harsh' },
  { id: 'notification', label: 'Notification', character: 'Gentle two-note ping' },
  { id: 'open', label: 'Open', character: 'Airy swoosh up' },
  { id: 'close', label: 'Close', character: 'Airy swoosh down' },
];

/** A deep copy of the default kit (callers mutate their copy freely). */
export const defaultKit = (): Kit => structuredClone(DEFAULT_KIT);
