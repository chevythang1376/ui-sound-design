import type { NoteValue } from './types';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI number for "E5", "C#4", "Bb3" (A4 = 69, octaves -1..9). NaN when not a note name. */
export const noteToMidi = (name: string): number => {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(name.trim().toLowerCase());
  // Index in "c_d_ef_g_a_b" is the letter's semitone; index in "b #" minus 1 is the accidental.
  return m
    ? 12 * (+m[3]! + 1) + 'c_d_ef_g_a_b'.indexOf(m[1]!) + 'b #'.indexOf(m[2] || ' ') - 1
    : NaN;
};

/** Equal temperament, A4 = 440 Hz. */
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Note name or Hz number to frequency in Hz. NaN when invalid (the engine then skips the voice). */
export const toHz = (n: NoteValue): number =>
  typeof n == 'number' ? (n > 0 ? n : NaN) : midiToHz(noteToMidi(n));

// ---- Editor helpers below. Not used by the runtime, so esbuild tree-shakes them out. ----

export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

/** 76 -> "E5". Sharps. */
export const midiToName = (midi: number): string => {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12]! + (Math.floor(m / 12) - 1);
};

/**
 * Parse what a person types into a note field: "E5", "c#4", "B♭3", "440", "440 Hz".
 * Returns a canonical NoteValue (note name with # / b, or a number of Hz) or null.
 */
export const parseNoteInput = (raw: string): NoteValue | null => {
  const s = raw.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const hz = /^(\d+(?:\.\d+)?)\s*(?:hz)?$/i.exec(s);
  if (hz) {
    const f = parseFloat(hz[1]!);
    return f >= 20 && f <= 20000 ? f : null;
  }
  const m = /^([a-g])([#b]?)(-?\d)$/i.exec(s);
  if (!m) return null;
  return m[1]!.toUpperCase() + m[2]!.toLowerCase() + m[3]!;
};

/** "659.3 Hz" / "1.32 kHz" readout. */
export const formatHz = (hz: number): string =>
  !Number.isFinite(hz)
    ? '—'
    : hz >= 1000
      ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`
      : `${hz.toFixed(1)} Hz`;
