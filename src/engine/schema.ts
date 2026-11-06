/**
 * Hand-rolled kit validator (no schema library). Used on load from localStorage, on URL import
 * and on JSON paste. It clamps out-of-range values, fills defaults, preserves unknown (future)
 * fields, and returns readable errors and warnings.
 *
 * Lives in src/engine because it owns the data contract, but index.ts does not import it, so it
 * is not part of the exported runtime. Pure: no audio.
 */
import { FLOOR, envMs, fullEnv } from './envelope';
import { noteToMidi } from './notes';
import {
  ENV_DEFAULTS,
  FILTER_DEFAULTS,
  FILTER_TYPES,
  OPTION_DEFAULTS,
  RECIPE_DEFAULTS,
  SCHEMA_VERSION,
  SWEEP_CURVE_DEFAULT,
  THEME_DEFAULTS,
  VOICE_DEFAULTS,
  WAVES,
  type Env,
  type Filter,
  type Kit,
  type NoteValue,
  type Recipe,
  type Voice,
} from './types';

export interface Validation {
  /** False only when the input cannot be used as a kit at all. */
  ok: boolean;
  /** The cleaned kit (defaults filled). Present whenever ok is true. */
  kit: Kit | null;
  /** Values that were wrong and had to be replaced or dropped. */
  errors: string[];
  /** Values that were clamped, or kept but will not play in v1. */
  warnings: string[];
}

/** Value ranges. The editor's knobs use the same or narrower ranges. */
export const RANGES = {
  pitch: [-12, 12],
  volume: [0, 1],
  voiceCap: [1, 32],
  hz: [20, 20000],
  sweepMs: [0, 2000],
  delayMs: [0, 2000],
  voiceGain: [0, 1],
  detune: [-1200, 1200],
  a: [0, 2000],
  d: [0, 5000],
  s: [0, 1],
  r: [0, 5000],
  h: [0, 5000],
  cutoff: [20, 20000],
  q: [0.1, 30],
  noise: [0, 1],
  gain: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

/** Max voices kept per recipe. v1 edits two; the schema allows more later. */
export const MAX_VOICES = 8;
export const V1_EDITABLE_VOICES = 2;
export const MAX_NAME = 80;
/** UI sounds should be short: the editor warns above this. */
export const LONG_SOUND_MS = 500;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x == 'object' && !Array.isArray(x);
const show = (x: unknown) => (typeof x == 'string' ? JSON.stringify(x) : String(x));

class Issues {
  errors: string[] = [];
  warnings: string[] = [];
  err(path: string, msg: string) {
    this.errors.push(`${path}: ${msg}`);
  }
  warn(path: string, msg: string) {
    this.warnings.push(`${path}: ${msg}`);
  }

  /** A number in [min, max]: missing -> default; wrong type -> error + default; out of range -> clamp + warning. */
  num(o: Obj, key: string, range: readonly [number, number], def: number, path: string): number {
    const v = o[key];
    if (v === undefined) return def;
    const n = typeof v == 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n != 'number' || !Number.isFinite(n)) {
      this.err(`${path}.${key}`, `expected a number, got ${show(v)}; using ${def}`);
      return def;
    }
    const [min, max] = range;
    if (n < min || n > max) {
      const c = Math.min(max, Math.max(min, n));
      this.warn(`${path}.${key}`, `${n} is outside ${min}..${max}; clamped to ${c}`);
      return c;
    }
    return n;
  }

  bool(o: Obj, key: string, def: boolean, path: string): boolean {
    const v = o[key];
    if (v === undefined) return def;
    if (typeof v != 'boolean') {
      this.err(`${path}.${key}`, `expected true or false, got ${show(v)}; using ${def}`);
      return def;
    }
    return v;
  }

  /** A note name or Hz. Returns undefined when invalid (after reporting). */
  note(v: unknown, path: string): NoteValue | undefined {
    if (typeof v == 'number' || (typeof v == 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v))) {
      const n = Number(v);
      const [min, max] = RANGES.hz;
      if (!Number.isFinite(n) || n <= 0)
        return void this.err(path, `${show(v)} is not a frequency`);
      if (n < min || n > max) {
        const c = Math.min(max, Math.max(min, n));
        this.warn(path, `${n} Hz is outside ${min}..${max} Hz; clamped to ${c}`);
        return c;
      }
      return n;
    }
    if (typeof v == 'string' && !Number.isNaN(noteToMidi(v))) {
      const t = v.trim();
      return t[0]!.toUpperCase() + t.slice(1).toLowerCase();
    }
    this.err(path, `${show(v)} is not a note name (like "E5", "C#4", "Bb3") or a number of Hz`);
    return undefined;
  }
}

/** Upgrade older kit JSON to the current schema. v1 is the first version: a stub for now. */
export function migrate(raw: Obj, issues: { warn(path: string, msg: string): void }): Obj {
  const v = raw.v;
  if (v === undefined) {
    issues.warn('v', `missing schema version; assuming v${SCHEMA_VERSION}`);
    return { ...raw, v: SCHEMA_VERSION };
  }
  if (typeof v == 'number' && v > SCHEMA_VERSION) {
    issues.warn(
      'v',
      `kit uses schema v${v}, newer than this editor (v${SCHEMA_VERSION}); unknown fields are kept but may not play`,
    );
  }
  // Future: if (v === 1) raw = v1ToV2(raw) ...
  return raw;
}

function voice(input: unknown, path: string, is: Issues): Voice {
  const o = isObj(input) ? input : {};
  if (!isObj(input)) is.err(path, `expected an object, got ${show(input)}; using a default voice`);
  const out: Voice = { ...o, note: 'A4' };
  const wave = o.wave ?? VOICE_DEFAULTS.wave;
  if (typeof wave != 'string') {
    is.err(`${path}.wave`, `expected a wave name, got ${show(wave)}; using "sine"`);
    out.wave = 'sine';
  } else {
    if (!(WAVES as readonly string[]).includes(wave))
      is.warn(`${path}.wave`, `unknown wave ${show(wave)} is kept but skipped during playback`);
    out.wave = wave;
  }
  out.note = is.note(o.note, `${path}.note`) ?? 'A4';
  if (o.sweepTo !== undefined && o.sweepTo !== null) {
    const to = is.note(o.sweepTo, `${path}.sweepTo`);
    if (to === undefined) delete out.sweepTo;
    else out.sweepTo = to;
  } else delete out.sweepTo;
  out.sweepMs = is.num(o, 'sweepMs', RANGES.sweepMs, VOICE_DEFAULTS.sweepMs, path);
  const curve = o.sweepCurve ?? SWEEP_CURVE_DEFAULT;
  if (curve !== 'exp' && curve !== 'lin') {
    is.warn(`${path}.sweepCurve`, `expected "exp" or "lin", got ${show(curve)}; using "exp"`);
    out.sweepCurve = 'exp';
  } else out.sweepCurve = curve;
  out.delayMs = is.num(o, 'delayMs', RANGES.delayMs, VOICE_DEFAULTS.delayMs, path);
  out.gain = is.num(o, 'gain', RANGES.voiceGain, VOICE_DEFAULTS.gain, path);
  out.detune = is.num(o, 'detune', RANGES.detune, VOICE_DEFAULTS.detune, path);
  return out;
}

function env(input: unknown, path: string, is: Issues): Required<Env> {
  if (input !== undefined && !isObj(input))
    is.err(path, `expected an object, got ${show(input)}; using defaults`);
  const o = isObj(input) ? input : {};
  const D = ENV_DEFAULTS;
  return {
    ...o,
    a: is.num(o, 'a', RANGES.a, D.a, path),
    d: is.num(o, 'd', RANGES.d, D.d, path),
    s: is.num(o, 's', RANGES.s, D.s, path),
    r: is.num(o, 'r', RANGES.r, D.r, path),
    h: is.num(o, 'h', RANGES.h, D.h, path),
  };
}

function filter(input: unknown, path: string, is: Issues): Required<Filter> {
  if (input !== undefined && !isObj(input))
    is.err(path, `expected an object, got ${show(input)}; using defaults`);
  const o = isObj(input) ? input : {};
  let type = o.type ?? FILTER_DEFAULTS.type;
  if (typeof type != 'string') {
    is.err(`${path}.type`, `expected a filter type, got ${show(type)}; using "lowpass"`);
    type = 'lowpass';
  } else if (!(FILTER_TYPES as readonly string[]).includes(type)) {
    is.warn(`${path}.type`, `filter type ${show(type)} is not part of v1 (lowpass, bandpass)`);
  }
  return {
    ...o,
    type: type as string,
    cutoff: is.num(o, 'cutoff', RANGES.cutoff, FILTER_DEFAULTS.cutoff, path),
    q: is.num(o, 'q', RANGES.q, FILTER_DEFAULTS.q, path),
  };
}

/** Validate one recipe. `id` is the sound's name in kit.sounds. */
export function validateRecipe(input: unknown, id: string, is: Issues = new Issues()): Recipe {
  const path = `sounds.${id}`;
  const o = isObj(input) ? input : {};
  let voices: unknown[] = Array.isArray(o.voices) ? o.voices : [];
  if (!Array.isArray(o.voices) || voices.length === 0) {
    is.err(`${path}.voices`, 'needs at least one voice; added a default sine voice');
    voices = [{ wave: 'sine', note: 'A4' }];
  }
  if (voices.length > MAX_VOICES) {
    is.warn(`${path}.voices`, `${voices.length} voices; only the first ${MAX_VOICES} are kept`);
    voices = voices.slice(0, MAX_VOICES);
  }
  if (voices.length > V1_EDITABLE_VOICES)
    is.warn(
      `${path}.voices`,
      `${voices.length} voices: all play, but the v1 editor only edits the first ${V1_EDITABLE_VOICES}`,
    );
  const out: Recipe = {
    ...o,
    id,
    voices: voices.map((v, i) => voice(v, `${path}.voices[${i}]`, is)),
    env: env(o.env, `${path}.env`, is),
    filter: filter(o.filter, `${path}.filter`, is),
    noise: is.num(o, 'noise', RANGES.noise, RECIPE_DEFAULTS.noise, path),
    gain: is.num(o, 'gain', RANGES.gain, RECIPE_DEFAULTS.gain, path),
  };
  if (o.fx !== undefined && !isObj(o.fx)) {
    is.err(`${path}.fx`, `expected an object, got ${show(o.fx)}; dropped`);
    delete out.fx;
  }
  return out;
}

/** Validate a whole kit (any JSON value). */
export function validateKit(input: unknown): Validation {
  const is = new Issues();
  if (!isObj(input)) {
    is.err('kit', 'expected a JSON object');
    return { ok: false, kit: null, errors: is.errors, warnings: is.warnings };
  }
  const raw = migrate(input, is);
  if (typeof raw.v != 'number') {
    is.err('v', `expected a schema version number, got ${show(raw.v)}; using ${SCHEMA_VERSION}`);
  }
  if (!isObj(raw.sounds)) {
    is.err('sounds', 'expected an object of named sounds, e.g. { "click": { ... } }');
    return { ok: false, kit: null, errors: is.errors, warnings: is.warnings };
  }

  let name = raw.name ?? 'Untitled kit';
  if (typeof name != 'string') {
    is.err('name', `expected text, got ${show(name)}`);
    name = 'Untitled kit';
  }
  name = (name as string).trim().slice(0, MAX_NAME) || 'Untitled kit';

  if (raw.theme !== undefined && !isObj(raw.theme)) is.err('theme', 'expected an object');
  const th = isObj(raw.theme) ? raw.theme : {};
  const theme = {
    ...th,
    pitch: is.num(th, 'pitch', RANGES.pitch, THEME_DEFAULTS.pitch, 'theme'),
    volume: is.num(th, 'volume', RANGES.volume, THEME_DEFAULTS.volume, 'theme'),
  };

  if (raw.options !== undefined && !isObj(raw.options)) is.err('options', 'expected an object');
  const op = isObj(raw.options) ? raw.options : {};
  const options: Kit['options'] = {
    ...op,
    hover: is.bool(op, 'hover', OPTION_DEFAULTS.hover, 'options'),
    voiceCap: Math.round(
      is.num(op, 'voiceCap', RANGES.voiceCap, OPTION_DEFAULTS.voiceCap, 'options'),
    ),
  };
  if (op.respectReducedMotion !== undefined)
    options.respectReducedMotion = is.bool(op, 'respectReducedMotion', true, 'options');

  const sounds: Record<string, Recipe> = {};
  for (const [id, r] of Object.entries(raw.sounds)) {
    if (!id.trim()) {
      is.err('sounds', 'a sound has an empty name; dropped');
      continue;
    }
    if (!isObj(r)) {
      is.err(`sounds.${id}`, `expected a recipe object, got ${show(r)}; dropped`);
      continue;
    }
    sounds[id] = validateRecipe(r, id, is);
  }

  const kit: Kit = {
    ...raw,
    v: typeof raw.v == 'number' ? raw.v : SCHEMA_VERSION,
    name: name as string,
    theme,
    sounds,
    options,
  };
  return { ok: true, kit, errors: is.errors, warnings: is.warnings };
}

/** Total length of a recipe in ms: the latest voice start plus the envelope. */
export const recipeMs = (r: Recipe): number =>
  envMs(fullEnv(r.env)) + Math.max(0, ...r.voices.map((v) => v.delayMs ?? VOICE_DEFAULTS.delayMs));

/** Pure envelope helpers the editor may use (it must not import envelope.ts directly). */
export { FLOOR, envMs, fullEnv };
