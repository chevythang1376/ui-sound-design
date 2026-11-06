/**
 * The single editor store: the current kit, the selected sound, undo/redo and debounced autosave.
 *
 * Knob drags are coalesced into one history step: every edit carries a `key` (e.g.
 * "success.env.d"); consecutive edits with the same key extend the open step until seal() is
 * called (knobs call it on "change", i.e. when the gesture ends).
 */
import { validateKit } from '../engine/schema';
import type { Kit, Recipe } from '../engine/types';

export const KIT_KEY = 'usd:kit';
export const UI_KEY = 'usd:ui';
const HISTORY_LIMIT = 200;
const SAVE_DEBOUNCE_MS = 400;

export type Source = 'edit' | 'undo' | 'redo' | 'load' | 'select';

export interface Change {
  source: Source;
  /** Did the change affect how anything sounds? (Drives auto-play.) */
  audible: boolean;
}

export interface UiPrefs {
  selected: string;
  autoplay: boolean;
}

type Listener = (store: Store, change: Change) => void;

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** localStorage, or an in-memory stand-in when storage is blocked (privacy modes). */
export function safeStorage(): StorageLike {
  try {
    const s = window.localStorage;
    s.setItem('usd:probe', '1');
    s.removeItem('usd:probe');
    return s;
  } catch {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
  }
}

export interface Loaded {
  kit: Kit;
  /** Why the saved kit was not (fully) used, for a visible notice. */
  notice?: string;
}

/** Load the autosaved kit, falling back to `fallback` on missing or corrupt state. */
export function loadSavedKit(storage: StorageLike, fallback: () => Kit): Loaded {
  const raw = storage.getItem(KIT_KEY);
  if (!raw) return { kit: fallback() };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    storage.setItem(`${KIT_KEY}:corrupt`, raw);
    return {
      kit: fallback(),
      notice:
        'Your saved kit could not be read (corrupt JSON). Started from the default kit; the broken copy was kept under "usd:kit:corrupt".',
    };
  }
  const v = validateKit(json);
  if (!v.ok || !v.kit || !Object.keys(v.kit.sounds).length) {
    storage.setItem(`${KIT_KEY}:corrupt`, raw);
    return {
      kit: fallback(),
      notice: `Your saved kit was not usable (${v.errors[0] ?? 'no sounds'}). Started from the default kit.`,
    };
  }
  const n = v.errors.length + v.warnings.length;
  return {
    kit: v.kit,
    notice: n
      ? `Loaded your saved kit with ${n} fix${n == 1 ? '' : 'es'}: ${[...v.errors, ...v.warnings][0]}`
      : undefined,
  };
}

export class Store {
  kit: Kit;
  selected: string;
  autoplay: boolean;
  private past: Kit[] = [];
  private future: Kit[] = [];
  private openKey: string | null = null;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    kit: Kit,
    private storage: StorageLike,
    ui: Partial<UiPrefs> = {},
  ) {
    this.kit = kit;
    this.selected =
      ui.selected && kit.sounds[ui.selected] ? ui.selected : Object.keys(kit.sounds)[0]!;
    this.autoplay = ui.autoplay ?? true;
  }

  static loadUi(storage: StorageLike): Partial<UiPrefs> {
    try {
      return JSON.parse(storage.getItem(UI_KEY) ?? '{}') as Partial<UiPrefs>;
    } catch {
      return {};
    }
  }

  get recipe(): Recipe {
    return this.kit.sounds[this.selected]!;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  subscribe(f: Listener): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private emit(change: Change) {
    this.listeners.forEach((f) => f(this, change));
  }

  /**
   * Apply `fn` to a copy of the kit. Same `key` as the open step -> coalesced into it.
   * `key: null` always makes its own step.
   */
  edit(key: string | null, fn: (draft: Kit) => void, audible = true): void {
    const draft = structuredClone(this.kit);
    fn(draft);
    if (JSON.stringify(draft) === JSON.stringify(this.kit)) return;
    if (!(key !== null && key === this.openKey)) {
      this.past.push(this.kit);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.openKey = key;
    this.future = [];
    this.kit = draft;
    this.scheduleSave();
    this.emit({ source: 'edit', audible });
  }

  /** Edit the selected recipe. */
  editRecipe(key: string, fn: (r: Recipe) => void): void {
    const id = this.selected;
    this.edit(`${id}.${key}`, (k) => fn(k.sounds[id]!));
  }

  /** End the open coalescing step (a knob gesture finished). */
  seal(): void {
    this.openKey = null;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.kit);
    this.kit = prev;
    this.afterJump('undo');
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.kit);
    this.kit = next;
    this.afterJump('redo');
  }

  private afterJump(source: Source) {
    this.openKey = null;
    if (!this.kit.sounds[this.selected]) this.selected = Object.keys(this.kit.sounds)[0]!;
    this.scheduleSave();
    this.emit({ source, audible: true });
  }

  /** Replace the whole kit (shared link, import, reset). Undoable. */
  load(kit: Kit): void {
    this.past.push(this.kit);
    this.future = [];
    this.openKey = null;
    this.kit = kit;
    if (!kit.sounds[this.selected]) this.selected = Object.keys(kit.sounds)[0]!;
    this.scheduleSave();
    this.emit({ source: 'load', audible: false });
  }

  select(id: string): void {
    if (!this.kit.sounds[id] || id === this.selected) return;
    this.selected = id;
    this.openKey = null;
    this.saveUi();
    this.emit({ source: 'select', audible: false });
  }

  setAutoplay(on: boolean): void {
    this.autoplay = on;
    this.saveUi();
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
  }

  /** Write the kit now (also called on pagehide so nothing is lost). */
  saveNow(): void {
    clearTimeout(this.saveTimer);
    try {
      this.storage.setItem(KIT_KEY, JSON.stringify(this.kit));
    } catch {}
    this.saveUi();
  }

  private saveUi() {
    try {
      this.storage.setItem(
        UI_KEY,
        JSON.stringify({ selected: this.selected, autoplay: this.autoplay } satisfies UiPrefs),
      );
    } catch {}
  }
}
