/**
 * Mobile check (projects mobile-safari = iPhone 13 WebKit, mobile-chrome = Pixel 7): the
 * exported CMS block on a phone-sized CMS page, driven by taps (touchend unlock path), and the
 * editor at phone width. Playwright's WebKit on Windows has no Web Audio, so audible playback
 * is asserted in mobile-chrome; mobile-safari still checks layout, taps and errors.
 */
import { expect, test } from '@playwright/test';
import { instrument } from './helpers';

const asFile = (html: string) =>
  html.replace(/<script type="module" src="\/@vite\/client"><\/script>\s*/g, '');

test('CMS page on a phone: taps unlock audio and play; mute is a comfortable tap target', async ({
  page,
}) => {
  await page.goto('/tests/pages/export.html');
  await page.waitForFunction(() => !!window.exportHarness);
  const code = await page.evaluate(
    () => window.exportHarness.exports().find((f) => f.kind == 'cms')!.code,
  );
  await instrument(page);
  await page.route('**/examples/cms-block.html', async (route) => {
    const res = await route.fetch();
    const html = asFile(await res.text()).replace('<!-- PASTE CMS BLOCK HERE -->', code);
    await route.fulfill({ response: res, body: html });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() == 'error' && errors.push(m.text()));
  await page.goto('/examples/cms-block.html');

  const mute = page.getByRole('button', { name: 'Mute sounds' });
  const box = (await mute.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Add to cart' }).tap();
  await expect(page.getByText('Added to cart.')).toBeVisible();
  if (await page.evaluate(() => typeof AudioContext != 'undefined')) {
    await expect.poll(() => page.evaluate(() => window.__ctxs[0]?.state)).toBe('running');
    await expect.poll(() => page.evaluate(() => window.__oscStarts)).toBe(1);
  }
  await mute.tap();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('editor at phone width: loads, no horizontal scroll, stage usable by touch', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.soundDesigner);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const stage = page.getByRole('complementary', { name: 'Component stage' });
  const toggle = stage.getByRole('switch', { name: 'Email notifications' });
  await toggle.scrollIntoViewIfNeeded();
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await stage.getByRole('button', { name: 'Subscribe' }).tap();
  await expect(stage.getByText('Enter your email address.')).toBeVisible();
  expect(errors).toEqual([]);
});
