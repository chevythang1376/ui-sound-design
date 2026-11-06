import { expect, test, type Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.soundDesigner);
};

/** Press Tab until `match` is focused (or give up). */
async function tabTo(page: Page, match: (desc: string) => boolean, max = 250, back = false) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const d = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return '';
      const name =
        el.getAttribute('aria-label') ??
        ((el as HTMLInputElement).labels?.[0]?.textContent || el.textContent || '')
          .trim()
          .replace(/\s+/g, ' ');
      return `${el.getAttribute('role') ?? el.tagName.toLowerCase()}|${name}`;
    });
    if (match(d)) return d;
  }
  throw new Error('focus target not reached by keyboard');
}

/** Interactive nodes in Chromium's accessibility tree that have no accessible name. */
async function unnamed(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: { ignored: boolean; role?: { value: string }; name?: { value: string } }[];
  };
  const roles = new Set([
    'button',
    'slider',
    'switch',
    'checkbox',
    'radio',
    'tab',
    'textbox',
    'link',
    'combobox',
    'spinbutton',
  ]);
  return nodes
    .filter((n) => !n.ignored && roles.has(n.role?.value ?? '') && !n.name?.value?.trim())
    .map((n) => n.role!.value);
}

test.describe('screen reader labels (Chromium accessibility tree)', () => {
  test.skip(({ browserName }) => browserName != 'chromium', 'Uses the Chromium accessibility tree');

  test('every control in the editor, stage and dialogs has an accessible name', async ({
    page,
  }) => {
    await open(page);
    expect(await unnamed(page)).toEqual([]);
    await page.getByRole('button', { name: /^Success,/ }).click();
    await page.getByRole('button', { name: 'Pick voice 1 start note on a keyboard' }).click();
    expect(await unnamed(page)).toEqual([]);
    await page.keyboard.press('Escape');
    for (const name of ['Export', 'Kit JSON', 'Share link']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await unnamed(page), name).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }
  });
});

test('page structure: one h1, landmarks, sliders expose units', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('UI Sound Designer');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sounds' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Component stage' })).toBeVisible();
  const decay = page.getByRole('slider', { name: 'Decay', exact: true });
  await expect(decay).toHaveAttribute('aria-valuetext', '35 ms');
  await expect(
    page.getByRole('img', { name: /^Envelope: attack 1 ms, decay 35 ms/ }),
  ).toBeVisible();
});

test('keyboard-only workflow: select, shape, toggle, export, close — focus stays visible', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName == 'webkit',
    "Safari's default Tab order skips buttons and links (unless 'Press Tab to highlight each item' is on)",
  );
  await open(page);
  await page.locator('body').focus();

  // Skip link jumps to the synth panel.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to the synth panel' })).toBeFocused();

  // Pick a sound from the list.
  await tabTo(page, (d) => d.startsWith('button|Notification,'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Notification', level: 2 })).toBeVisible();

  // Shape it: decay knob with arrows; the focus ring is visible.
  await tabTo(page, (d) => d == 'slider|Decay');
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(ring).not.toBe('none');
  await page.keyboard.press('PageUp');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.notification!.env!.d),
  ).toBeGreaterThan(230);

  // Voice 2 off with Space, back on.
  await tabTo(page, (d) => d == 'switch|Voice 2', 250, true);
  await page.keyboard.press('Space');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.notification!.voices.length),
  ).toBe(1);
  await page.keyboard.press('Space');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.notification!.voices.length),
  ).toBe(2);

  // Voice 2's wave via arrow keys in its radio group (the next group after the switch).
  await tabTo(page, (d) => d.startsWith('radio|'));
  await page.keyboard.press('ArrowRight');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.notification!.voices[1]!.wave),
  ).toBe('triangle');

  // Undo from the keyboard (focus not in a text field).
  await page.keyboard.press('Control+z');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.notification!.voices[1]!.wave),
  ).toBe('sine');

  // Export dialog: open, switch tab with arrows, close with Escape, focus returns.
  await tabTo(page, (d) => d == 'button|Export', 300, true);
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: 'Export sound kit' });
  await expect(dlg).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dlg.getByRole('tab', { name: 'Script tag' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
});

test('piano picker is keyboard operable: arrows between keys, Enter picks, Escape returns', async ({
  page,
}) => {
  await open(page);
  const pick = page.getByRole('button', { name: 'Pick voice 1 start note on a keyboard' });
  await pick.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'C6', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'D6', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(
    await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.voices[0]!.note),
  ).toBe('D6');
  await page.keyboard.press('Escape');
  await expect(pick).toBeFocused();
});

test('blocked storage: the editor still works and says changes will not be saved', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const deny = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', { get: deny });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByRole('status', { name: 'Editor messages' })).toContainText(
    'blocks local storage',
  );
  await page.getByRole('slider', { name: 'Output gain' }).focus();
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => window.soundDesigner.store.kit.sounds.click!.gain)).toBe(0);
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  expect(errors).toEqual([]);
});

test('no Web Audio: the editor explains it and keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.AudioContext;
    delete w.webkitAudioContext;
    delete w.OfflineAudioContext;
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByRole('note')).toContainText('no Web Audio API');
  await page
    .getByRole('region', { name: 'Synth panel' })
    .getByRole('button', { name: 'Play Click' })
    .click();
  await page.getByRole('button', { name: 'Play all' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export sound kit' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('reduced motion: no live scope animation, no CSS transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const t = await page.evaluate(
    () => getComputedStyle(document.querySelector('.switch-track')!, '::after').transitionDuration,
  );
  expect(t).toMatch(/^0s/);
});
