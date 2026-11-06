import { safe } from './util';

/** Per-visitor mute choice ("1" muted, "0" unmuted). */
export const MUTE_KEY = 'soundkit:muted';

export const writeMuted = (m: boolean) => safe(() => localStorage.setItem(MUTE_KEY, m ? '1' : '0'));

/** Site-level hard off: `<html data-sound="off">` or `window.SOUNDKIT_OFF = true`. Never plays. */
export const siteOff = (): boolean =>
  !!safe(
    () =>
      document.documentElement.dataset.sound == 'off' ||
      (window as unknown as { SOUNDKIT_OFF?: unknown }).SOUNDKIT_OFF === true,
  );

/**
 * Initial mute state: the visitor's stored choice if they ever made one, otherwise
 * prefers-reduced-motion (when respected).
 *
 * There is no "prefers-reduced-sound" media query. People who ask the OS to reduce motion often
 * want less sensory feedback in general, so by default (options.respectReducedMotion) we treat
 * prefers-reduced-motion as a signal to start muted. It is a heuristic, not a standard, and the
 * visitor can still unmute; their stored choice then wins on later visits.
 */
export const startMuted = (respectReducedMotion: unknown): boolean => {
  const v = safe(() => localStorage.getItem(MUTE_KEY));
  return v
    ? v == '1'
    : !!respectReducedMotion &&
        !!safe(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
};
