/** Tiny DOM builder: h('button', { class: 'x', onclick: fn }, 'Label'). */
type Child = Node | string | number | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined | ((e: Event) => void);
export type Attrs = Record<string, AttrValue>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(tag: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement;
export function h(tag: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (typeof v == 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k == 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...kids(children));
  return el;
}

const kids = (children: Child[]): (Node | string)[] =>
  children
    .filter((c) => c != null && c !== false)
    .map((c) => (typeof c == 'number' ? String(c) : c)) as (Node | string)[];

let uid = 0;
/** Unique id for aria wiring. */
export const id = (prefix = 'sd'): string => `${prefix}-${++uid}`;

/** Read a CSS custom property from :root (for canvas drawing). */
export const cssVar = (name: string, fallback = '#888'): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const prefersReducedMotion = (): boolean =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A labelled switch (native checkbox with role="switch"). */
export function switchControl(
  label: string,
  checked: boolean,
  onChange: (on: boolean) => void,
  attrs: Attrs = {},
): { root: HTMLLabelElement; input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', role: 'switch', ...attrs });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const root = h(
    'label',
    { class: 'switch' },
    input,
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
    h('span', { class: 'switch-label' }, label),
  );
  return { root, input };
}

/** Size a canvas's backing store to its CSS size times devicePixelRatio. */
export function fitCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const hh = Math.max(1, Math.round(r.height * dpr));
  if (c.width != w || c.height != hh) {
    c.width = w;
    c.height = hh;
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}
