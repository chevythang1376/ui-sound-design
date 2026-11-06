/**
 * UI Sound Designer engine: the single synth engine used by the editor AND inlined into every
 * exported kit. Framework-free, zero dependencies, imports nothing outside src/engine.
 */
import { bind } from './bind';
import { listen, ready } from './context';
import { createLimiter } from './limiter';
import { seeded } from './noise';
import { siteOff, startMuted, writeMuted } from './prefs';
import { render } from './render';
import { masterLevel } from './theme';
import { OPTION_DEFAULTS, type CreateOptions, type Kit, type SoundKit } from './types';

export type * from './types';

export function createKit(kit: Kit, opts: CreateOptions = {}): SoundKit {
  let vol: number | undefined;
  let master: GainNode | undefined;
  const limiter = createLimiter();
  /** Mute toggles to re-sync on change. */
  const toggles = new Set<() => void>();
  /** Everything destroy() must undo. */
  const offs = new Set([listen()]);
  const rnd = opts.seed ? seeded(opts.seed) : Math.random;
  const o = () => ({ ...OPTION_DEFAULTS, ...kit.options, ...opts });
  let muted = startMuted(o().respectReducedMotion);
  const level = () => masterLevel(kit.theme, vol);
  /** A master gain at the current level, into the context's destination. */
  const gainOut = (c: BaseAudioContext) => {
    const g = c.createGain();
    g.gain.value = level();
    g.connect(c.destination);
    return g;
  };
  const sync = () => {
    if (master) master.gain.value = level();
    toggles.forEach((f) => f());
  };
  const track = (off: () => void) => (
    offs.add(off),
    () => {
      off();
      offs.delete(off);
    }
  );

  const play = (name: string, p?: { pitch?: number }, hover?: boolean) => {
    const r = kit.sounds[name];
    const c = ready();
    const t = Date.now();
    try {
      if (r && c && !api.isMuted() && limiter.ok(name, t, hover, o().hover)) {
        if (master?.context != c) {
          master = gainOut(c);
          opts.tap?.(master);
        }
        const v = render(c, r, master!, kit.theme, p?.pitch, rnd);
        if (v) limiter.add({ e: t + v.d * 1e3, k: v.k }, t, o().voiceCap);
      }
    } catch {}
  };

  const api: SoundKit = {
    play: (name, p) => play(name, p),
    bind: (selector, root) => track(bind(play, selector, root)),
    volume(v) {
      if (v != null) {
        vol = v;
        sync();
      }
      return level();
    },
    mute(m = true) {
      writeMuted((muted = m));
      if (m) limiter.clear();
      sync();
      return m;
    },
    isMuted: () => muted || siteOff(),
    mountMuteToggle(el) {
      const show = () => el.setAttribute('aria-pressed', '' + api.isMuted());
      const click = () => api.mute(!muted);
      if (!el.textContent!.trim()) el.textContent = 'Mute sounds';
      el.addEventListener('click', click);
      toggles.add(show);
      show();
      return track(() => {
        el.removeEventListener('click', click);
        toggles.delete(show);
      });
    },
    update(k) {
      kit = k;
      sync();
    },
    render(name, c, p) {
      const r = kit.sounds[name];
      const g = r && gainOut(c);
      return (g && render(c, r, g, kit.theme, p?.pitch, rnd, g)?.d) || 0;
    },
    destroy() {
      offs.forEach((f) => f());
      offs.clear();
      toggles.clear();
      limiter.clear();
      master?.disconnect();
      master = undefined;
    },
  };
  return api;
}
