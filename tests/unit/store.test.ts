import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KIT_KEY, Store, loadSavedKit, type StorageLike } from '../../src/editor/store';
import { defaultKit } from '../../src/presets/default-kit';

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('store history', () => {
  it('coalesces edits with the same key until sealed (one knob drag = one step)', () => {
    const s = new Store(defaultKit(), memory());
    for (const d of [40, 60, 80, 100]) s.editRecipe('env.d', (r) => (r.env!.d = d));
    s.seal();
    expect(s.recipe.env!.d).toBe(100);
    s.undo();
    expect(s.recipe.env!.d).toBe(35);
    expect(s.canUndo).toBe(false);
    s.redo();
    expect(s.recipe.env!.d).toBe(100);
  });

  it('a different key or a seal starts a new step', () => {
    const s = new Store(defaultKit(), memory());
    s.editRecipe('env.d', (r) => (r.env!.d = 50));
    s.editRecipe('gain', (r) => (r.gain = 0.1));
    s.editRecipe('gain', (r) => (r.gain = 0.2));
    s.seal();
    s.editRecipe('gain', (r) => (r.gain = 0.3));
    s.undo();
    expect(s.recipe.gain).toBe(0.2);
    s.undo();
    expect(s.recipe.gain).toBe(0.25);
    expect(s.recipe.env!.d).toBe(50);
  });

  it('ignores edits that change nothing', () => {
    const s = new Store(defaultKit(), memory());
    const seen: string[] = [];
    s.subscribe((_, c) => seen.push(c.source));
    s.editRecipe('gain', (r) => (r.gain = 0.25));
    expect(s.canUndo).toBe(false);
    expect(seen).toEqual([]);
  });

  it('a new edit clears the redo stack', () => {
    const s = new Store(defaultKit(), memory());
    s.edit(null, (k) => (k.name = 'A'));
    s.undo();
    expect(s.canRedo).toBe(true);
    s.edit(null, (k) => (k.name = 'B'));
    expect(s.canRedo).toBe(false);
  });

  it('load() replaces the kit and is undoable', () => {
    const s = new Store(defaultKit(), memory());
    s.select('error');
    s.load({ v: 1, name: 'Other', sounds: { beep: { voices: [{ note: 'A5' }] } } });
    expect(s.selected).toBe('beep');
    s.undo();
    expect(s.kit.name).toBe('My Kit');
    // 'beep' no longer exists after undo: selection falls back to the first sound.
    expect(s.selected).toBe('click');
  });

  it('notifies with an audible flag', () => {
    const s = new Store(defaultKit(), memory());
    const seen: [string, boolean][] = [];
    s.subscribe((_, c) => seen.push([c.source, c.audible]));
    s.edit(null, (k) => (k.name = 'X'), false);
    s.editRecipe('gain', (r) => (r.gain = 0.1));
    s.undo();
    s.select('success');
    expect(seen).toEqual([
      ['edit', false],
      ['edit', true],
      ['undo', true],
      ['select', false],
    ]);
  });
});

describe('autosave', () => {
  it('debounces writes and restores selection and auto-play', () => {
    const mem = memory();
    const s = new Store(defaultKit(), mem);
    s.select('notification');
    s.setAutoplay(false);
    s.editRecipe('gain', (r) => (r.gain = 0.12));
    expect(mem.map.has(KIT_KEY)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(JSON.parse(mem.map.get(KIT_KEY)!).sounds.notification.gain).toBe(0.12);

    const loaded = loadSavedKit(mem, defaultKit);
    const s2 = new Store(loaded.kit, mem, Store.loadUi(mem));
    expect(s2.selected).toBe('notification');
    expect(s2.autoplay).toBe(false);
    expect(s2.recipe.gain).toBe(0.12);
    expect(loaded.notice).toBeUndefined();
  });

  it('falls back to the default kit on corrupt JSON and keeps the broken copy', () => {
    const mem = memory();
    mem.setItem(KIT_KEY, '{oops');
    const r = loadSavedKit(mem, defaultKit);
    expect(Object.keys(r.kit.sounds)).toHaveLength(9);
    expect(r.notice).toMatch(/could not be read/);
    expect(mem.getItem(`${KIT_KEY}:corrupt`)).toBe('{oops');
  });

  it('falls back when the saved kit has no usable sounds', () => {
    const mem = memory();
    mem.setItem(KIT_KEY, JSON.stringify({ v: 1, sounds: {} }));
    const r = loadSavedKit(mem, defaultKit);
    expect(r.kit.name).toBe('My Kit');
    expect(r.notice).toMatch(/not usable/);
  });

  it('repairs fixable saved kits and says so', () => {
    const mem = memory();
    mem.setItem(
      KIT_KEY,
      JSON.stringify({ v: 1, sounds: { a: { voices: [{ note: 'C5' }], gain: 9 } } }),
    );
    const r = loadSavedKit(mem, defaultKit);
    expect(r.kit.sounds.a!.gain).toBe(1);
    expect(r.notice).toMatch(/1 fix:/);
  });
});
