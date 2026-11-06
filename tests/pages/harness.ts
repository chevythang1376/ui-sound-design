/**
 * Browser-side test harness (served by Vite, never built into the site). It exposes the engine
 * and a few analysis helpers on window.harness for Playwright.
 */
import { createKit, type Kit, type Recipe } from '../../src/engine/index';

/** The "success" example recipe from the brief (M1 test sound). */
export const SUCCESS: Recipe = {
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
};

export const M1_KIT: Kit = {
  v: 1,
  name: 'M1',
  theme: { pitch: 0, volume: 0.5 },
  sounds: { success: SUCCESS },
};

export interface Analysis {
  /** Seconds returned by kit.render() (envelope end + stop margin). */
  declared: number;
  peak: number;
  rms: number;
  /** Last sample above -80 dBFS, in seconds. */
  audibleEnd: number;
  /** Max |x| over the last 10 ms of the envelope. */
  tailPeak: number;
  /** Max |x| after the declared end. */
  afterPeak: number;
  samples: number[];
}

export const SAMPLE_RATE = 44100;

/** Render one sound of `kit` offline (mono, 44.1 kHz, 1 s by default) and analyze it. */
export async function renderSound(
  kit: Kit,
  name: string,
  opts: { seed?: number; length?: number } = {},
): Promise<Analysis> {
  const ctx = new OfflineAudioContext(1, Math.round(SAMPLE_RATE * (opts.length ?? 1)), SAMPLE_RATE);
  const k = createKit(kit, { seed: opts.seed ?? 1, respectReducedMotion: false });
  const declared = k.render(name, ctx);
  const buf = await ctx.startRendering();
  k.destroy();
  return analyze(buf.getChannelData(0), declared);
}

export function analyze(data: Float32Array, declared: number): Analysis {
  const sr = SAMPLE_RATE;
  let peak = 0;
  let sum = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]!);
    if (a > peak) peak = a;
    sum += a * a;
    if (a > 1e-4) last = i;
  }
  const envEnd = Math.round((declared - 0.03) * sr);
  const max = (from: number, to: number) => {
    let m = 0;
    for (let i = Math.max(0, from); i < Math.min(data.length, to); i++)
      m = Math.max(m, Math.abs(data[i]!));
    return m;
  };
  return {
    declared,
    peak,
    rms: Math.sqrt(sum / data.length),
    audibleEnd: last / sr,
    tailPeak: max(envEnd - Math.round(0.01 * sr), envEnd),
    afterPeak: max(Math.round(declared * sr), data.length),
    samples: Array.from(data),
  };
}

const kit = createKit(M1_KIT, { respectReducedMotion: false });

const harness = { createKit, renderSound, analyze, kit, M1_KIT, SUCCESS };
export type Harness = typeof harness;
(window as unknown as { harness: Harness }).harness = harness;

document.querySelector('#play')?.addEventListener('click', () => kit.play('success'));
