/**
 * The one shared AudioContext. It is never created at import time: browsers' autoplay policies
 * only let audio start inside a user gesture, so it is created in the first pointerdown,
 * touchend or keydown (capture phase) and re-resumed on later gestures and on
 * visibilitychange (iOS "interrupted" state, tab switches).
 */
import { noop, safe } from './util';

const GESTURES = ['pointerdown', 'touchend', 'keydown'];
/** Plays requested this soon after a gesture-initiated resume are scheduled, not dropped. */
const RESUME_GRACE_MS = 250;

let ctx: AudioContext | undefined;
let resumedAt = -1e9;
/** Live kits. */
let users = 0;
let listening = 0;

const resume = (gesture?: boolean) =>
  safe(() => {
    if (!ctx && gesture) {
      const w = window as unknown as Record<string, typeof AudioContext>;
      ctx = new (w.AudioContext || w.webkitAudioContext)!();
    }
    if (ctx && ctx.state != 'running') {
      if (gesture) resumedAt = Date.now();
      // A one-sample silent buffer fully unlocks iOS Safari (resume() alone is not enough).
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, 22050);
      b.connect(ctx.destination);
      b.onended = () => b.disconnect();
      b.start();
      ctx.resume().catch(noop);
    }
  });

/**
 * Install the shared gesture listeners once (capture phase). They only act while at least one
 * kit is alive, so destroy() just releases its claim. Returns an idempotent disposer.
 */
export const listen = (): (() => void) => {
  let live = 1;
  if (!listening)
    safe(() => {
      GESTURES.forEach((e) => addEventListener(e, () => users && resume(true), true));
      document.addEventListener('visibilitychange', () => users && !document.hidden && resume());
      listening = 1;
    });
  users++;
  return () => {
    users -= live;
    live = 0;
  };
};

/**
 * The shared context if it can play now, else undefined. Sounds requested before the first
 * gesture are dropped silently, never queued into a stale burst.
 */
export const ready = (): AudioContext | undefined =>
  ctx && (ctx.state == 'running' || Date.now() - resumedAt < RESUME_GRACE_MS) ? ctx : undefined;
