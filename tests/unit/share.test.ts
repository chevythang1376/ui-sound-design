import { describe, expect, it } from 'vitest';
import { decodeKit, encodeKit, readHash, shareUrl } from '../../src/editor/share';
import { validateKit } from '../../src/engine/schema';
import { defaultKit } from '../../src/presets/default-kit';

describe('URL share', () => {
  it('round-trips compressed (deflate-raw)', async () => {
    const kit = defaultKit();
    const enc = await encodeKit(kit, true);
    expect(enc.startsWith('z.')).toBe(true);
    expect(enc).toMatch(/^z\.[A-Za-z0-9_-]+$/);
    expect(await decodeKit(enc)).toEqual(kit);
  });

  it('round-trips the uncompressed fallback', async () => {
    const kit = defaultKit();
    const enc = await encodeKit(kit, false);
    expect(enc).toMatch(/^j\.[A-Za-z0-9_-]+$/);
    expect(await decodeKit(enc)).toEqual(kit);
  });

  it('compression makes links much shorter', async () => {
    const kit = defaultKit();
    const z = await encodeKit(kit, true);
    const j = await encodeKit(kit, false);
    expect(z.length).toBeLessThan(j.length / 2);
  });

  it('keeps unicode names and unknown fields', async () => {
    const kit = { ...defaultKit(), name: 'Klänge ✨', future: { a: 1 } };
    expect(await decodeKit(await encodeKit(kit, true))).toEqual(kit);
    expect(await decodeKit(await encodeKit(kit, false))).toEqual(kit);
  });

  it('decoded kits pass validation', async () => {
    const v = validateKit(await decodeKit(await encodeKit(defaultKit())));
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('reports damaged links readably', async () => {
    await expect(decodeKit('z.!!!')).rejects.toThrow(/damaged/);
    await expect(decodeKit('z.AAAA')).rejects.toThrow(/damaged|JSON/);
    await expect(decodeKit('j.bm90IGpzb24')).rejects.toThrow(/valid JSON/);
    await expect(decodeKit('q.abc')).rejects.toThrow(/Unknown share link format/);
    await expect(decodeKit('z.')).rejects.toThrow(/empty/);
  });

  it('reads and builds #k= hashes', async () => {
    expect(readHash('#k=z.abc')).toBe('z.abc');
    expect(readHash('#other=1&k=j.x_y-z')).toBe('j.x_y-z');
    expect(readHash('')).toBeNull();
    const url = await shareUrl(defaultKit(), 'https://example.com/app/#old');
    expect(url.startsWith('https://example.com/app/#k=')).toBe(true);
    expect(await decodeKit(readHash(new URL(url).hash)!)).toEqual(defaultKit());
  });
});
