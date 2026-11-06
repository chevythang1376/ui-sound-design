/**
 * Editor entry. The editor plays sound only through src/engine/index.ts — the same engine that
 * every exported kit inlines — so what you hear here is exactly what ships.
 */
import './styles/main.css';
import { createKit } from '../engine/index';
import { recipeMs } from '../engine/schema';
import { defaultKit } from '../presets/default-kit';
import { renderPreview, Scope } from './panels/scope';
import { stagePanel } from './panels/stage';
import { synthPanel } from './panels/synth-panel';
import { loadSavedKit, safeStorage, Store } from './store';
import { confirmDialog, statusRegion } from './ui/dialog';
import { h } from './ui/dom';
import { soundList } from './ui/sound-list';
import { topBar } from './ui/top-bar';

const AUTOPLAY_DEBOUNCE_MS = 120;
const PLAY_ALL_SPACING_MS = 350;
const PREVIEW_SECONDS = 1;

const storage = safeStorage();
const loaded = loadSavedKit(storage, defaultKit);
const store = new Store(loaded.kit, storage, Store.loadUi(storage));
const scope = new Scope();

// The designer is here to hear sounds: do not start muted just because the OS reduces motion.
const kit = createKit(store.kit, { respectReducedMotion: false, tap: (m) => scope.attach(m) });

const status = statusRegion();

const play = (id = store.selected) => {
  kit.play(id);
  const r = store.kit.sounds[id];
  if (r) scope.run(recipeMs(r) + 150);
};

let playAllTimers: number[] = [];
const stopAll = () => {
  playAllTimers.forEach(clearTimeout);
  playAllTimers = [];
  bar.setPlaying(false);
};
const playAll = () => {
  stopAll();
  const ids = Object.keys(store.kit.sounds);
  bar.setPlaying(true);
  playAllTimers = ids.map((id, i) =>
    window.setTimeout(() => {
      play(id);
      if (i == ids.length - 1) window.setTimeout(stopAll, PLAY_ALL_SPACING_MS);
    }, i * PLAY_ALL_SPACING_MS),
  );
};

const reset = async () => {
  const ok = await confirmDialog({
    title: 'Reset to the default kit?',
    body: 'This replaces every sound in your kit with the starter presets. You can undo it.',
    ok: 'Reset kit',
    danger: true,
  });
  if (!ok) return;
  store.load(defaultKit());
  status.say('Kit reset to the defaults. Undo brings yours back.');
};

const bar = topBar(store, kit, { playAll, stopAll, reset });
const list = soundList(store, play);
const synth = synthPanel(store, scope, () => play());
const stage = stagePanel(store, kit);

document
  .querySelector('#app')!
  .replaceChildren(bar.el, h('main', { class: 'main' }, list.el, synth.el, stage.el), status.el);

// Offline preview (waveform + peak), debounced.
let previewTimer = 0;
let previewSeq = 0;
const preview = () => {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(async () => {
    const seq = ++previewSeq;
    try {
      const p = await renderPreview(kit, store.selected, PREVIEW_SECONDS);
      if (seq == previewSeq) scope.show(p, Math.max(0.06, recipeMs(store.recipe) / 1000 + 0.03));
    } catch {}
  }, 60);
};

let autoplayTimer = 0;
store.subscribe((s, change) => {
  kit.update(s.kit);
  bar.update();
  list.update();
  synth.update();
  stage.update();
  preview();
  if (change.audible && s.autoplay && change.source != 'load') {
    clearTimeout(autoplayTimer);
    autoplayTimer = window.setTimeout(() => play(), AUTOPLAY_DEBOUNCE_MS);
  }
});
preview();

// Keyboard: Space plays the selected sound; Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]') ||
    t.isContentEditable);
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || typing(e.target)) return;
  const t = e.target as HTMLElement;
  const mod = e.ctrlKey || e.metaKey;
  if (
    e.key == ' ' &&
    !mod &&
    !t.closest('button, [role="radio"], [role="switch"], a, summary, dialog')
  ) {
    e.preventDefault();
    play();
  } else if (mod && e.key.toLowerCase() == 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (mod && e.key.toLowerCase() == 'y') {
    e.preventDefault();
    store.redo();
  }
});

addEventListener('pagehide', () => store.saveNow());
document.addEventListener('visibilitychange', () => document.hidden && store.saveNow());

if (loaded.notice) status.say(loaded.notice, 10000);

/** Debug / test handle. */
(window as unknown as { soundDesigner: unknown }).soundDesigner = { store, kit };
