import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  buildEsm,
  buildIife,
  byteLength,
  createKitLocal,
  gzipSize,
  header,
  kitJson,
  safeName,
  stripForRuntime,
} from '../../src/export/build-kit';
import { RUNTIME } from '../../src/export/runtime';
import { allExports } from '../../src/export/snippets';
import { DEFAULT_KIT, defaultKit } from '../../src/presets/default-kit';
import type { Kit } from '../../src/engine/types';

/** Network calls and audio files. Word boundaries: the runtime legitimately reads `.wave`. */
const FORBIDDEN = [
  /\bfetch\b/,
  /XMLHttpRequest/,
  /\.wav\b/i,
  /\.mp3\b/i,
  /\.ogg\b/i,
  /data:audio/i,
  /sendBeacon/,
  /WebSocket/,
  /\bimport\(/,
];

/** The JS inside every <script> of an HTML string. */
const scripts = (html: string) =>
  [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

describe('exporter output', () => {
  const files = allExports(RUNTIME, DEFAULT_KIT);

  it('produces the four formats', () => {
    expect(files.map((f) => f.kind)).toEqual(['esm', 'script', 'cms', 'html']);
    expect(files.map((f) => f.filename)).toEqual([
      'sound-kit.js',
      'sound-kit.iife.js',
      'sound-kit-cms-block.html',
      'sound-kit-example.html',
    ]);
  });

  it('every format contains the kit JSON and the one-line header', () => {
    const json = kitJson(DEFAULT_KIT);
    for (const f of files) {
      expect(f.code, f.kind).toContain(json);
      expect(f.code, f.kind).toContain('/* Made with UI Sound Designer — My Kit — v1 */');
    }
  });

  it('contains no fetch, XMLHttpRequest, audio files or data:audio', () => {
    for (const f of files)
      for (const bad of FORBIDDEN) expect(f.code, `${f.kind}: ${bad}`).not.toMatch(bad);
    for (const bad of FORBIDDEN) expect(RUNTIME.esm + RUNTIME.iife, String(bad)).not.toMatch(bad);
  });

  it('ES module parses as valid JS and exports default + createKit', () => {
    const code = files[0]!.code;
    expect(() => transformSync(code, { format: 'esm', loader: 'js' })).not.toThrow();
    expect(code).toMatch(/export default \w+\(\{/);
    expect(code).toMatch(/export\{\w+ as createKit\};\s*$/);
  });

  it('script tag and HTML snippets parse as valid JS', () => {
    expect(() => new Function(files[1]!.code)).not.toThrow();
    for (const f of files.slice(2)) {
      const js = scripts(f.code);
      expect(js.length, f.kind).toBe(1);
      expect(() => new Function(js[0]!), f.kind).not.toThrow();
    }
  });

  it('the ES module is importable outside a browser (no window): SSR-safe', async () => {
    const code = buildEsm(RUNTIME, DEFAULT_KIT);
    const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    expect(typeof mod.default.play).toBe('function');
    expect(typeof mod.createKit).toBe('function');
    expect(() => mod.default.play('click')).not.toThrow();
    expect(mod.default.isMuted()).toBe(false);
  });

  it('the CMS block has a styled mute button and usage notes, and guards on window.SoundKit', () => {
    const cms = files[2]!.code;
    expect(cms).toMatch(/^<!--[\s\S]*?Paste this whole block[\s\S]*?-->/);
    expect(cms).toContain(
      '<button type="button" class="soundkit-mute" data-sound-mute>Mute sounds</button>',
    );
    expect(cms).toContain('<style>');
    expect(cms).toContain('if(k){m();return}');
    expect(cms).toContain('k=w.SoundKit=');
  });
});

describe('kit JSON in the export', () => {
  it('strips defaults and fields the v1 runtime ignores', () => {
    const out = stripForRuntime(DEFAULT_KIT) as { sounds: Record<string, Record<string, unknown>> };
    expect(out.sounds.success).toEqual({
      voices: [
        { note: 'E5', sweepTo: 'B5', sweepMs: 60 },
        { wave: 'triangle', note: 'B5', delayMs: 70, gain: 0.6 },
      ],
      env: { a: 4, d: 140 },
      filter: { cutoff: 5200 },
      gain: 0.35,
    });
    expect(out).toMatchObject({ v: 1, theme: { pitch: 0, volume: 0.5 } });
    expect(out).not.toHaveProperty('options');
    expect(JSON.stringify(out)).not.toContain('"id"');
    expect(JSON.stringify(out)).not.toContain('"fx"');
  });

  it('keeps hold and release only when sustain is used', () => {
    const k = defaultKit();
    k.sounds.click!.env = { a: 1, d: 35, s: 0.4, h: 30, r: 90 };
    const env = (stripForRuntime(k) as { sounds: { click: { env: unknown } } }).sounds.click.env;
    expect(env).toEqual({ a: 1, d: 35, s: 0.4, h: 30, r: 90 });
  });

  it('keeps non-default options', () => {
    const k = defaultKit();
    k.options = { hover: true, voiceCap: 4 };
    expect(stripForRuntime(k).options).toEqual({ hover: true, voiceCap: 4 });
  });

  it('is safe to inline in a <script>', () => {
    const k: Kit = { ...defaultKit(), name: '</script><b>x' };
    k.sounds['</script>'] = k.sounds.click!;
    const iife = buildIife(RUNTIME, k);
    expect(iife).not.toContain('</script>');
    expect(() => new Function(iife)).not.toThrow();
  });
});

describe('names and headers', () => {
  it('sanitizes kit names for comments and markup', () => {
    expect(safeName('Glass */ alert(1) /*')).toBe('Glass alert(1)');
    for (const evil of ['a -- b <!-- c -->', 'x */ y /* z', '<script>alert(1)</script>']) {
      const n = safeName(evil);
      for (const bad of ['--', '<', '>', '*/', '/*']) expect(n, evil).not.toContain(bad);
    }
    expect(safeName('')).toBe('Untitled kit');
    expect(safeName('Café Sons')).toBe('Café Sons');
    expect(header({ v: 1, name: 'x */ y', sounds: {} })).toBe(
      '/* Made with UI Sound Designer — x y — v1 */',
    );
  });

  it('finds the minified createKit name', () => {
    expect(createKitLocal('var a=1;export{qe as createKit};')).toBe('qe');
    expect(createKitLocal('function createKit(){}export{createKit};')).toBe('createKit');
    expect(() => createKitLocal('var a=1;')).toThrow();
  });
});

describe('size readout helpers', () => {
  it('counts UTF-8 bytes and gzip bytes', async () => {
    expect(byteLength('—')).toBe(3);
    const code = buildEsm(RUNTIME, DEFAULT_KIT);
    const g = await gzipSize(code);
    expect(g).toBeGreaterThan(500);
    expect(g).toBeLessThan(byteLength(code));
  });
});
