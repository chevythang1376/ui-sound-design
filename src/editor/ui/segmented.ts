/**
 * <sd-segmented>: a radio group as a segmented control. Arrow keys move and select (roving
 * tabindex), as in the WAI-ARIA radio group pattern. Fires "change"; read `.value`.
 */
export interface SegOption {
  value: string;
  label: string;
  title?: string;
}

export class SdSegmented extends HTMLElement {
  private opts: SegOption[] = [];
  private _value = '';
  private buttons: HTMLButtonElement[] = [];

  get value() {
    return this._value;
  }
  set value(v: string) {
    this._value = v;
    this.paint();
  }
  set disabled(d: boolean) {
    this.toggleAttribute('disabled', d);
    this.paint();
  }
  get disabled() {
    return this.hasAttribute('disabled');
  }

  setOptions(opts: SegOption[], value: string, label: string) {
    this.opts = opts;
    this._value = value;
    this.setAttribute('role', 'radiogroup');
    this.setAttribute('aria-label', label);
    this.replaceChildren();
    this.buttons = opts.map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.textContent = o.label;
      if (o.title) {
        b.title = o.title;
        b.setAttribute('aria-label', o.title);
      }
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('keydown', (e) => this.key(e, i));
      return b;
    });
    this.append(...this.buttons);
    this.paint();
    return this;
  }

  private pick(i: number, focus = false) {
    if (this.disabled) return;
    const v = this.opts[i]!.value;
    if (focus) this.buttons[i]!.focus();
    if (v === this._value) return;
    this._value = v;
    this.paint();
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private key(e: KeyboardEvent, i: number) {
    const n = this.opts.length;
    const to =
      e.key == 'ArrowRight' || e.key == 'ArrowDown'
        ? (i + 1) % n
        : e.key == 'ArrowLeft' || e.key == 'ArrowUp'
          ? (i - 1 + n) % n
          : e.key == 'Home'
            ? 0
            : e.key == 'End'
              ? n - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    this.pick(to, true);
  }

  private paint() {
    const sel = Math.max(
      0,
      this.opts.findIndex((o) => o.value === this._value),
    );
    this.buttons.forEach((b, i) => {
      const on = this.opts[i]!.value === this._value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = !this.disabled && i == sel ? 0 : -1;
      b.disabled = this.disabled;
    });
  }
}

if (!customElements.get('sd-segmented')) customElements.define('sd-segmented', SdSegmented);

declare global {
  interface HTMLElementTagNameMap {
    'sd-segmented': SdSegmented;
  }
}

export function segmented(label: string, opts: SegOption[], value: string): SdSegmented {
  return document.createElement('sd-segmented').setOptions(opts, value, label);
}
