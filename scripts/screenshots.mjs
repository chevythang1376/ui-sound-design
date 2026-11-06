// Captures the README screenshots from a running dev server (npm run dev).
/* global window, localStorage -- used inside page.evaluate callbacks, which run in the browser */
//   node scripts/screenshots.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs');
const base = process.argv[2] ?? 'http://localhost:5173';

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const ready = () => page.waitForFunction(() => !!window.soundDesigner);

// 1. The editor: Success selected, stage in a "used" state.
await page.goto(base);
await ready();
await page.evaluate(() => localStorage.clear());
await page.reload();
await ready();
await page.getByRole('button', { name: /^Success,/ }).click();
const stage = page.getByRole('complementary', { name: 'Component stage' });
await stage.getByRole('switch', { name: 'Email notifications' }).click();
await stage.getByRole('textbox', { name: 'Email address' }).fill('ana@example.com');
await stage.getByRole('button', { name: 'Subscribe' }).click();
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, 'editor.png') });

// 2. The export modal on the CMS block tab.
await page.getByRole('button', { name: 'Export', exact: true }).click();
await page.getByRole('tab', { name: 'CMS block' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 'export.png') });
await page.keyboard.press('Escape');

// 3. The simulated CMS page with the block pasted in.
const code = await (async () => {
  await page.goto(`${base}/tests/pages/export.html`);
  await page.waitForFunction(() => !!window.exportHarness);
  return page.evaluate(() => window.exportHarness.exports().find((f) => f.kind == 'cms').code);
})();
await page.route('**/examples/cms-block.html', async (route) => {
  const res = await route.fetch();
  const html = (await res.text())
    .replace(/<script type="module" src="\/@vite\/client"><\/script>\s*/g, '')
    .replace('<!-- PASTE CMS BLOCK HERE -->', code);
  await route.fulfill({ response: res, body: html });
});
await page.setViewportSize({ width: 1100, height: 760 });
await page.goto(`${base}/examples/cms-block.html`);
await page.getByRole('button', { name: 'Add to cart' }).click();
await page.screenshot({ path: join(out, 'cms-page.png') });

await browser.close();
console.log(`Screenshots written to ${out}`);
