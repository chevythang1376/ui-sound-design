import { test, type Page } from '@playwright/test';
import type { Harness } from '../pages/harness';

declare global {
  interface Window {
    harness: Harness;
    __ctxs: AudioContext[];
    __oscStarts: number;
  }
}

/**
 * Count AudioContext constructions and OscillatorNode starts before any page script runs, so
 * tests can prove "no context before a gesture" and "a click played something".
 */
export async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & Window;
    w.__ctxs = [];
    w.__oscStarts = 0;
    const Orig = (w.AudioContext || w.webkitAudioContext) as typeof AudioContext | undefined;
    if (Orig) {
      class Counted extends Orig {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args);
          w.__ctxs.push(this);
        }
      }
      w.AudioContext = Counted;
      if (w.webkitAudioContext) w.webkitAudioContext = Counted;
    }
    if (typeof OscillatorNode != 'undefined') {
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (this: OscillatorNode, ...a: [number?]) {
        w.__oscStarts++;
        return start.apply(this, a);
      };
    }
  });
}

/** Wait until the harness module has loaded. */
export async function harnessReady(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.harness);
}

/**
 * Skip the current test when this browser build has no Web Audio API at all. Playwright's
 * WebKit for Windows ships without it; WebKit on macOS / Linux has it, so these tests do run
 * there. Everything that does not need audio output still runs in every browser.
 */
export async function skipWithoutWebAudio(page: Page): Promise<void> {
  const has = await page.evaluate(() => typeof OfflineAudioContext != 'undefined');
  test.skip(
    !has,
    'No Web Audio API in this browser build (Playwright WebKit on Windows). Runs on macOS/Linux.',
  );
}
