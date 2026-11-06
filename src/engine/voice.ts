import { toHz } from './notes';
import { VOICE_DEFAULTS, WAVES, type Voice } from './types';

export type FullVoice = typeof VOICE_DEFAULTS & Voice;

/**
 * Build one short-lived voice oscillator with its pitch (and optional sweep) scheduled from
 * `at`. `mul` is the theme pitch ratio. Returns undefined for unplayable voices: unknown
 * (future) waves and invalid notes are skipped, never thrown on.
 */
export const voice = (
  c: BaseAudioContext,
  v: FullVoice,
  at: number,
  mul: number,
): OscillatorNode | undefined => {
  const hz = toHz(v.note) * mul;
  const to = toHz(v.sweepTo ?? NaN) * mul;
  if (!(WAVES as readonly string[]).includes(v.wave) || !(hz > 0)) return;
  const o = c.createOscillator();
  const f = o.frequency;
  o.type = v.wave as OscillatorType;
  o.detune.value = v.detune;
  f.setValueAtTime(hz, at);
  if (to > 0)
    f[v.sweepCurve == 'lin' ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](
      to,
      at + v.sweepMs / 1e3,
    );
  return o;
};
