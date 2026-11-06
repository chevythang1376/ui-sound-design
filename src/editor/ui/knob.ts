/**
 * <sd-knob>: the one reusable knob.
 *
 * - vertical drag (Shift = fine), wheel, double-click resets to default
 * - keyboard: arrows step, PageUp/PageDown large step, Home/End min/max, Enter types a value
 * - role="slider" with aria-valuemin/max/now and aria-valuetext with units ("140 ms", "5.2 kHz")
 * - click the value readout to type an exact number
 * - linear or log scaling per instance (scale="log")
 *
 * Attributes: label (visible), name (full accessible name, defaults to label), min, max, step,
 * value, default, unit (ms | Hz | st | ct | % | x), scale, disabled.
 * Events: "input" while changing, "change" when a gesture ends.
 */
import { formatHz } from '../../engine/notes';
import { id } from './dom';

const SWEEP = 135; // degrees either side of 12 o'clock
const DRAG_PX = 200; // pixels for the full range
const FINE = 5; // Shift divides drag/wheel/arrow sensitivity by this

const decimals = (step: number) => {
  const s = String(step);
  return s.includes('e-') ? +s.split('e-')[1]! : (s.split('.')[1] ?? '').length;
};

export function formatValue(v: number, unit: string, step: number): string {
  const d = decimals(step);
  switch (unit) {
    case 'ms':
      return `${Math.round(v)} ms`;
    case 'Hz':
      return formatHz(v);
    case 'st':
      return `${v > 0 ? '+' : ''}${v.toFixed(d)} st`;
    case 'ct':
      return `${v > 0 ? '+' : ''}${Math.round(v)} ct`;
    case '%':
      return `${Math.round(v * 100)}%`;
    default:
      return v.toFixed(d);
  }
}

/** "5.2k", "5200", "5.2 kHz", "140ms", "50%", "+3" -> number (NaN if unreadable). */
export function parseValue(raw: string, unit: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, '.');
  const n = parseFloat(s.replace(/^\+/, ''));
  if (!Number.isFinite(n)) return NaN;
  if (/k(hz)?$/.test(s)) return n * 1000;
  if (unit == '%' || s.endsWith('%')) return unit == '%' ? n / 100 : n;
  return n;
}

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
const arcPath = (from: number, to: number, r = 19) => {
  const [x1, y1] = polar(24, 24, r, from);
  const [x2, y2] = polar(24, 24, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export class SdKnob extends HTMLElement {
  static observedAttributes = [
    'value',
    'min',
    'max',
    'step',
    'label',
    'name',
    'unit',
    'scale',
    'disabled',
  ];

  /** Optional custom readout formatter. */
  format?: (v: number) => string;

  private _value = 0;
  private built = false;
  private dial!: HTMLDivElement;
  private labelEl!: HTMLSpanElement;
  private readout!: HTMLSpanElement;
  private input!: HTMLInputElement;
  private valueArc!: SVGPathElement;
  private pointer!: SVGLineElement;
  private lastY: number | null = null;
  /** Unquantized normalized position during a drag, so slow drags still move coarse knobs. */
  private dragN = 0;
  private moved = false;
  private wheelTimer = 0;

  private num(name: string, d: number) {
    const v = parseFloat(this.getAttribute(name) ?? '');
    return Number.isFinite(v) ? v : d;
  }
  get min() {
    return this.num('min', 0);
  }
  get max() {
    return this.num('max', 1);
  }
  get step() {
    return this.num('step', 0.01);
  }
  get unit() {
    return this.getAttribute('unit') ?? '';
  }
  get log() {
    return this.getAttribute('scale') == 'log' && this.min > 0;
  }
  get defaultValue() {
    return this.num('default', this.min);
  }
  get disabled() {
    return this.hasAttribute('disabled');
  }
  set disabled(d: boolean) {
    this.toggleAttribute('disabled', d);
  }

  get value(): number {
    return this._value;
  }
  /** Set programmatically (no events). */
  set value(v: number) {
    this._value = this.clamp(v);
    if (this.built) this.paint();
  }

  connectedCallback() {
    if (!this.built) this.build();
    this.paint();
  }

  attributeChangedCallback(name: string) {
    if (name == 'value') this._value = this.clamp(this.num('value', this.min));
    if (this.built) this.paint();
  }

  private clamp(v: number) {
    return Math.min(this.max, Math.max(this.min, Number.isFinite(v) ? v : this.min));
  }
  private quantize(v: number) {
    const s = this.step;
    const q = Math.round((v - this.min) / s) * s + this.min;
    return +this.clamp(q).toFixed(Math.max(decimals(s), decimals(this.min)));
  }
  private toNorm(v: number) {
    const { min, max } = this;
    return this.log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min || 1);
  }
  private fromNorm(n: number) {
    const { min, max } = this;
    n = Math.min(1, Math.max(0, n));
    return this.log ? min * (max / min) ** n : min + n * (max - min);
  }
  text(v = this._value) {
    return this.format ? this.format(v) : formatValue(v, this.unit, this.step);
  }

  private build() {
    this.built = true;
    const lid = id('knob-label');
    this.labelEl = document.createElement('span');
    this.labelEl.className = 'knob-label';
    this.labelEl.id = lid;

    this.dial = document.createElement('div');
    this.dial.className = 'knob-dial';
    this.dial.setAttribute('role', 'slider');
    this.labelEl.setAttribute('aria-hidden', 'true');
    const g = svg('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true', focusable: 'false' });
    g.append(svg('path', { class: 'knob-track', d: arcPath(-SWEEP, SWEEP) }));
    this.valueArc = svg('path', { class: 'knob-arc' }) as SVGPathElement;
    this.pointer = svg('line', {
      class: 'knob-pointer',
      x1: '24',
      y1: '24',
      x2: '24',
      y2: '9',
    }) as SVGLineElement;
    g.append(
      this.valueArc,
      svg('circle', { class: 'knob-cap', cx: '24', cy: '24', r: '13' }),
      this.pointer,
    );
    this.dial.append(g);

    this.readout = document.createElement('span');
    this.readout.className = 'knob-value';
    this.readout.title = 'Click to type a value';
    this.input = document.createElement('input');
    this.input.className = 'knob-input';
    this.input.type = 'text';
    this.input.inputMode = 'decimal';
    this.input.hidden = true;
    this.append(this.labelEl, this.dial, this.readout, this.input);

    this.dial.addEventListener('pointerdown', (e) => this.onDown(e));
    this.dial.addEventListener('pointermove', (e) => this.onMove(e));
    this.dial.addEventListener('pointerup', (e) => this.onUp(e));
    this.dial.addEventListener('pointercancel', (e) => this.onUp(e));
    this.dial.addEventListener('dblclick', () => this.user(this.defaultValue, true));
    this.dial.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.dial.addEventListener('keydown', (e) => this.onKey(e));
    this.readout.addEventListener('click', () => this.edit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key == 'Enter') this.commitEdit();
      else if (e.key == 'Escape') this.endEdit();
      e.stopPropagation();
    });
    this.input.addEventListener('blur', () => this.commitEdit());
    // Native events from the typing box must not look like knob events.
    for (const t of ['input', 'change']) this.input.addEventListener(t, (e) => e.stopPropagation());
  }

  private paint() {
    const n = this.toNorm(this._value);
    const deg = -SWEEP + n * SWEEP * 2;
    const txt = this.text();
    const label = this.getAttribute('label') ?? '';
    this.labelEl.textContent = label;
    this.dial.setAttribute('aria-label', this.getAttribute('name') ?? label);
    this.input.setAttribute('aria-label', `${this.getAttribute('name') ?? label} value`);
    this.readout.textContent = txt;
    this.valueArc.setAttribute('d', n > 0.002 ? arcPath(-SWEEP, deg) : '');
    this.pointer.setAttribute('transform', `rotate(${deg} 24 24)`);
    const d = this.dial;
    d.setAttribute('aria-valuemin', String(this.min));
    d.setAttribute('aria-valuemax', String(this.max));
    d.setAttribute('aria-valuenow', String(this._value));
    d.setAttribute('aria-valuetext', txt);
    d.tabIndex = this.disabled ? -1 : 0;
    if (this.disabled) d.setAttribute('aria-disabled', 'true');
    else d.removeAttribute('aria-disabled');
  }

  /** A user-driven change: quantize, repaint, fire input (and change when `commit`). */
  private user(v: number, commit = false) {
    const nv = this.quantize(v);
    const changed = nv !== this._value;
    if (changed) {
      this._value = nv;
      this.paint();
      this.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (commit) this.dispatchEvent(new Event('change', { bubbles: true }));
    return changed;
  }

  private stepBy(dn: number) {
    const v0 = this._value;
    let v = this.quantize(this.fromNorm(this.toNorm(v0) + dn));
    if (v === v0) v = this.clamp(v0 + Math.sign(dn) * this.step);
    this.user(v, true);
  }

  private onDown(e: PointerEvent) {
    if (this.disabled || e.button != 0) return;
    e.preventDefault();
    this.dial.focus();
    this.dial.setPointerCapture(e.pointerId);
    this.lastY = e.clientY;
    this.dragN = this.toNorm(this._value);
    this.moved = false;
    this.classList.add('dragging');
  }
  private onMove(e: PointerEvent) {
    if (this.lastY == null) return;
    const dy = this.lastY - e.clientY;
    this.lastY = e.clientY;
    if (!dy) return;
    this.dragN = Math.min(1, Math.max(0, this.dragN + dy / DRAG_PX / (e.shiftKey ? FINE : 1)));
    this.moved = this.user(this.fromNorm(this.dragN)) || this.moved;
  }
  private onUp(e: PointerEvent) {
    if (this.lastY == null) return;
    this.lastY = null;
    this.classList.remove('dragging');
    if (this.dial.hasPointerCapture(e.pointerId)) this.dial.releasePointerCapture(e.pointerId);
    if (this.moved) this.dispatchEvent(new Event('change', { bubbles: true }));
  }
  private onWheel(e: WheelEvent) {
    if (this.disabled) return;
    e.preventDefault();
    const dn = (-Math.sign(e.deltaY) * 0.01) / (e.shiftKey ? FINE : 1);
    let v = this.quantize(this.fromNorm(this.toNorm(this._value) + dn));
    if (v === this._value && dn) v = this.clamp(this._value + Math.sign(dn) * this.step);
    this.user(v);
    clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(
      () => this.dispatchEvent(new Event('change', { bubbles: true })),
      300,
    );
  }
  private onKey(e: KeyboardEvent) {
    if (this.disabled) return;
    const fine = e.shiftKey ? FINE : 1;
    const keys: Record<string, () => void> = {
      ArrowUp: () => this.stepBy(0.01 / fine),
      ArrowRight: () => this.stepBy(0.01 / fine),
      ArrowDown: () => this.stepBy(-0.01 / fine),
      ArrowLeft: () => this.stepBy(-0.01 / fine),
      PageUp: () => this.stepBy(0.1),
      PageDown: () => this.stepBy(-0.1),
      Home: () => this.user(this.min, true),
      End: () => this.user(this.max, true),
      Enter: () => this.edit(),
    };
    const f = keys[e.key];
    if (f) {
      e.preventDefault();
      f();
    }
  }

  private edit() {
    if (this.disabled) return;
    this.input.value = String(this._value);
    this.input.hidden = false;
    this.readout.hidden = true;
    this.input.focus();
    this.input.select();
  }
  private commitEdit() {
    if (this.input.hidden) return;
    const v = parseValue(this.input.value, this.unit);
    this.endEdit();
    if (Number.isFinite(v)) this.user(v, true);
  }
  private endEdit() {
    if (this.input.hidden) return;
    this.input.hidden = true;
    this.readout.hidden = false;
    this.dial.focus();
  }
}

if (!customElements.get('sd-knob')) customElements.define('sd-knob', SdKnob);

declare global {
  interface HTMLElementTagNameMap {
    'sd-knob': SdKnob;
  }
}

/** Create a knob with attributes. */
export function knob(attrs: {
  label: string;
  name?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  default?: number;
  unit?: string;
  scale?: 'lin' | 'log';
  title?: string;
}): SdKnob {
  const k = document.createElement('sd-knob');
  for (const [key, v] of Object.entries(attrs)) if (v !== undefined) k.setAttribute(key, String(v));
  return k;
}
