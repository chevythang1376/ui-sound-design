/**
 * Synth panel for the selected sound: Source, Pitch, Envelope, Filter, Texture, Output.
 * Every control reads from and writes to the store; knob drags coalesce into one undo step.
 */
import { LONG_SOUND_MS, V1_EDITABLE_VOICES, recipeMs } from '../../engine/schema';
import { VOICE_DEFAULTS, type NoteValue, type Recipe, type Voice } from '../../engine/types';
import { PRESET_INFO } from '../../presets/default-kit';
import type { Store } from '../store';
import { h, switchControl } from '../ui/dom';
import { knob, type SdKnob } from '../ui/knob';
import { noteField, transpose, type SdNote } from '../ui/note-field';
import { segmented, type SdSegmented } from '../ui/segmented';
import { drawEnvelope } from './envelope-view';
import type { Scope } from './scope';

const WAVE_OPTS = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri', title: 'Triangle' },
  { value: 'square', label: 'Sqr', title: 'Square' },
  { value: 'sawtooth', label: 'Saw', title: 'Sawtooth' },
];

export const labelFor = (id: string): string => PRESET_INFO.find((p) => p.id == id)?.label ?? id;

export interface SynthPanel {
  el: HTMLElement;
  update(): void;
  durationText(): string;
}

export function synthPanel(store: Store, scope: Scope, play: () => void): SynthPanel {
  const el = h('section', { class: 'synth', 'aria-label': 'Synth panel' });
  /** Stashed voice 2 per sound, so turning it off and on again keeps its settings. */
  const stash = new Map<string, Voice>();
  let syncers: (() => void)[] = [];
  let shape = '';
  let envCanvas: HTMLCanvasElement;
  let durationEl: HTMLElement;

  const r = () => store.recipe;
  const voiceAt = (i: number) => r().voices[i];

  /** Wire a knob to a recipe path. */
  const bindKnob = (
    k: SdKnob,
    key: string,
    get: (r: Recipe) => number,
    set: (r: Recipe, v: number) => void,
  ) => {
    k.addEventListener('input', () => store.editRecipe(key, (rr) => set(rr, k.value)));
    k.addEventListener('change', () => store.seal());
    syncers.push(() => (k.value = get(r())));
    return k;
  };

  const voiceKnob = (i: number, key: keyof Voice & string, attrs: Parameters<typeof knob>[0]) => {
    const k = knob(attrs);
    bindKnob(
      k,
      `v${i}.${key}`,
      (rr) =>
        (rr.voices[i]?.[key] as number | undefined) ??
        (VOICE_DEFAULTS as unknown as Record<string, number>)[key] ??
        0,
      (rr, v) => {
        if (rr.voices[i]) (rr.voices[i] as Record<string, unknown>)[key] = v;
      },
    );
    syncers.push(() => (k.disabled = !voiceAt(i)));
    return k;
  };

  const voiceSeg = (i: number) => {
    const s = segmented(`Voice ${i + 1} wave`, WAVE_OPTS, voiceAt(i)?.wave ?? 'sine');
    s.addEventListener('change', () =>
      store.edit(null, (k) => {
        const v = k.sounds[store.selected]!.voices[i];
        if (v) v.wave = s.value;
      }),
    );
    syncers.push(() => {
      s.value = voiceAt(i)?.wave ?? 'sine';
      s.disabled = !voiceAt(i);
    });
    return s;
  };

  const noteCtl = (i: number, which: 'note' | 'sweepTo', label: string) => {
    const n = noteField(label, (voiceAt(i)?.[which] as NoteValue | undefined) ?? 'A4');
    n.addEventListener('change', () =>
      store.edit(null, (k) => {
        const v = k.sounds[store.selected]!.voices[i];
        if (v) v[which] = n.value;
      }),
    );
    syncers.push(() => {
      const v = voiceAt(i);
      if (v?.[which] != null) n.value = v[which] as NoteValue;
      n.disabled = !v || (which == 'sweepTo' && v.sweepTo == null);
    });
    return n;
  };

  const WIDE = new Set(['Source', 'Pitch', 'Envelope']);
  const section = (title: string, hint: string | null, ...body: (Node | null)[]) =>
    h(
      'section',
      { class: WIDE.has(title) ? 'panel wide' : 'panel', 'aria-label': title },
      h('h3', { class: 'panel-title' }, title),
      hint ? h('p', { class: 'hint' }, hint) : null,
      ...body,
    );

  const sourceRow = (i: number) => {
    const head =
      i == 0
        ? h('span', { class: 'voice-name' }, 'Voice 1')
        : (() => {
            const sw = switchControl('Voice 2', !!voiceAt(1), (on) => toggleVoice2(on));
            if (r().voices.length > V1_EDITABLE_VOICES) sw.input.disabled = true;
            syncers.push(() => (sw.input.checked = !!voiceAt(1)));
            return sw.root;
          })();
    return h(
      'div',
      { class: 'voice-row' },
      h('div', { class: 'voice-head' }, head),
      voiceSeg(i),
      voiceKnob(i, 'gain', {
        label: 'Gain',
        name: `Voice ${i + 1} gain`,
        min: 0,
        max: 1,
        step: 0.01,
        value: 1,
        default: 1,
      }),
      voiceKnob(i, 'detune', {
        label: 'Detune',
        name: `Voice ${i + 1} detune`,
        min: -1200,
        max: 1200,
        step: 1,
        value: 0,
        default: 0,
        unit: 'ct',
      }),
      voiceKnob(i, 'delayMs', {
        label: 'Delay',
        name: `Voice ${i + 1} delay`,
        min: 0,
        max: 1000,
        step: 1,
        value: 0,
        default: i ? 80 : 0,
        unit: 'ms',
      }),
    );
  };

  const pitchRow = (i: number) => {
    const sweep = switchControl('Sweep', voiceAt(i)?.sweepTo != null, (on) =>
      store.edit(null, (k) => {
        const v = k.sounds[store.selected]!.voices[i];
        if (!v) return;
        if (on) v.sweepTo = transpose(v.note, 7);
        else delete v.sweepTo;
      }),
    );
    syncers.push(() => {
      sweep.input.checked = voiceAt(i)?.sweepTo != null;
      sweep.input.disabled = !voiceAt(i);
    });
    const time = voiceKnob(i, 'sweepMs', {
      label: 'Sweep time',
      name: `Voice ${i + 1} sweep time`,
      min: 0,
      max: 1000,
      step: 1,
      value: 50,
      default: 50,
      unit: 'ms',
    });
    const curve = segmented(
      `Voice ${i + 1} sweep curve`,
      [
        { value: 'exp', label: 'Exp', title: 'Exponential (sounds even across octaves)' },
        { value: 'lin', label: 'Lin', title: 'Linear in Hz' },
      ],
      voiceAt(i)?.sweepCurve ?? 'exp',
    );
    curve.addEventListener('change', () =>
      store.edit(null, (k) => {
        const v = k.sounds[store.selected]!.voices[i];
        if (v) v.sweepCurve = curve.value as 'exp' | 'lin';
      }),
    );
    syncers.push(() => {
      const v = voiceAt(i);
      curve.value = v?.sweepCurve ?? 'exp';
      curve.disabled = !v || v.sweepTo == null;
      time.disabled = !v || v.sweepTo == null;
    });
    return h(
      'div',
      { class: 'voice-row' },
      h('div', { class: 'voice-head' }, h('span', { class: 'voice-name' }, `Voice ${i + 1}`)),
      noteCtl(i, 'note', `Voice ${i + 1} start note`),
      h(
        'div',
        { class: 'sweep' },
        sweep.root,
        noteCtl(i, 'sweepTo', `Voice ${i + 1} sweep target`),
      ),
      time,
      curve,
    );
  };

  const toggleVoice2 = (on: boolean) =>
    store.edit(null, (k) => {
      const rr = k.sounds[store.selected]!;
      if (on && rr.voices.length < 2) {
        const v1 = rr.voices[0]!;
        rr.voices.push(
          stash.get(store.selected) ?? {
            wave: v1.wave ?? 'sine',
            note: transpose(v1.note, 7),
            delayMs: 80,
            gain: 0.6,
            sweepMs: 50,
            sweepCurve: 'exp',
            detune: 0,
          },
        );
      } else if (!on && rr.voices.length == 2) {
        stash.set(store.selected, rr.voices.pop()!);
      }
    });

  const envKnob = (key: 'a' | 'd' | 's' | 'r' | 'h', attrs: Parameters<typeof knob>[0]) =>
    bindKnob(
      knob(attrs),
      `env.${key}`,
      (rr) => rr.env?.[key] ?? 0,
      (rr, v) => (rr.env = { ...rr.env, [key]: v }),
    );

  const build = () => {
    syncers = [];
    const id = store.selected;
    const info = PRESET_INFO.find((p) => p.id == id);
    const playBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-accent',
        onclick: play,
        'aria-label': `Play ${labelFor(id)}`,
      },
      h('span', { 'aria-hidden': 'true' }, '▶ '),
      'Play',
    );
    const auto = switchControl('Auto-play on change', store.autoplay, (on) =>
      store.setAutoplay(on),
    );
    durationEl = h('span', { class: 'duration mono', 'aria-live': 'polite' });
    const extra =
      r().voices.length > V1_EDITABLE_VOICES
        ? h(
            'p',
            { class: 'hint warn' },
            `This recipe has ${r().voices.length} voices. All of them play; the v1 editor edits the first two.`,
          )
        : null;

    envCanvas = h('canvas', {
      class: 'env-canvas',
      role: 'img',
      'aria-label': 'Envelope shape',
    });
    const s = envKnob('s', {
      label: 'Sustain',
      min: 0,
      max: 1,
      step: 0.01,
      value: 0,
      default: 0,
      title: 'Sustain level. At 0 the sound ends after attack + decay.',
    });
    const hold = envKnob('h', {
      label: 'Hold',
      min: 0,
      max: 2000,
      step: 1,
      value: 0,
      default: 0,
      unit: 'ms',
    });
    const rel = envKnob('r', {
      label: 'Release',
      min: 1,
      max: 3000,
      step: 1,
      value: 100,
      default: 100,
      unit: 'ms',
      scale: 'log',
    });
    for (const k of [hold, rel]) k.title = 'Only used when Sustain is above 0.';
    syncers.push(() => {
      const on = (r().env?.s ?? 0) > 0;
      hold.classList.toggle('inactive', !on);
      rel.classList.toggle('inactive', !on);
    });

    const filterType = segmented(
      'Filter type',
      [
        { value: 'lowpass', label: 'Low-pass' },
        { value: 'bandpass', label: 'Band-pass' },
      ],
      r().filter?.type ?? 'lowpass',
    );
    filterType.addEventListener('change', () =>
      store.edit(null, (k) => {
        const rr = k.sounds[store.selected]!;
        rr.filter = { ...rr.filter, type: filterType.value };
      }),
    );
    syncers.push(() => (filterType.value = r().filter?.type ?? 'lowpass'));

    el.replaceChildren(
      ...[
        h(
          'header',
          { class: 'synth-head' },
          h(
            'div',
            null,
            h('h2', { class: 'synth-title' }, labelFor(id)),
            h('p', { class: 'synth-sub' }, info?.character ?? 'Custom sound'),
          ),
          h('div', { class: 'synth-actions' }, durationEl, auto.root, playBtn),
        ),
        extra,
        h(
          'div',
          { class: 'panels' },
          section('Source', null, sourceRow(0), sourceRow(1)),
          section(
            'Pitch',
            'Note names (E5, C#4, Bb3) or Hz. The global pitch knob transposes at play time.',
            pitchRow(0),
            pitchRow(1),
          ),
          section(
            'Envelope',
            'Attack, Decay, Sustain, Release (+ Hold). When Sustain is 0 the sound ends after A + D; Hold and Release only matter when Sustain is above 0.',
            h(
              'div',
              { class: 'knob-row' },
              envKnob('a', {
                label: 'Attack',
                min: 1,
                max: 1000,
                step: 1,
                value: 2,
                default: 2,
                unit: 'ms',
                scale: 'log',
              }),
              envKnob('d', {
                label: 'Decay',
                min: 1,
                max: 3000,
                step: 1,
                value: 120,
                default: 120,
                unit: 'ms',
                scale: 'log',
              }),
              s,
              hold,
              rel,
            ),
            envCanvas,
          ),
          section(
            'Filter',
            null,
            h(
              'div',
              { class: 'knob-row' },
              filterType,
              bindKnob(
                knob({
                  label: 'Cutoff',
                  name: 'Filter cutoff',
                  min: 80,
                  max: 16000,
                  step: 1,
                  value: 16000,
                  default: 16000,
                  unit: 'Hz',
                  scale: 'log',
                }),
                'filter.cutoff',
                (rr) => rr.filter?.cutoff ?? 16000,
                (rr, v) => (rr.filter = { ...rr.filter, cutoff: v }),
              ),
              bindKnob(
                knob({
                  label: 'Resonance',
                  name: 'Filter resonance',
                  min: 0.1,
                  max: 20,
                  step: 0.01,
                  value: 0.7,
                  default: 0.7,
                  scale: 'log',
                }),
                'filter.q',
                (rr) => rr.filter?.q ?? 0.7,
                (rr, v) => (rr.filter = { ...rr.filter, q: v }),
              ),
            ),
          ),
          section(
            'Texture',
            'Filtered white noise mixed into the voices: adds tick and air.',
            h(
              'div',
              { class: 'knob-row' },
              bindKnob(
                knob({
                  label: 'Noise',
                  name: 'Noise blend',
                  min: 0,
                  max: 1,
                  step: 0.01,
                  value: 0,
                  default: 0,
                  unit: '%',
                }),
                'noise',
                (rr) => rr.noise ?? 0,
                (rr, v) => (rr.noise = v),
              ),
            ),
          ),
          section(
            'Output',
            null,
            h(
              'div',
              { class: 'knob-row' },
              bindKnob(
                knob({
                  label: 'Gain',
                  name: 'Output gain',
                  min: 0,
                  max: 1,
                  step: 0.01,
                  value: 0.3,
                  default: 0.3,
                }),
                'gain',
                (rr) => rr.gain ?? 0.3,
                (rr, v) => (rr.gain = v),
              ),
            ),
            scope.el,
          ),
        ),
      ].filter((n): n is HTMLElement => !!n),
    );
    shape = shapeOf();
    sync();
  };

  const shapeOf = () => `${store.selected}|${r().voices.length}`;

  const durationText = () => `${Math.round(recipeMs(r()))} ms`;

  const sync = () => {
    for (const f of syncers) f();
    const ms = recipeMs(r());
    durationEl.textContent =
      ms > LONG_SOUND_MS
        ? `${Math.round(ms)} ms · over ${LONG_SOUND_MS} ms`
        : `${Math.round(ms)} ms`;
    durationEl.classList.toggle('over', ms > LONG_SOUND_MS);
    durationEl.title =
      ms > LONG_SOUND_MS ? 'UI sounds should finish well under half a second.' : 'Total length';
    drawEnvelope(envCanvas, r());
  };

  build();
  new ResizeObserver(() => drawEnvelope(envCanvas, r())).observe(el);

  return {
    el,
    update() {
      if (shapeOf() != shape) build();
      else sync();
    },
    durationText,
  };
}

export type { SdNote, SdSegmented };
