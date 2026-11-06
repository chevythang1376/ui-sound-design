import { expect, test } from '@playwright/test';
import { harnessReady, skipWithoutWebAudio } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/pages/engine.html');
  await harnessReady(page);
  await skipWithoutWebAudio(page);
});

test('success recipe renders offline: audible, no clipping, decays, under 500 ms', async ({
  page,
}) => {
  const a = await page.evaluate(async () => {
    const { renderSound, M1_KIT } = window.harness;
    const r = await renderSound(M1_KIT, 'success');
    return { ...r, samples: [] };
  });
  expect(a.peak, 'not silent').toBeGreaterThan(0.02);
  expect(a.peak, 'no clipping').toBeLessThan(0.9);
  expect(a.tailPeak, 'tail decays to near-silence').toBeLessThan(0.001);
  expect(a.afterPeak, 'silent after the declared end').toBeLessThan(1e-4);
  expect(a.declared, 'declared length').toBeLessThan(0.5);
  expect(a.audibleEnd, 'audible length').toBeLessThan(0.5);
});

test('theme pitch transposes at play time, recipe untouched', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { renderSound, M1_KIT } = window.harness;
    // Count zero crossings in the first 50 ms: an octave up roughly doubles them.
    const zc = (s: number[]) => {
      let n = 0;
      for (let i = 1; i < 2205; i++) if (s[i - 1]! < 0 !== s[i]! < 0) n++;
      return n;
    };
    const up = await renderSound({ ...M1_KIT, theme: { pitch: 12, volume: 0.5 } }, 'success');
    const base = await renderSound(M1_KIT, 'success');
    return {
      up: zc(up.samples),
      base: zc(base.samples),
      note: M1_KIT.sounds.success!.voices[0]!.note,
    };
  });
  expect(r.up / r.base).toBeGreaterThan(1.8);
  expect(r.up / r.base).toBeLessThan(2.2);
  expect(r.note).toBe('E5');
});

test('unknown future wave is skipped, not thrown on', async ({ page }) => {
  const a = await page.evaluate(async () => {
    const { renderSound } = window.harness;
    const kit = {
      v: 1,
      sounds: {
        x: {
          voices: [
            { wave: 'fm', note: 'C5' },
            { wave: 'sine', note: 'C5' },
          ],
          env: { a: 2, d: 60 },
        },
        y: { voices: [{ wave: 'fm', note: 'C5' }] },
      },
    };
    const x = await renderSound(kit, 'x');
    const y = await renderSound(kit, 'y');
    return { x: x.peak, y: y.peak, yLen: y.declared };
  });
  expect(a.x).toBeGreaterThan(0.01);
  expect(a.y).toBe(0);
  expect(a.yLen).toBe(0);
});
