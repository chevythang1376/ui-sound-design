import { expect, test, type Page } from '@playwright/test';
import { instrument, skipWithoutWebAudio } from './helpers';

const open = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.soundDesigner);
};
const kitValue = <T>(page: Page, f: (k: Window['soundDesigner']['store']['kit']) => T) =>
  page.evaluate(f, undefined as never) as Promise<T>;
const dial = (page: Page, name: string) => page.getByRole('slider', { name, exact: true });
const oscs = (page: Page) => page.evaluate(() => window.__oscStarts);

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

test('loads the default kit without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() == 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByRole('heading', { name: 'Click', level: 2 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sounds' }).getByRole('listitem')).toHaveCount(
    9,
  );
  await expect(page.getByRole('button', { name: 'Success, 214 ms' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('selecting a sound shows its recipe', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Success,/ }).click();
  await expect(page.getByRole('heading', { name: 'Success', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Success,/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('textbox', { name: 'Voice 1 start note' })).toHaveValue('E5');
  await expect(page.getByRole('switch', { name: 'Voice 2' })).toBeChecked();
  await expect(dial(page, 'Decay')).toHaveAttribute('aria-valuetext', '140 ms');
  await expect(dial(page, 'Filter cutoff')).toHaveAttribute('aria-valuetext', '5.20 kHz');
});

test('a knob drag is one undo step; Ctrl+Z / Ctrl+Shift+Z undo and redo', async ({ page }) => {
  await open(page);
  const decay = dial(page, 'Decay');
  await decay.scrollIntoViewIfNeeded();
  const box = (await decay.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy - i * 4);
  await page.mouse.up();
  const after = await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.env!.d!);
  expect(after).toBeGreaterThan(35);
  expect(
    await page.evaluate(
      () => (window.soundDesigner.store as unknown as { past: unknown[] }).past.length,
    ),
  ).toBe(1);

  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => {});
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.env!.d)).toBe(35);
  await expect(decay).toHaveAttribute('aria-valuetext', '35 ms');
  await page.keyboard.press('Control+Shift+z');
  expect(await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.env!.d)).toBe(
    after,
  );
});

test('knob keyboard: arrows, Page keys, Home/End, Enter to type, double-click resets', async ({
  page,
}) => {
  await open(page);
  const cutoff = dial(page, 'Filter cutoff');
  await cutoff.focus();
  await page.keyboard.press('Home');
  await expect(cutoff).toHaveAttribute('aria-valuetext', '80.0 Hz');
  await page.keyboard.press('End');
  await expect(cutoff).toHaveAttribute('aria-valuetext', '16.0 kHz');
  await page.keyboard.press('PageDown');
  const v1 = Number(await cutoff.getAttribute('aria-valuenow'));
  expect(v1).toBeLessThan(16000);
  await page.keyboard.press('ArrowUp');
  expect(Number(await cutoff.getAttribute('aria-valuenow'))).toBeGreaterThan(v1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('2.5k');
  await page.keyboard.press('Enter');
  await expect(cutoff).toHaveAttribute('aria-valuenow', '2500');
  await expect(cutoff).toBeFocused();
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.filter!.cutoff),
  ).toBe(2500);
  await cutoff.dblclick();
  await expect(cutoff).toHaveAttribute('aria-valuenow', '16000');
  await expect(cutoff).toHaveAttribute('aria-valuemin', '80');
  await expect(cutoff).toHaveAttribute('aria-valuemax', '16000');
});

test('changes survive a refresh (autosave)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Error,/ }).click();
  const gain = dial(page, 'Output gain');
  await gain.focus();
  await page.keyboard.press('Home');
  await page.getByRole('textbox', { name: 'Kit name' }).fill('Glass');
  await page.getByRole('textbox', { name: 'Kit name' }).press('Enter');
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => !!window.soundDesigner);
  await expect(page.getByRole('heading', { name: 'Error', level: 2 })).toBeVisible();
  await expect(dial(page, 'Output gain')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('textbox', { name: 'Kit name' })).toHaveValue('Glass');
});

test('corrupt saved state falls back to the default kit with a visible notice', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('usd:kit', '{"v":1,"sounds":');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await open(page);
  await expect(page.getByRole('status', { name: 'Editor messages' })).toContainText(
    'could not be read',
  );
  expect(await page.evaluate(() => Object.keys(window.soundDesigner.store.kit.sounds).length)).toBe(
    9,
  );
  expect(await page.evaluate(() => localStorage.getItem('usd:kit:corrupt'))).toBe(
    '{"v":1,"sounds":',
  );
});

test('saved kit with bad values is repaired, not discarded', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(
        'usd:kit',
        JSON.stringify({
          v: 1,
          name: 'Mine',
          sounds: { tap: { voices: [{ note: 'C5' }], gain: 7 } },
        }),
      );
      sessionStorage.setItem('seeded', '1');
    }
  });
  await open(page);
  await expect(page.getByRole('status', { name: 'Editor messages' })).toContainText('1 fix');
  expect(await page.evaluate(() => window.soundDesigner.store.kit.sounds.tap!.gain)).toBe(1);
  await expect(page.getByRole('heading', { name: 'tap', level: 2 })).toBeVisible();
});

test('voice 2 off and on again keeps its settings', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Notification,/ }).click();
  const v2 = page.getByRole('switch', { name: 'Voice 2' });
  await v2.uncheck({ force: true });
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.notification!.voices.length),
  ).toBe(1);
  await expect(dial(page, 'Voice 2 gain')).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('switch', { name: 'Voice 2' }).check({ force: true });
  const v = await page.evaluate(
    () => window.soundDesigner.store.kit.sounds.notification!.voices[1],
  );
  expect(v).toMatchObject({ note: 'E6', delayMs: 110, gain: 0.7 });
});

test('note field: typed names, Hz, invalid input, and the piano picker', async ({ page }) => {
  await open(page);
  const note = page.getByRole('textbox', { name: 'Voice 1 start note' });
  await note.fill('d#5');
  await note.press('Enter');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.voices[0]!.note),
  ).toBe('D#5');
  await note.fill('880 hz');
  await note.press('Enter');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.voices[0]!.note),
  ).toBe(880);
  await note.fill('H2');
  await note.press('Enter');
  await expect(note).toHaveAttribute('aria-invalid', 'true');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.voices[0]!.note),
  ).toBe(880);

  const pick = page.getByRole('button', { name: 'Pick voice 1 start note on a keyboard' });
  await pick.click();
  await expect(pick).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('group', { name: 'Voice 1 start note keyboard' })
    .getByRole('button', { name: 'E5', exact: true })
    .click();
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.voices[0]!.note),
  ).toBe('E5');
  await expect(page.getByRole('button', { name: 'E5', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pick).toHaveAttribute('aria-expanded', 'false');
  await expect(pick).toBeFocused();
});

test('long sounds get a red badge and a warning', async ({ page }) => {
  await open(page);
  const decay = dial(page, 'Decay');
  await decay.focus();
  await page.keyboard.press('End');
  const row = page.getByRole('button', { name: /^Click,/ });
  await expect(row).toHaveAccessibleName(/longer than 500 ms/);
  await expect(row.locator('.badge')).toHaveClass(/over/);
  await expect(page.locator('.duration')).toContainText('over 500 ms');
});

test('Space plays the selected sound; Play all plays every sound', async ({ page }) => {
  await open(page);
  await skipWithoutWebAudio(page);
  await page.getByRole('button', { name: /^Success,/ }).click(); // a gesture: unlocks audio
  await page.waitForTimeout(150);
  await page.locator('.synth-title').click();
  let before = await oscs(page);
  await page.keyboard.press(' ');
  await expect.poll(() => oscs(page)).toBe(before + 2);

  before = await oscs(page);
  await page.getByRole('button', { name: 'Play all' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
  // 9 sounds, 12 voices in total, 350 ms apart.
  await expect.poll(() => oscs(page), { timeout: 6000 }).toBe(before + 12);
  await expect(page.getByRole('button', { name: 'Play all' })).toBeVisible();
});

test('auto-play on change plays the edited sound, and can be turned off', async ({ page }) => {
  await open(page);
  await skipWithoutWebAudio(page);
  const gain = dial(page, 'Output gain');
  await gain.click();
  await page.waitForTimeout(150);
  let before = await oscs(page);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => oscs(page)).toBe(before + 1);

  await page.getByRole('switch', { name: 'Auto-play on change' }).uncheck({ force: true });
  await gain.focus();
  before = await oscs(page);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(await oscs(page)).toBe(before);
});

test('global pitch and volume edit the theme, not the recipes', async ({ page }) => {
  await open(page);
  await dial(page, 'Global pitch').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await dial(page, 'Master volume').focus();
  await page.keyboard.press('Home');
  const k = await kitValue(page, () => window.soundDesigner.store.kit);
  expect(k.theme).toMatchObject({ pitch: 2, volume: 0 });
  expect(k.sounds.click!.voices[0]!.note).toBe('C6');
  await expect(dial(page, 'Global pitch')).toHaveAttribute('aria-valuetext', '+2 st');
});

test('reset asks first and is undoable', async ({ page }) => {
  await open(page);
  await page.getByRole('textbox', { name: 'Kit name' }).fill('Mine');
  await page.getByRole('textbox', { name: 'Kit name' }).press('Enter');
  await page.getByRole('button', { name: 'Reset kit' }).click();
  const dlg = page.getByRole('dialog', { name: 'Reset to the default kit?' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Kit name' })).toHaveValue('Mine');
  await page.getByRole('button', { name: 'Reset kit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset kit' }).click();
  await expect(page.getByRole('textbox', { name: 'Kit name' })).toHaveValue('My Kit');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Kit name' })).toHaveValue('Mine');
});
