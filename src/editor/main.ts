/**
 * Editor entry. The editor plays sound only through src/engine/index.ts — the same engine that
 * every exported kit inlines — so what you hear here is exactly what ships.
 */
import './styles/main.css';
import { createKit } from '../engine/index';
import { recipeMs, validateKit } from '../engine/schema';
import type { Kit } from '../engine/types';
import { defaultKit } from '../presets/default-kit';
import { openExportModal, openJsonDialog, openShareDialog } from './panels/export-modal';
import { renderPreview, Scope } from './panels/scope';
import { stagePanel } from './panels/stage';
import { synthPanel } from './panels/synth-panel';
import { decodeKit, readHash } from './share';
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

const loadKit = (k: Kit, notes: string[] = [], what = 'Kit') => {
  store.load(k);
  status.say(
    notes.length
      ? `${what} loaded with ${notes.length} fix${notes.length == 1 ? '' : 'es'}: ${notes[0]}`
      : `${what} loaded. Undo brings your previous kit back.`,
    8000,
  );
};

const extra = [
  h(
    'button',
    { type: 'button', class: 'btn', onclick: () => openShareDialog(store.kit, status.say) },
    'Share link',
  ),
  h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => openJsonDialog(store.kit, (k, n) => loadKit(k, n, 'Kit JSON'), status.say),
    },
    'Kit JSON',
  ),
  h(
    'button',
    {
      type: 'button',
      class: 'btn btn-accent',
      onclick: () => openExportModal(store.kit, status.say),
    },
    'Export',
  ),
];
const bar = topBar(store, kit, { playAll, stopAll, reset }, extra);
const list = soundList(store, play);
const synth = synthPanel(store, scope, () => play());
const stage = stagePanel(store, kit);

const w = window as unknown as Record<string, unknown>;
const noAudio = !w.AudioContext && !w.webkitAudioContext;
synth.el.id = 'synth';
synth.el.tabIndex = -1;

const banner = h(
  'p',
  { class: 'banner', role: 'note', hidden: !noAudio },
  'This browser has no Web Audio API, so sounds cannot play here. Editing, sharing and export still work; the exported kit stays silent on browsers like this one.',
);

document
  .querySelector('#app')!
  .replaceChildren(
    h('a', { class: 'skip-link', href: '#synth' }, 'Skip to the synth panel'),
    bar.el,
    banner,
    h('main', { class: 'main' }, list.el, synth.el, stage.el),
    status.el,
  );

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
  const t = e.target as HTMLElement;
  if (e.defaultPrevented || typing(t) || t.closest?.('dialog')) return;
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

if (!storage.persistent)
  status.say(
    'This browser blocks local storage, so your kit will not be saved when you close the tab. Use Kit JSON or Share link to keep it.',
    15000,
  );
else if (loaded.notice) status.say(loaded.notice, 10000);

/**
 * Shared links (#k=…): decode, validate, and ask before replacing local work.
 */
async function openSharedLink() {
  const encoded = readHash(location.hash);
  if (!encoded) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const v = validateKit(await decodeKit(encoded));
    if (!v.ok || !v.kit || !Object.keys(v.kit.sounds).length)
      throw new Error(v.errors[0] ?? 'The shared kit has no sounds.');
    if (JSON.stringify(v.kit) === JSON.stringify(store.kit)) return;
    const notes = [...v.errors, ...v.warnings];
    const ok = await confirmDialog({
      title: `Load shared kit "${v.kit.name}"?`,
      body: `It replaces the kit you are editing ("${store.kit.name}"). Undo brings yours back.`,
      ok: 'Load shared kit',
      cancel: 'Keep mine',
    });
    if (ok) loadKit(v.kit, notes, 'Shared kit');
  } catch (e) {
    status.say(`Could not open the share link: ${(e as Error).message}`, 10000);
  }
}
void openSharedLink();
addEventListener('hashchange', () => void openSharedLink());

/** Debug / test handle. */
(window as unknown as { soundDesigner: unknown }).soundDesigner = { store, kit };
