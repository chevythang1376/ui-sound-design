/**
 * Browser-side test harness for the M1 engine page (served by Vite, never built into the site).
 * Exposes the engine and analysis helpers on window.harness for Playwright.
 */
import { createKit, type Kit, type Recipe } from '../../src/engine/index';
import { DEFAULT_KIT } from '../../src/presets/default-kit';
import { analyze, renderSound } from './lib';

/** The "success" example recipe from the brief (M1 test sound). */
export const SUCCESS: Recipe = DEFAULT_KIT.sounds.success!;

export const M1_KIT: Kit = {
  v: 1,
  name: 'M1',
  theme: { pitch: 0, volume: 0.5 },
  sounds: { success: SUCCESS },
};

const kit = createKit(M1_KIT, { respectReducedMotion: false });

const harness = { createKit, renderSound, analyze, kit, M1_KIT, SUCCESS, DEFAULT_KIT };
export type Harness = typeof harness;
(window as unknown as { harness: Harness }).harness = harness;

document.querySelector('#play')?.addEventListener('click', () => kit.play('success'));
