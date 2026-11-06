import { applyEnv, fullEnv } from './envelope';
import { noiseSource } from './noise';
import { pitchRatio } from './theme';
import { safe } from './util';
import { voice } from './voice';
import { FILTER_DEFAULTS, RECIPE_DEFAULTS, VOICE_DEFAULTS, type Recipe, type Theme } from './types';

/** Sources stop this long after their envelope ends. */
export const STOP_MARGIN = 0.03;
/** Stolen voices fade over ~5 ms (an exponential approach with this time constant). */
export const STEAL_TAU = 0.0015;

export interface Playing {
  /** Seconds from now until every source has stopped. */
  d: number;
  /** Steal: fast fade, then stop. Never a hard cut. */
  k: () => void;
}

/**
 * Build and schedule one play of a recipe on any BaseAudioContext (realtime or offline):
 *
 *   voice osc ─► env gain ─┐
 *   noise src ─► env gain ─┴─► filter ─► recipe gain ─► out (master)
 *
 * The envelope shape is shared; each voice triggers it at its own delayMs so two-note chimes
 * ring. Every node is fresh and is disconnected when the last source ends; `own` is one more
 * node to disconnect then (kit.render() passes its private master). No pooling.
 */
export const render = (
  c: BaseAudioContext,
  r: Recipe,
  out: AudioNode,
  theme: Theme | undefined,
  semis = 0,
  rnd: () => number = Math.random,
  own?: AudioNode,
): Playing | undefined => {
  const t = c.currentTime;
  const e = fullEnv(r.env);
  const f = { ...FILTER_DEFAULTS, ...r.filter };
  const mul = pitchRatio(theme, semis);
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  const nodes = [filter, g, own];
  const sources: AudioScheduledSourceNode[] = [];
  let end = t;
  filter.type = f.type as BiquadFilterType;
  filter.frequency.value = f.cutoff;
  filter.Q.value = f.q;
  g.gain.value = r.gain ?? RECIPE_DEFAULTS.gain;
  filter.connect(g).connect(out);

  const add = (
    s: AudioScheduledSourceNode | undefined,
    at: number,
    level: number,
    off?: number,
  ) => {
    if (s && level > 0) {
      const eg = c.createGain();
      const stop = applyEnv(eg.gain, at, e, level) + STOP_MARGIN;
      s.connect(eg).connect(filter);
      (s as AudioBufferSourceNode).start(at, off);
      s.stop(stop);
      end = Math.max(end, stop);
      nodes.push(s, eg);
      sources.push(s);
    }
  };

  for (const v0 of r.voices) {
    const v = { ...VOICE_DEFAULTS, ...v0 };
    const at = t + v.delayMs / 1e3;
    add(voice(c, v, at, mul), at, v.gain);
  }
  if (r.noise) add(noiseSource(c, rnd), t, r.noise, rnd());

  const cleanup = () => nodes.forEach((n) => n?.disconnect());
  let left = sources.length;
  if (!left) return void cleanup();
  sources.forEach((s) => (s.onended = () => --left || cleanup()));

  return {
    d: end - t,
    k() {
      const n = c.currentTime;
      g.gain.setTargetAtTime(0, n, STEAL_TAU);
      sources.forEach((s) => safe(() => s.stop(n + STEAL_TAU * 7)));
    },
  };
};
