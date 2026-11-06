import { test, type Page } from '@playwright/test';
import type { Harness } from '../pages/harness';
import type { ExportHarness } from '../pages/export';
import type { KitPage } from '../pages/kit';

declare global {
  interface Window {
    harness: Harness;
    kitPage: KitPage;
    exportHarness: ExportHarness;
    soundDesigner: {
      store: import('../../src/editor/store').Store;
      kit: import('../../src/engine/index').SoundKit;
    };
    __ctxs: AudioContext[];
    __oscStarts: number;
    /** Filter cutoff of every realtime play, in order (each preset's cutoff is unique). */
    __cutoffs: number[];
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
    w.__cutoffs = [];
    if (typeof BaseAudioContext != 'undefined') {
      const make = BaseAudioContext.prototype.createBiquadFilter;
      BaseAudioContext.prototype.createBiquadFilter = function (this: BaseAudioContext) {
        const f = make.call(this);
        if (!(this instanceof OfflineAudioContext))
          (f.frequency as unknown as { __cut: boolean }).__cut = true;
        return f;
      };
      const desc = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value')!;
      Object.defineProperty(AudioParam.prototype, 'value', {
        ...desc,
        set(this: AudioParam & { __cut?: boolean }, v: number) {
          if (this.__cut) w.__cutoffs.push(v);
          desc.set!.call(this, v);
        },
      });
    }
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
        // Count what plays, not offline renders (the editor's preview, kit.render()).
        if (!(this.context instanceof OfflineAudioContext)) w.__oscStarts++;
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

/** Names of the sounds played so far, identified by their (unique) filter cutoffs. */
export async function playedSounds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sounds = window.soundDesigner.store.kit.sounds;
    return window.__cutoffs.map(
      (c) => Object.entries(sounds).find(([, r]) => r.filter?.cutoff === c)?.[0] ?? `?${c}`,
    );
  });
}
