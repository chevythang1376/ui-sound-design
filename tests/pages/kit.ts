/**
 * M2 test page: every preset on a data-sound button, wired with kit.bind(), plus a mute toggle
 * (kit.mountMuteToggle) and the theme controls.
 */
import { createKit, type Kit } from '../../src/engine/index';
import { DEFAULT_KIT, PRESET_INFO } from '../../src/presets/default-kit';

let current: Kit = structuredClone(DEFAULT_KIT);
const kit = createKit(current);

const list = document.querySelector('#sounds')!;
for (const p of PRESET_INFO) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.sound = p.id;
  b.textContent = p.label;
  b.title = p.character;
  list.append(b);
}

kit.bind();
kit.mountMuteToggle(document.querySelector<HTMLButtonElement>('#mute')!);

const update = (f: (k: Kit) => void) => {
  current = structuredClone(current);
  f(current);
  kit.update(current);
};
const pitch = document.querySelector<HTMLInputElement>('#pitch')!;
const volume = document.querySelector<HTMLInputElement>('#volume')!;
const hover = document.querySelector<HTMLInputElement>('#hover')!;
const out = document.querySelector('#readout')!;
const show = () =>
  (out.textContent = `pitch ${current.theme!.pitch} st, volume ${current.theme!.volume}, hover ${current.options!.hover ? 'on' : 'off'}`);
pitch.addEventListener('input', () => update((k) => (k.theme!.pitch = +pitch.value)));
volume.addEventListener('input', () => update((k) => (k.theme!.volume = +volume.value)));
hover.addEventListener('change', () => update((k) => (k.options!.hover = hover.checked)));
for (const el of [pitch, volume, hover]) el.addEventListener('input', show);
hover.addEventListener('change', show);
show();

const page = {
  kit,
  update,
  createKit,
  get current() {
    return current;
  },
};
export type KitPage = typeof page;
(window as unknown as { kitPage: KitPage }).kitPage = page;
