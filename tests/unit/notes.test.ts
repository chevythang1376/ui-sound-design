import { describe, expect, it } from 'vitest';
import {
  formatHz,
  hzToMidi,
  midiToName,
  noteToMidi,
  parseNoteInput,
  toHz,
} from '../../src/engine/notes';

describe('note parsing', () => {
  it('parses naturals with A4 = 440 Hz', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(toHz('A4')).toBeCloseTo(440, 6);
    expect(toHz('C4')).toBeCloseTo(261.6256, 3);
    expect(toHz('E5')).toBeCloseTo(659.2551, 3);
    expect(toHz('B5')).toBeCloseTo(987.7666, 3);
  });

  it('parses sharps and flats', () => {
    expect(noteToMidi('C#4')).toBe(61);
    expect(noteToMidi('Db4')).toBe(61);
    expect(toHz('F#5')).toBeCloseTo(739.9888, 3);
    expect(toHz('Bb3')).toBeCloseTo(233.0819, 3);
    expect(noteToMidi('Cb4')).toBe(59); // enharmonic B3
    expect(noteToMidi('E#4')).toBe(65); // enharmonic F4
  });

  it('handles octaves, including -1 and case', () => {
    expect(noteToMidi('C-1')).toBe(0);
    expect(noteToMidi('C0')).toBe(12);
    expect(noteToMidi('g9')).toBe(127);
    expect(noteToMidi('a4')).toBe(69);
    expect(noteToMidi(' E5 ')).toBe(76);
    expect(toHz('A5') / toHz('A4')).toBeCloseTo(2, 10);
  });

  it('passes Hz numbers through', () => {
    expect(toHz(440)).toBe(440);
    expect(toHz(1234.5)).toBe(1234.5);
  });

  it('returns NaN for invalid input', () => {
    for (const bad of ['H4', '', 'C', 'C#', 'E##4', 'Bbb3', '4C', 'C44', 'A4hz']) {
      expect(toHz(bad), bad).toBeNaN();
    }
    expect(toHz(0)).toBeNaN();
    expect(toHz(-5)).toBeNaN();
    expect(toHz(NaN)).toBeNaN();
  });
});

describe('editor note helpers', () => {
  it('round-trips midi <-> name', () => {
    expect(midiToName(76)).toBe('E5');
    expect(midiToName(61)).toBe('C#4');
    expect(midiToName(0)).toBe('C-1');
    expect(midiToName(hzToMidi(440))).toBe('A4');
  });

  it('parses what people type', () => {
    expect(parseNoteInput('e5')).toBe('E5');
    expect(parseNoteInput('B♭3')).toBe('Bb3');
    expect(parseNoteInput('C♯4')).toBe('C#4');
    expect(parseNoteInput('440')).toBe(440);
    expect(parseNoteInput('440 Hz')).toBe(440);
    expect(parseNoteInput('12.5hz')).toBeNull(); // below 20 Hz
    expect(parseNoteInput('banana')).toBeNull();
  });

  it('formats Hz readouts', () => {
    expect(formatHz(659.255)).toBe('659.3 Hz');
    expect(formatHz(5200)).toBe('5.20 kHz');
    expect(formatHz(16000)).toBe('16.0 kHz');
    expect(formatHz(NaN)).toBe('—');
  });
});
