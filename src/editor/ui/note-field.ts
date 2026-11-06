/**
 * <sd-note>: a note name (or Hz) text field with a Hz readout and a small piano-style picker.
 * Fires "change" with the new canonical value in `.value` (a note name or a number of Hz).
 */
import {
  NOTE_NAMES,
  formatHz,
  midiToName,
  noteToMidi,
  parseNoteInput,
  toHz,
} from '../../engine/notes';
import type { NoteValue } from '../../engine/types';
import { h, id } from './dom';

const BLACK = new Set([1, 3, 6, 8, 10]);

export class SdNote extends HTMLElement {
  private _value: NoteValue = 'A4';
  private built = false;
  private input!: HTMLInputElement;
  private hz!: HTMLSpanElement;
  private toggle!: HTMLButtonElement;
  private pop!: HTMLDivElement;
  private octave = 4;
  private octaveLabel!: HTMLSpanElement;
  private keys!: HTMLDivElement;

  get value(): NoteValue {
    return this._value;
  }
  set value(v: NoteValue) {
    this._value = v;
    if (this.built) this.paint();
  }
  get disabled() {
    return this.hasAttribute('disabled');
  }
  set disabled(d: boolean) {
    this.toggleAttribute('disabled', d);
    if (this.built) this.paint();
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const label = this.getAttribute('label') ?? 'Note';
    const popId = id('piano');
    this.input = h('input', {
      type: 'text',
      class: 'note-input',
      'aria-label': label,
      spellcheck: 'false',
      autocomplete: 'off',
      title: 'Note name (E5, C#4, Bb3) or a frequency in Hz',
    });
    this.hz = h('span', { class: 'note-hz mono', 'aria-hidden': 'true' });
    this.toggle = h(
      'button',
      {
        type: 'button',
        class: 'note-piano-btn',
        'aria-label': `Pick ${label.toLowerCase()} on a keyboard`,
        'aria-expanded': 'false',
        'aria-controls': popId,
        title: 'Keyboard',
      },
      h('span', { 'aria-hidden': 'true' }, '♪'),
    );
    this.octaveLabel = h('span', { class: 'mono', 'aria-live': 'polite' });
    this.keys = h('div', { class: 'piano-keys' });
    this.pop = h(
      'div',
      {
        class: 'piano-pop',
        id: popId,
        hidden: true,
        role: 'group',
        'aria-label': `${label} keyboard`,
      },
      h(
        'div',
        { class: 'piano-nav' },
        h(
          'button',
          { type: 'button', 'aria-label': 'Octave down', onclick: () => this.shift(-1) },
          '−',
        ),
        this.octaveLabel,
        h(
          'button',
          { type: 'button', 'aria-label': 'Octave up', onclick: () => this.shift(1) },
          '+',
        ),
      ),
      this.keys,
    );
    this.append(h('span', { class: 'note-row' }, this.input, this.toggle), this.hz, this.pop);

    // The inner input's native events must not escape: "change" on <sd-note> means a new note.
    this.input.addEventListener('input', (e) => e.stopPropagation());
    this.input.addEventListener('change', (e) => {
      e.stopPropagation();
      this.commit();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key == 'Enter') this.commit();
      if (e.key == 'Escape') this.paint();
    });
    this.input.addEventListener('blur', () => this.paint());
    this.toggle.addEventListener('click', () => this.open(!!this.pop.hidden));
    this.pop.addEventListener('keydown', (e) => {
      if (e.key == 'Escape') {
        e.stopPropagation();
        this.open(false);
        this.toggle.focus();
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.pop.hidden && !this.contains(e.target as Node)) this.open(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key == 'Escape' && !this.pop.hidden) {
        this.open(false);
        this.toggle.focus();
      }
    });
    this.paint();
  }

  private commit() {
    const v = parseNoteInput(this.input.value);
    if (v == null) {
      this.input.setAttribute('aria-invalid', 'true');
      return;
    }
    this.input.removeAttribute('aria-invalid');
    this.set(v);
  }

  private set(v: NoteValue) {
    const changed = v !== this._value;
    this._value = v;
    this.paint();
    if (changed) this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private open(on: boolean) {
    if (on && this.disabled) return;
    this.pop.hidden = !on;
    this.toggle.setAttribute('aria-expanded', String(on));
    if (on) {
      const m = this.midi();
      this.octave = Number.isFinite(m) ? Math.floor(m / 12) - 1 : 4;
      this.renderKeys();
      const target =
        this.keys.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        (this.keys.firstElementChild as HTMLElement | null);
      target?.focus();
    }
  }

  private shift(d: number) {
    this.octave = Math.min(8, Math.max(1, this.octave + d));
    this.renderKeys();
  }

  private midi() {
    const v = this._value;
    return typeof v == 'number' ? Math.round(69 + 12 * Math.log2(v / 440)) : noteToMidi(v);
  }

  /** Two octaves starting at `octave`. Rebuilt only when the octave changes (keeps focus). */
  private renderKeys() {
    this.octaveLabel.textContent = `C${this.octave}–B${this.octave + 1}`;
    const start = (this.octave + 1) * 12;
    this.keys.replaceChildren(
      ...Array.from({ length: 24 }, (_, i) => {
        const name = midiToName(start + i);
        return h('button', {
          type: 'button',
          class: BLACK.has(i % 12) ? 'key black' : 'key white',
          'aria-label': name,
          'data-midi': start + i,
          title: `${name} · ${formatHz(toHz(name))}`,
          // Safari does not focus buttons on click; do it so Escape and arrows keep working.
          onclick: (e: Event) => {
            (e.currentTarget as HTMLElement).focus();
            this.set(name);
          },
        });
      }),
    );
    this.markKeys();
  }

  /** Update which key shows as the current note. */
  private markKeys() {
    const cur = typeof this._value == 'string' ? noteToMidi(this._value) : NaN;
    for (const k of this.keys.children)
      k.setAttribute('aria-pressed', String(Number((k as HTMLElement).dataset.midi) === cur));
  }

  private paint() {
    const v = this._value;
    this.input.value = typeof v == 'number' ? `${v} Hz` : v;
    this.input.removeAttribute('aria-invalid');
    this.input.disabled = this.disabled;
    this.toggle.disabled = this.disabled;
    this.hz.textContent = formatHz(toHz(v));
    if (!this.pop.hidden) this.markKeys();
  }
}

if (!customElements.get('sd-note')) customElements.define('sd-note', SdNote);

declare global {
  interface HTMLElementTagNameMap {
    'sd-note': SdNote;
  }
}

export function noteField(label: string, value: NoteValue): SdNote {
  const n = document.createElement('sd-note');
  n.setAttribute('label', label);
  n.value = value;
  return n;
}

/** Transpose a note value by semitones (used to pick a default sweep target). */
export function transpose(v: NoteValue, semis: number): NoteValue {
  if (typeof v == 'number') return Math.round(v * 2 ** (semis / 12) * 100) / 100;
  const m = noteToMidi(v);
  return Number.isFinite(m) ? midiToName(m + semis) : v;
}

export { NOTE_NAMES };
