/** Offline render + analysis helpers shared by the test pages. */
import { createKit, type Kit } from '../../src/engine/index';

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
  opts: { seed?: number; length?: number; create?: typeof createKit } = {},
): Promise<Analysis> {
  const ctx = new OfflineAudioContext(1, Math.round(SAMPLE_RATE * (opts.length ?? 1)), SAMPLE_RATE);
  const k = (opts.create ?? createKit)(kit, { seed: opts.seed ?? 1, respectReducedMotion: false });
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
