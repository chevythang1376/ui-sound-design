import { expect, test, type Page } from '@playwright/test';
import { instrument } from './helpers';

const open = async (page: Page) => {
  await page.goto('/tests/pages/kit.html');
  await page.waitForFunction(() => !!window.kitPage);
};
const hasAudio = (page: Page) => page.evaluate(() => typeof AudioContext != 'undefined');
const oscs = (page: Page) => page.evaluate(() => window.__oscStarts);

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

test('mute toggle is accessible and muting survives a reload', async ({ page }) => {
  await open(page);
  const mute = page.locator('#mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toHaveText('Mute sounds');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('soundkit:muted'))).toBe('1');
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(true);

  await page.reload();
  await page.waitForFunction(() => !!window.kitPage);
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(true);

  // Muted: clicks play nothing.
  await page.click('[data-sound="click"]');
  await page.click('[data-sound="success"]');
  await page.waitForTimeout(100);
  expect(await oscs(page)).toBe(0);

  // Unmute persists too, and sound comes back.
  await page.locator('#mute').click();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await page.waitForFunction(() => !!window.kitPage);
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(false);
  if (await hasAudio(page)) {
    await page.click('[data-sound="success"]');
    await expect.poll(() => oscs(page)).toBeGreaterThan(0);
  }
});

test('kit.mute() syncs every mounted toggle', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.kitPage.kit.mute(true));
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.kitPage.kit.mute(false));
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
});

test('<html data-sound="off"> prevents playback', async ({ page }) => {
  // Serve the page with the attribute in its markup, the way a site would set it.
  await page.route('**/tests/pages/kit.html', async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      '<html lang="en">',
      '<html lang="en" data-sound="off">',
    );
    await route.fulfill({ response: res, body: html });
  });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.dataset.sound)).toBe('off');
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(true);
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-sound="click"]');
  await page.click('[data-sound="success"]');
  await page.waitForTimeout(100);
  expect(await oscs(page)).toBe(0);
});

test('window.SOUNDKIT_OFF prevents playback, even after unmuting', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { SOUNDKIT_OFF: boolean }).SOUNDKIT_OFF = true;
  });
  await open(page);
  await page.evaluate(() => window.kitPage.kit.mute(false));
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(true);
  await page.click('[data-sound="success"]');
  await page.waitForTimeout(100);
  expect(await oscs(page)).toBe(0);
});

test('prefers-reduced-motion starts muted; a stored choice wins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(true);
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  // Not persisted: reduced motion is a default, not the visitor's choice.
  expect(await page.evaluate(() => localStorage.getItem('soundkit:muted'))).toBeNull();

  await page.locator('#mute').click(); // the visitor explicitly unmutes
  await page.reload();
  await page.waitForFunction(() => !!window.kitPage);
  expect(await page.evaluate(() => window.kitPage.kit.isMuted())).toBe(false);
});

test('respectReducedMotion: false ignores the media query', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const muted = await page.evaluate(() => {
    const k = window.kitPage.createKit(window.kitPage.current, { respectReducedMotion: false });
    const m = k.isMuted();
    k.destroy();
    return m;
  });
  expect(muted).toBe(false);
});
