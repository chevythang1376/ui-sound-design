const buffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Park-Miller PRNG, used only when a seed (1 .. 2^31-2) is given: deterministic tests. */
export const seeded =
  (s: number): (() => number) =>
  () =>
    (s = (s * 16807) % 2147483647) / 2147483647;

/**
 * A fresh looping source over the shared 1-second white-noise buffer of this context
 * (buffer created lazily, once per context). Start it at a random offset.
 */
export const noiseSource = (c: BaseAudioContext, rnd: () => number): AudioBufferSourceNode => {
  let b = buffers.get(c);
  if (!b) {
    buffers.set(c, (b = c.createBuffer(1, c.sampleRate, c.sampleRate)));
    b.getChannelData(0).forEach((_, i, d) => (d[i] = rnd() * 2 - 1));
  }
  const n = c.createBufferSource();
  n.buffer = b;
  n.loop = true;
  return n;
};
