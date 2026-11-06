import { expect, test } from '@playwright/test';
import { harnessReady, instrument, skipWithoutWebAudio } from './helpers';

test('no AudioContext before a gesture; running after one, and the click plays', async ({
  page,
  isMobile,
}) => {
  await instrument(page);
  await page.goto('/tests/pages/engine.html');
  await harnessReady(page);
  await skipWithoutWebAudio(page);

  // The kit exists and play() is even called, but no context may exist yet: dropped silently.
  await page.evaluate(() => window.harness.kit.play('success'));
  expect(await page.evaluate(() => window.__ctxs.length)).toBe(0);
  expect(await page.evaluate(() => window.__oscStarts)).toBe(0);

  // Mobile path: a real tap (touchstart/touchend); desktop: pointerdown.
  const press = () => (isMobile ? page.tap('#play') : page.click('#play'));
  await press();

  expect(await page.evaluate(() => window.__ctxs.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__ctxs[0]!.state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__oscStarts)).toBeGreaterThan(0);

  // Later gestures reuse the one shared context; the stale pre-unlock play never fired.
  const before = await page.evaluate(() => window.__oscStarts);
  await page.waitForTimeout(50);
  await press();
  expect(await page.evaluate(() => window.__ctxs.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__oscStarts)).toBeGreaterThan(before);
});

test('without Web Audio, gestures and play() are a silent no-op', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.AudioContext;
    delete w.webkitAudioContext;
    delete w.OfflineAudioContext;
  });
  await page.goto('/tests/pages/engine.html');
  await harnessReady(page);
  if (isMobile) await page.tap('#play');
  else await page.click('#play');
  await page.evaluate(() => {
    const k = window.harness.kit;
    k.play('success');
    k.play('nope');
    k.volume(0.2);
    k.mute(true);
    k.mute(false);
  });
  await page.keyboard.press('a');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.harness.kit.isMuted())).toBe(false);
});
