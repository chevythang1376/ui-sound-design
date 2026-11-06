/**
 * Top bar: kit name, global pitch and volume, mute (the kit's own mountMuteToggle), Play all,
 * Undo/Redo and the kit actions. Share / Export plug in through `extra`.
 */
import type { SoundKit } from '../../engine/index';
import type { Store } from '../store';
import { h } from './dom';
import { knob } from './knob';

export interface TopBarActions {
  playAll(): void;
  stopAll(): void;
  reset(): void;
}

export function topBar(store: Store, kit: SoundKit, actions: TopBarActions, extra: Node[] = []) {
  const name = h('input', {
    type: 'text',
    class: 'kit-name',
    'aria-label': 'Kit name',
    maxlength: 80,
    spellcheck: 'false',
  });
  name.value = store.kit.name ?? '';
  name.addEventListener('change', () => {
    const v = name.value.trim() || 'Untitled kit';
    store.edit(null, (k) => (k.name = v), false);
  });

  const pitch = knob({
    label: 'Pitch',
    name: 'Global pitch',
    min: -12,
    max: 12,
    step: 1,
    value: 0,
    default: 0,
    unit: 'st',
  });
  pitch.addEventListener('input', () =>
    store.edit('theme.pitch', (k) => (k.theme = { ...k.theme, pitch: pitch.value })),
  );
  pitch.addEventListener('change', () => store.seal());
  const volume = knob({
    label: 'Volume',
    name: 'Master volume',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.5,
    default: 0.5,
    unit: '%',
  });
  volume.addEventListener('input', () =>
    store.edit('theme.volume', (k) => (k.theme = { ...k.theme, volume: volume.value })),
  );
  volume.addEventListener('change', () => store.seal());
  pitch.title = 'Global pitch: transposes every sound at play time (recipes are unchanged).';
  volume.title = 'Master volume of the kit (ships with the export).';

  const mute = h('button', { type: 'button', class: 'btn mute-btn' }, 'Mute sounds');
  kit.mountMuteToggle(mute);

  let playing = false;
  const playAll = h(
    'button',
    { type: 'button', class: 'btn', 'aria-pressed': 'false' },
    'Play all',
  );
  playAll.addEventListener('click', () => {
    if (playing) actions.stopAll();
    else actions.playAll();
  });

  const undo = h(
    'button',
    {
      type: 'button',
      class: 'btn icon',
      'aria-label': 'Undo',
      title: 'Undo (Ctrl+Z)',
      onclick: () => store.undo(),
    },
    h('span', { 'aria-hidden': 'true' }, '↶'),
  );
  const redo = h(
    'button',
    {
      type: 'button',
      class: 'btn icon',
      'aria-label': 'Redo',
      title: 'Redo (Ctrl+Shift+Z)',
      onclick: () => store.redo(),
    },
    h('span', { 'aria-hidden': 'true' }, '↷'),
  );
  const reset = h(
    'button',
    { type: 'button', class: 'btn quiet', onclick: () => actions.reset() },
    'Reset kit',
  );

  const el = h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'brand' },
      h('span', { class: 'logo', 'aria-hidden': 'true' }),
      h('span', { class: 'brand-name' }, 'UI Sound Designer'),
    ),
    name,
    h('div', { class: 'topbar-knobs' }, pitch, volume),
    mute,
    playAll,
    h('div', { class: 'btn-group', role: 'group', 'aria-label': 'History' }, undo, redo),
    ...extra,
    reset,
  );

  const update = () => {
    if (document.activeElement !== name) name.value = store.kit.name ?? '';
    pitch.value = store.kit.theme?.pitch ?? 0;
    volume.value = store.kit.theme?.volume ?? 0.5;
    undo.disabled = !store.canUndo;
    redo.disabled = !store.canRedo;
  };
  update();

  return {
    el,
    update,
    setPlaying(p: boolean) {
      playing = p;
      playAll.textContent = p ? 'Stop' : 'Play all';
      playAll.setAttribute('aria-pressed', String(p));
    },
  };
}
