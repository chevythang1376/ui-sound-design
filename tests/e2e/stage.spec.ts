import { expect, test, type Page } from '@playwright/test';
import { RETRIGGER_MS } from '../../src/engine/limiter';
import { instrument, playedSounds, skipWithoutWebAudio } from './helpers';

const open = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.soundDesigner);
};
const stage = (page: Page) => page.getByRole('complementary', { name: 'Component stage' });

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

/**
 * The engine drops a repeat of the same sound within RETRIGGER_MS (by design). A fast test
 * runner can repeat an action quicker than any person, so leave a human-sized gap.
 */
const gap = (page: Page) => page.waitForTimeout(RETRIGGER_MS * 3);

/** Run the whole stage flow and assert every visible state. Returns nothing; sounds are separate. */
async function exerciseStage(page: Page) {
  const s = stage(page);
  await s.getByRole('button', { name: 'Save changes' }).click();
  await gap(page);
  await s.getByRole('button', { name: 'Cancel' }).click();

  const toggle = s.getByRole('switch', { name: 'Email notifications' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(s.getByText('On', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await s.getByRole('button', { name: 'Show notification' }).click();
  await expect(s.getByText(/Ana replied to your comment/)).toBeVisible();

  const email = s.getByRole('textbox', { name: 'Email address' });
  await s.getByRole('button', { name: 'Subscribe' }).click();
  await expect(s.getByText('Enter your email address.')).toBeVisible();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toBeFocused();
  await gap(page);
  await email.fill('ana@');
  await email.press('Enter');
  await expect(s.getByText('That email address looks incomplete.')).toBeVisible();
  await email.fill('ana@example.com');
  await s.getByRole('button', { name: 'Subscribe' }).click();
  await expect(s.getByText('Subscribed ana@example.com. Check your inbox.')).toBeVisible();
  await expect(s.getByText(/looks incomplete/)).toBeHidden();

  const disc = s.getByRole('button', { name: 'Shipping details' });
  await disc.click();
  await expect(disc).toHaveAttribute('aria-expanded', 'true');
  await expect(s.getByText(/Free delivery/)).toBeVisible();
  await disc.click();
  await expect(s.getByText(/Free delivery/)).toBeHidden();
}

const FLOW = [
  'click',
  'click',
  'toggleOn',
  'toggleOff',
  'notification',
  'error',
  'error',
  'success',
  'open',
  'close',
];

test('every stage component plays the right sound from the current kit', async ({ page }) => {
  await open(page);
  await skipWithoutWebAudio(page);
  await exerciseStage(page);
  await expect.poll(() => playedSounds(page)).toEqual(FLOW);
});

test('stage uses the current kit: edits are heard immediately', async ({ page }) => {
  await open(page);
  await skipWithoutWebAudio(page);
  await page.getByRole('button', { name: /^Click,/ }).click();
  await page.getByRole('switch', { name: 'Auto-play on change' }).uncheck({ force: true });
  const cutoff = page.getByRole('slider', { name: 'Filter cutoff', exact: true });
  await cutoff.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('3333');
  await page.keyboard.press('Enter');
  await stage(page).getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => page.evaluate(() => window.__cutoffs.at(-1))).toBe(3333);
});

test('Silent mode: no sounds, every state still visible', async ({ page }) => {
  await open(page);
  await stage(page).getByRole('radio', { name: 'Silent' }).click();
  await exerciseStage(page);
  expect(await page.evaluate(() => window.__cutoffs.length)).toBe(0);
  // ...and With sound brings them back.
  await stage(page).getByRole('radio', { name: 'With sound' }).click();
  if (await page.evaluate(() => typeof AudioContext != 'undefined')) {
    await stage(page).getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => playedSounds(page)).toEqual(['click']);
  }
});

test('stage is fully usable with the kit muted, keyboard only', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  await expect(page.getByRole('button', { name: 'Mute sounds' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const s = stage(page);
  const toggle = s.getByRole('switch', { name: 'Email notifications' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const disc = s.getByRole('button', { name: 'Shipping details' });
  await disc.focus();
  await page.keyboard.press('Enter');
  await expect(s.getByText(/Free delivery/)).toBeVisible();
  const email = s.getByRole('textbox', { name: 'Email address' });
  await email.focus();
  await page.keyboard.press('Enter');
  await expect(s.getByText('Enter your email address.')).toBeVisible();
  await page.keyboard.type('ana@example.com');
  await page.keyboard.press('Enter');
  await expect(s.getByText(/Subscribed ana@example.com/)).toBeVisible();
  expect(await page.evaluate(() => window.__cutoffs.length)).toBe(0);
});

test('hover sounds: off by default, on via the stage switch (and exported option)', async ({
  page,
}) => {
  await open(page);
  await skipWithoutWebAudio(page);
  const s = stage(page);
  await s.getByRole('button', { name: 'Cancel' }).click(); // unlock
  const hoverOver = async () => {
    for (const name of ['Save changes', 'Show notification', 'Subscribe', 'Cancel']) {
      await s.getByRole('button', { name }).hover();
      await page.waitForTimeout(100);
    }
  };
  await hoverOver();
  expect((await playedSounds(page)).filter((n) => n == 'hover')).toEqual([]);

  const sw = s.getByRole('switch', { name: 'Hover sounds' });
  await expect(sw).not.toBeChecked();
  await sw.check({ force: true });
  expect(await page.evaluate(() => window.soundDesigner.store.kit.options!.hover)).toBe(true);
  await hoverOver();
  expect((await playedSounds(page)).filter((n) => n == 'hover').length).toBeGreaterThanOrEqual(3);
});
