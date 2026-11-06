/** Promise-based confirm dialog built on <dialog> (focus trap + Escape for free). */
import { h } from './dom';

export function confirmDialog(opts: {
  title: string;
  body: string | Node;
  ok: string;
  cancel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const okBtn = h(
      'button',
      { type: 'button', class: opts.danger ? 'btn btn-danger' : 'btn btn-accent', value: 'ok' },
      opts.ok,
    );
    const cancelBtn = h(
      'button',
      { type: 'button', class: 'btn', value: 'cancel' },
      opts.cancel ?? 'Cancel',
    );
    const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
    const dlg = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': titleId },
      h('h2', { id: titleId, class: 'dialog-title' }, opts.title),
      typeof opts.body == 'string' ? h('p', null, opts.body) : opts.body,
      h('div', { class: 'dialog-actions' }, cancelBtn, okBtn),
    );
    const done = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    okBtn.addEventListener('click', () => done(true));
    cancelBtn.addEventListener('click', () => done(false));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dlg);
    dlg.showModal();
    cancelBtn.focus();
  });
}

/** A polite live region for status messages. */
export function statusRegion() {
  const el = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  let t = 0;
  return {
    el,
    say(msg: string, ms = 5000) {
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(t);
      t = window.setTimeout(() => el.classList.remove('show'), ms);
    },
  };
}
