/** WCAG AA contrast for the editor's and the stage's text colors (read from main.css). */
import { describe, expect, it } from 'vitest';
import css from '../../src/editor/styles/main.css?raw';

const vars = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );

const root = vars(/:root\s*\{([\s\S]*?)\}/.exec(css)![1]!);
// The .stage-demo block that defines the stage palette (not the responsive override).
const stage = vars(/\.stage-demo\s*\{(\s*--ui-bg[^}]*)\}/.exec(css)![1]!);

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('WCAG AA contrast (4.5:1 for text)', () => {
  const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'];
  it('editor text colors on every surface', () => {
    for (const s of surfaces)
      for (const fg of ['text', 'text-dim', 'accent', 'danger', 'ok'])
        expect(ratio(root[fg]!, root[s]!), `${fg} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  it('accent buttons and danger badges', () => {
    expect(ratio(root['accent-ink']!, root.accent!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#2a0a0a', root.danger!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(root.focus!, root.bg!)).toBeGreaterThanOrEqual(3); // focus ring: non-text 3:1
  });

  it('stage component colors', () => {
    for (const bg of ['ui-bg', 'ui-card'])
      for (const fg of ['ui-text', 'ui-dim', 'ui-error', 'ui-ok', 'ui-brand'])
        expect(ratio(stage[fg]!, stage[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio(stage['ui-brand-ink']!, stage['ui-brand']!)).toBeGreaterThanOrEqual(4.5);
  });
});
