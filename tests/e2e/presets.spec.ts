import { expect, test } from '@playwright/test';
import { DEFAULT_KIT } from '../../src/presets/default-kit';
import { harnessReady, instrument, skipWithoutWebAudio } from './helpers';

const IDS = Object.keys(DEFAULT_KIT.sounds);

test.describe('every preset renders cleanly offline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/pages/engine.html');
    await harnessReady(page);
    await skipWithoutWebAudio(page);
  });

  for (const id of IDS) {
    test(id, async ({ page }) => {
      const a = await page.evaluate(async (id) => {
        const { renderSound, DEFAULT_KIT } = window.harness;
        return { ...(await renderSound(DEFAULT_KIT, id)), samples: [] };
      }, id);
      expect(a.peak, 'not silent').toBeGreaterThan(0.005);
      expect(a.peak, 'no clipping').toBeLessThan(0.9);
      expect(a.tailPeak, 'tail decays to near-silence').toBeLessThan(0.001);
      expect(a.afterPeak, 'silent after the declared end').toBeLessThan(1e-4);
      expect(a.declared, 'declared length').toBeLessThan(0.5);
      expect(a.audibleEnd, 'audible length').toBeLessThan(0.5);
    });
  }

  test('volume scales the master and pitch transposes, without touching recipes', async ({
    page,
  }) => {
    const r = await page.evaluate(async () => {
      const { renderSound, DEFAULT_KIT } = window.harness;
      const quiet = structuredClone(DEFAULT_KIT);
      quiet.theme = { pitch: 0, volume: 0.25 };
      const a = await renderSound(DEFAULT_KIT, 'notification');
      const b = await renderSound(quiet, 'notification');
      return { ratio: b.peak / a.peak, note: quiet.sounds.notification!.voices[0]!.note };
    });
    expect(r.ratio).toBeCloseTo(0.5, 3);
    expect(r.note).toBe('B5');
  });
});

test.describe('kit page: data-sound buttons via kit.bind()', () => {
  test.beforeEach(async ({ page }) => {
    await instrument(page);
    await page.goto('/tests/pages/kit.html');
    await page.waitForFunction(() => !!window.kitPage);
  });

  test('every preset button plays its own recipe', async ({ page }) => {
    await skipWithoutWebAudio(page);
    for (const id of IDS) {
      const before = await page.evaluate(() => window.__oscStarts);
      await page.click(`[data-sound="${id}"]`);
      const voices = DEFAULT_KIT.sounds[id]!.voices.length;
      await expect
        .poll(() => page.evaluate(() => window.__oscStarts), { message: id })
        .toBe(before + voices);
    }
  });

  test('hover sounds are off by default, rate-limited when on', async ({ page }) => {
    await skipWithoutWebAudio(page);
    await page.click('[data-sound="click"]'); // unlock
    const box = async (id: string) => (await page.locator(`[data-sound="${id}"]`).boundingBox())!;
    const hoverAll = async () => {
      for (const id of ['success', 'error', 'notification', 'open']) {
        const b = await box(id);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      }
    };
    await page.waitForTimeout(100);
    let before = await page.evaluate(() => window.__oscStarts);
    await hoverAll();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__oscStarts), 'hover off').toBe(before);

    await page.evaluate(() => window.kitPage.update((k) => (k.options!.hover = true)));
    before = await page.evaluate(() => window.__oscStarts);
    await hoverAll(); // four quick entries: rate limiting lets fewer than four through
    await page.waitForTimeout(100);
    const fast = (await page.evaluate(() => window.__oscStarts)) - before;
    expect(fast).toBeGreaterThanOrEqual(1);
    expect(fast).toBeLessThanOrEqual(4);

    before = await page.evaluate(() => window.__oscStarts);
    for (const id of ['click', 'success']) {
      const b = await box(id);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(120);
    }
    expect((await page.evaluate(() => window.__oscStarts)) - before, 'spaced hovers').toBe(2);
  });
});
