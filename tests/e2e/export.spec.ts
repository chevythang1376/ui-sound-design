import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_KIT } from '../../src/presets/default-kit';
import { instrument, skipWithoutWebAudio } from './helpers';

const IDS = Object.keys(DEFAULT_KIT.sounds);

/**
 * The dev server injects its HMR client into every HTML page it serves. Example pages are meant
 * to be opened as plain files, so tests serve exactly the file's own markup.
 */
const asFile = (html: string) =>
  html.replace(/<script type="module" src="\/@vite\/client"><\/script>\s*/g, '');

const harness = async (page: Page) => {
  await page.goto('/tests/pages/export.html');
  await page.waitForFunction(() => !!window.exportHarness);
};

/** Generate an export in the browser with the editor's exporter. */
const exportCode = (page: Page, kind: 'esm' | 'script' | 'cms' | 'html') =>
  page.evaluate((k) => window.exportHarness.exports().find((f) => f.kind == k)!.code, kind);

test.describe('same engine: editor vs exported kit', () => {
  test('every preset renders sample-identical from the editor engine and an exported sound-kit.js', async ({
    page,
  }) => {
    await harness(page);
    await skipWithoutWebAudio(page);
    const diffs = await page.evaluate(async (ids) => {
      const h = window.exportHarness;
      const esm = h.exports().find((f) => f.kind == 'esm')!.code;
      const mod = await h.importCode(esm);
      const shipped = h.shippedKit();
      const out: Record<string, { maxDiff: number; peak: number; vsDefault?: number }> = {};
      for (const id of ids) {
        // Randomness off: same seed for the noise buffer and noise offsets.
        const a = await h.renderSound(h.DEFAULT_KIT, id, { seed: 7 });
        const b = await h.renderSound(shipped, id, { seed: 7, create: mod.createKit });
        let maxDiff = 0;
        for (let i = 0; i < a.samples.length; i++)
          maxDiff = Math.max(maxDiff, Math.abs(a.samples[i]! - b.samples[i]!));
        out[id] = { maxDiff, peak: a.peak };
        // Noise-free presets: also compare with the file's ready-made default instance.
        if (!h.DEFAULT_KIT.sounds[id]!.noise) {
          const ctx = new OfflineAudioContext(1, 44100, 44100);
          mod.default.render(id, ctx);
          const s = (await ctx.startRendering()).getChannelData(0);
          let d = 0;
          for (let i = 0; i < s.length; i++) d = Math.max(d, Math.abs(s[i]! - a.samples[i]!));
          out[id]!.vsDefault = d;
        }
      }
      return out;
    }, IDS);
    for (const id of IDS) {
      expect(diffs[id]!.peak, id).toBeGreaterThan(0.005);
      expect(diffs[id]!.maxDiff, id).toBeLessThan(1e-6);
      if (diffs[id]!.vsDefault !== undefined)
        expect(diffs[id]!.vsDefault, `${id} default`).toBeLessThan(1e-6);
    }
  });
});

test.describe('example pages with a freshly exported kit', () => {
  /** Serve an example page with `code` pasted at its marker; record requests and errors. */
  const openExample = async (page: Page, file: 'plain' | 'cms-block', code: string, times = 1) => {
    const marker =
      file == 'plain'
        ? '/* PASTE the "Script tag" export (sound-kit.iife.js) here. */'
        : '<!-- PASTE CMS BLOCK HERE -->';
    await page.route(`**/examples/${file}.html`, async (route) => {
      const res = await route.fetch();
      const html = asFile(await res.text());
      if (!html.includes(marker)) throw new Error('paste marker missing');
      await route.fulfill({
        response: res,
        body: html.replace(marker, Array(times).fill(code).join('\n')),
      });
    });
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => m.type() == 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/examples/${file}.html`);
    return { requests, errors };
  };

  test('plain.html + Script tag export: plays on click, no errors, no network requests', async ({
    page,
  }) => {
    await harness(page);
    const code = await exportCode(page, 'script');
    await instrument(page);
    const { requests, errors } = await openExample(page, 'plain', code);
    await expect(page.locator('[data-sound-mute]')).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Success' }).click();
    await page.getByRole('button', { name: 'Click' }).click();
    if (await page.evaluate(() => typeof AudioContext != 'undefined'))
      await expect.poll(() => page.evaluate(() => window.__oscStarts)).toBe(3);
    expect(errors).toEqual([]);
    expect(requests).toEqual([page.url()]);
  });

  test('cms-block.html + CMS block: plays on click, no errors, no network requests', async ({
    page,
  }) => {
    await harness(page);
    const code = await exportCode(page, 'cms');
    await instrument(page);
    const { requests, errors } = await openExample(page, 'cms-block', code);
    const mute = page.getByRole('button', { name: 'Mute sounds' });
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to cart.')).toBeVisible();
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await page.getByRole('button', { name: 'Delivery & returns' }).click();
    if (await page.evaluate(() => typeof AudioContext != 'undefined'))
      // click (1 voice) + error (2) + open (1)
      await expect.poll(() => page.evaluate(() => window.__oscStarts)).toBe(4);
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    const before = await page.evaluate(() => window.__oscStarts);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__oscStarts)).toBe(before);
    expect(errors).toEqual([]);
    expect(requests).toEqual([page.url()]);
  });

  test('CMS block pasted twice: one kit, one sound per click, both mute buttons work', async ({
    page,
  }) => {
    await harness(page);
    const code = await exportCode(page, 'cms');
    await instrument(page);
    const { errors } = await openExample(page, 'cms-block', code, 2);
    const mutes = page.getByRole('button', { name: 'Mute sounds' });
    await expect(mutes).toHaveCount(2);
    await expect(mutes.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(mutes.nth(1)).toHaveAttribute('aria-pressed', 'false');
    if (await page.evaluate(() => typeof AudioContext != 'undefined')) {
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect.poll(() => page.evaluate(() => window.__oscStarts)).toBe(1);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.__oscStarts)).toBe(1);
      expect(await page.evaluate(() => window.__ctxs.length)).toBe(1);
    }
    await mutes.nth(1).click();
    await expect(mutes.nth(0)).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('CMS block leaks no globals other than window.SoundKit', async ({ page }) => {
    await harness(page);
    const code = await exportCode(page, 'cms');
    const globalsOf = async (withKit: boolean) => {
      const p = await page.context().newPage();
      await p.route('**/examples/cms-block.html', async (route) => {
        const res = await route.fetch();
        const html = asFile(await res.text()).replace(
          '<!-- PASTE CMS BLOCK HERE -->',
          withKit ? code : '',
        );
        await route.fulfill({ response: res, body: html });
      });
      await p.goto('/examples/cms-block.html');
      const keys = await p.evaluate(() => Object.keys(window));
      await p.close();
      return keys;
    };
    const without = await globalsOf(false);
    const withKit = await globalsOf(true);
    expect(withKit.filter((k) => !without.includes(k))).toEqual(['SoundKit']);
  });

  test('without Web Audio the CMS block is a silent no-op and the page still works', async ({
    page,
  }) => {
    await harness(page);
    const code = await exportCode(page, 'cms');
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.AudioContext;
      delete w.webkitAudioContext;
    });
    const { errors } = await openExample(page, 'cms-block', code);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to cart.')).toBeVisible();
    await page.getByRole('button', { name: 'Mute sounds' }).click();
    expect(errors).toEqual([]);
  });
});

test.describe('export modal, share link, kit JSON', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.soundDesigner);
  });

  test('export modal: four tabs, keyboard, size readout, copy and download', async ({ page }) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Export sound kit' });
    await expect(dlg).toBeVisible();
    const tabs = dlg.getByRole('tab');
    await expect(tabs).toHaveText(['ES module', 'Script tag', 'CMS block', 'Plain HTML']);
    await expect(tabs.nth(0)).toBeFocused();
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(dlg.getByRole('tabpanel')).toContainText(
      /\d+\.\d\d KB minified · \d+\.\d\d KB gzip/,
    );
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    const code = await dlg.getByRole('textbox', { name: 'CMS block code' }).inputValue();
    expect(code).toContain('data-sound-mute');
    const dl = page.waitForEvent('download');
    await dlg.getByRole('button', { name: 'Download sound-kit-cms-block.html' }).click();
    expect((await dl).suggestedFilename()).toBe('sound-kit-cms-block.html');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('share link round trip asks before replacing local work', async ({ page, context }) => {
    await page.getByRole('textbox', { name: 'Kit name' }).fill('Shared one');
    await page.getByRole('textbox', { name: 'Kit name' }).press('Enter');
    await page.evaluate(() =>
      window.soundDesigner.store.edit(null, (k) => (k.sounds.click!.gain = 0.11)),
    );
    await page.getByRole('button', { name: 'Share link' }).click();
    const url = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
    expect(url).toMatch(/#k=(z|j)\.[A-Za-z0-9_-]+$/);

    // A second visitor with their own work.
    const other = await context.browser()!.newContext();
    const p2 = await other.newPage();
    await p2.goto('/');
    await p2.waitForFunction(() => !!window.soundDesigner);
    await p2.goto(url);
    await p2.waitForFunction(() => !!window.soundDesigner);
    const dlg = p2.getByRole('dialog', { name: 'Load shared kit "Shared one"?' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Keep mine' }).click();
    expect(await p2.evaluate(() => window.soundDesigner.store.kit.name)).toBe('My Kit');
    expect(p2.url()).not.toContain('#k=');

    await p2.goto(url);
    await p2.waitForFunction(() => !!window.soundDesigner);
    await p2.getByRole('dialog').getByRole('button', { name: 'Load shared kit' }).click();
    expect(await p2.evaluate(() => window.soundDesigner.store.kit.name)).toBe('Shared one');
    expect(await p2.evaluate(() => window.soundDesigner.store.kit.sounds.click!.gain)).toBe(0.11);
    await p2.getByRole('button', { name: 'Undo' }).click();
    expect(await p2.evaluate(() => window.soundDesigner.store.kit.name)).toBe('My Kit');
    await other.close();
  });

  test('a damaged share link shows a readable error', async ({ page }) => {
    await page.goto('/#k=z.not-really-deflate');
    await page.waitForFunction(() => !!window.soundDesigner);
    await expect(page.getByRole('status', { name: 'Editor messages' })).toContainText(
      'Could not open the share link',
    );
  });

  test('kit JSON: invalid paste is rejected with an error, valid paste loads', async ({ page }) => {
    await page.getByRole('button', { name: 'Kit JSON' }).click();
    const dlg = page.getByRole('dialog', { name: 'Kit JSON' });
    const box = dlg.getByRole('textbox', { name: 'Kit JSON' });
    expect(JSON.parse(await box.inputValue()).sounds.success.fx).toEqual({
      room: 0.15,
      humanize: 0.03,
    });
    await box.fill('{"v":1,"sounds":');
    await dlg.getByRole('button', { name: 'Load into editor' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Not valid JSON');
    await box.fill(
      JSON.stringify({
        v: 1,
        name: 'Pasted',
        sounds: { ping: { voices: [{ note: 'A5' }], gain: 5 } },
      }),
    );
    await dlg.getByRole('button', { name: 'Load into editor' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('heading', { name: 'ping', level: 2 })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Editor messages' })).toContainText('1 fix');
    expect(await page.evaluate(() => window.soundDesigner.store.kit.sounds.ping!.gain)).toBe(1);
  });
});
