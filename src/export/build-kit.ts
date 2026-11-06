/**
 * Assembles export strings from the prebuilt runtime (the esbuild-minified build of
 * src/engine, see scripts/build-runtime.mjs) and the current kit JSON. It concatenates strings;
 * it never bundles at runtime. Pure: the runtime strings are passed in, so Node scripts
 * (check-size.mjs) and tests use exactly the same code as the editor.
 */
import {
  ENV_DEFAULTS,
  FILTER_DEFAULTS,
  OPTION_DEFAULTS,
  RECIPE_DEFAULTS,
  SCHEMA_VERSION,
  VOICE_DEFAULTS,
  type Kit,
  type Recipe,
  type Voice,
} from '../engine/types';

export interface Runtime {
  /** ES module ending in `export{<local> as createKit}`. */
  esm: string;
  /** An expression that evaluates to createKit: `(()=>{...;return(x)})()`. */
  iife: string;
}

type Obj = Record<string, unknown>;

/** Copy `src[keys]` that differ from `defaults`. */
const pick = (src: Obj | undefined, keys: string[], defaults: Obj = {}): Obj => {
  const out: Obj = {};
  for (const k of keys) {
    const v = src?.[k];
    if (v !== undefined && v !== null && v !== defaults[k]) out[k] = v;
  }
  return out;
};

const voiceOut = (v: Voice): Obj => {
  const keys = ['wave', 'note', 'delayMs', 'gain', 'detune'];
  // Sweep fields only matter with a sweep target; anything but "lin" plays as exponential.
  if (v.sweepTo != null) keys.push('sweepTo', 'sweepMs');
  const o = pick(v as Obj, keys, VOICE_DEFAULTS as unknown as Obj);
  if (v.sweepTo != null && v.sweepCurve == 'lin') o.sweepCurve = 'lin';
  o.note = v.note; // always explicit
  return o;
};

const recipeOut = (r: Recipe): Obj => {
  const o: Obj = { voices: r.voices.map(voiceOut) };
  // With s = 0 the envelope ends after a + d: hold and release are unused.
  const envKeys = (r.env?.s ?? 0) > 0 ? ['a', 'd', 's', 'r', 'h'] : ['a', 'd'];
  const env = pick(r.env as Obj, envKeys, ENV_DEFAULTS);
  if (Object.keys(env).length) o.env = env;
  const filter = pick(r.filter as Obj, ['type', 'cutoff', 'q'], FILTER_DEFAULTS);
  if (Object.keys(filter).length) o.filter = filter;
  Object.assign(o, pick(r as Obj, ['noise', 'gain'], RECIPE_DEFAULTS));
  return o;
};

/**
 * The kit as the runtime needs it: only fields the v1 engine reads, values equal to the engine's
 * defaults stripped, theme always included. (fx, ids, names and future fields are left out of
 * the export; the editor's JSON export and share links keep everything.)
 */
export function stripForRuntime(kit: Kit): Obj {
  const sounds: Obj = {};
  for (const [id, r] of Object.entries(kit.sounds)) sounds[id] = recipeOut(r);
  const out: Obj = {
    v: kit.v ?? SCHEMA_VERSION,
    theme: { pitch: kit.theme?.pitch ?? 0, volume: kit.theme?.volume ?? 0.5 },
    sounds,
  };
  const options = pick(
    kit.options as Obj,
    ['hover', 'voiceCap', 'respectReducedMotion'],
    OPTION_DEFAULTS,
  );
  if (Object.keys(options).length) out.options = options;
  return out;
}

/** Minified kit JSON that is also safe inside an inline <script> and in any JS context. */
export function kitJson(kit: Kit): string {
  return JSON.stringify(stripForRuntime(kit))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A kit name that cannot break a JS comment, an HTML comment or markup. */
export function safeName(name: string | undefined): string {
  const s = (name ?? '')
    .replace(/[^\p{L}\p{N} _.,'&()+!?-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return s || 'Untitled kit';
}

export const header = (kit: Kit): string =>
  `/* Made with UI Sound Designer — ${safeName(kit.name)} — v${kit.v ?? SCHEMA_VERSION} */`;

/** Local name the ESM runtime exports as createKit. */
export function createKitLocal(esm: string): string {
  const m = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(esm);
  if (!m) throw new Error('runtime.esm: no trailing export statement');
  for (const part of m[1]!.split(',')) {
    const [local, as] = part.trim().split(/\s+as\s+/);
    if ((as ?? local) == 'createKit') return local!;
  }
  throw new Error('runtime.esm: createKit is not exported');
}

/** sound-kit.js: an ES module whose default export is a ready-made kit instance. */
export function buildEsm(runtime: Runtime, kit: Kit): string {
  const local = createKitLocal(runtime.esm);
  const body = runtime.esm.replace(
    /export\s*\{[^}]*\}\s*;?\s*$/,
    `export default ${local}(${kitJson(kit)});export{${local} as createKit};`,
  );
  return `${header(kit)}\n${body}\n`;
}

/**
 * Classic-script version: creates the kit once as window.SoundKit (guarded, so pasting twice
 * creates one kit), auto-binds [data-sound] on DOMContentLoaded, turns every [data-sound-mute]
 * button into a mute toggle, leaks no other globals, and silently does nothing if the runtime
 * cannot run.
 */
export function buildIife(runtime: Runtime, kit: Kit): string {
  const wrapper =
    `!function(){var w=window,d=document,k=w.SoundKit,` +
    `m=function(){d.querySelectorAll("[data-sound-mute]:not([aria-pressed])").forEach(function(b){k.mountMuteToggle(b)})};` +
    `if(k){m();return}` +
    `try{k=w.SoundKit=(${runtime.iife})(${kitJson(kit)})}catch(e){return}` +
    `var g=function(){k.bind();m()};` +
    `d.readyState=="loading"?d.addEventListener("DOMContentLoaded",g):g()}();`;
  return `${header(kit)}\n${wrapper}\n`;
}

/** UTF-8 byte length. */
export const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** Gzip size via CompressionStream (browsers and Node 18+). */
export async function gzipSize(s: string): Promise<number> {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}
