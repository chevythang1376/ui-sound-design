/** Left column: every sound with a play button, the selected state and a duration badge. */
import { LONG_SOUND_MS, recipeMs } from '../../engine/schema';
import { PRESET_INFO } from '../../presets/default-kit';
import type { Store } from '../store';
import { h } from './dom';

export function soundList(store: Store, play: (id: string) => void) {
  const list = h('ul', { class: 'sound-list', role: 'list' });
  const el = h(
    'nav',
    { class: 'sounds', 'aria-label': 'Sounds' },
    h('h2', { class: 'col-title' }, 'Sounds'),
    list,
    h('p', { class: 'hint' }, 'Space plays the selected sound.'),
  );

  const order = () => {
    const ids = Object.keys(store.kit.sounds);
    const known = PRESET_INFO.map((p) => p.id).filter((id) => ids.includes(id));
    return [...known, ...ids.filter((id) => !known.includes(id))];
  };

  const render = () => {
    list.replaceChildren(
      ...order().map((id) => {
        const info = PRESET_INFO.find((p) => p.id == id);
        const ms = Math.round(recipeMs(store.kit.sounds[id]!));
        const over = ms > LONG_SOUND_MS;
        const selected = id == store.selected;
        return h(
          'li',
          { class: selected ? 'sound selected' : 'sound' },
          h(
            'button',
            {
              type: 'button',
              class: 'sound-row',
              'aria-current': selected ? 'true' : null,
              'aria-label': `${info?.label ?? id}, ${ms} ms${over ? `, longer than ${LONG_SOUND_MS} ms` : ''}`,
              title: info?.character ?? id,
              'data-id': id,
              onclick: () => store.select(id),
            },
            h('span', { class: 'sound-name' }, info?.label ?? id),
            h(
              'span',
              {
                class: over ? 'badge over mono' : 'badge mono',
                title: over ? `Longer than ${LONG_SOUND_MS} ms` : 'Length',
              },
              `${ms} ms`,
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'sound-play',
              'aria-label': `Play ${info?.label ?? id}`,
              onclick: () => play(id),
            },
            h('span', { 'aria-hidden': 'true' }, '▶'),
          ),
        );
      }),
    );
  };

  render();
  return {
    el,
    update(keepFocus = true) {
      const focused = (document.activeElement as HTMLElement | null)?.closest?.('.sound');
      const focusedId = focused?.querySelector<HTMLElement>('.sound-row')?.dataset.id;
      const wasPlay = document.activeElement?.classList.contains('sound-play');
      render();
      if (keepFocus && focusedId) {
        const row = list.querySelector<HTMLElement>(
          `.sound-row[data-id="${CSS.escape(focusedId)}"]`,
        );
        (wasPlay ? row?.parentElement?.querySelector<HTMLElement>('.sound-play') : row)?.focus();
      }
    },
  };
}
