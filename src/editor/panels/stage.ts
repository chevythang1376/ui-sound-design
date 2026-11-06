/**
 * Live component stage, wired to the current kit through the same kit.bind() API that ships.
 *
 * Every component is fully usable and understandable muted (sound never carries meaning on its
 * own): each sound mirrors a visible state change. Components set `data-sound` in their own
 * handlers, before bind() reads it at the stage root:
 *   toggle -> toggleOn / toggleOff, form -> success / error, disclosure -> open / close.
 */
import type { SoundKit } from '../../engine/index';
import type { Store } from '../store';
import { h, id, switchControl } from '../ui/dom';
import { segmented } from '../ui/segmented';

const TOAST_MS = 4000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function stagePanel(store: Store, kit: SoundKit) {
  const demo = h('div', { class: 'stage-demo' });
  let unbind: (() => void) | null = null;
  const setSound = (on: boolean) => {
    unbind?.();
    unbind = on ? kit.bind('[data-sound]', demo) : null;
    demo.dataset.silent = String(!on);
  };

  // --- Silent / With sound A/B ---
  const ab = segmented(
    'Stage sound',
    [
      { value: 'silent', label: 'Silent' },
      { value: 'sound', label: 'With sound' },
    ],
    'sound',
  );
  ab.addEventListener('change', () => setSound(ab.value == 'sound'));

  // --- Hover sounds (kit option, exported) ---
  const hover = switchControl('Hover sounds', !!store.kit.options?.hover, (on) =>
    store.edit(null, (k) => (k.options = { ...k.options, hover: on }), false),
  );

  // --- Buttons ---
  const buttons = h(
    'div',
    { class: 'demo-row' },
    h('button', { type: 'button', class: 'ui-btn primary', 'data-sound': 'click' }, 'Save changes'),
    h('button', { type: 'button', class: 'ui-btn secondary', 'data-sound': 'click' }, 'Cancel'),
  );

  // --- Toggle switch ---
  const toggleState = h('span', { class: 'ui-toggle-state', 'aria-hidden': 'true' }, 'Off');
  const toggle = h(
    'button',
    {
      type: 'button',
      role: 'switch',
      class: 'ui-switch',
      'aria-checked': 'false',
      'aria-labelledby': 'stage-toggle-label',
      'data-sound': 'toggleOn',
    },
    h('span', { class: 'ui-switch-thumb', 'aria-hidden': 'true' }),
  );
  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-checked') != 'true';
    toggle.setAttribute('aria-checked', String(on));
    toggle.dataset.sound = on ? 'toggleOn' : 'toggleOff';
    toggleState.textContent = on ? 'On' : 'Off';
  });
  const toggleRow = h(
    'div',
    { class: 'demo-row between' },
    h('span', { id: 'stage-toggle-label' }, 'Email notifications'),
    h('span', { class: 'demo-row tight' }, toggleState, toggle),
  );

  // --- Toast ---
  const toasts = h('div', { class: 'ui-toasts', role: 'status', 'aria-live': 'polite' });
  let toastCount = 0;
  const showToast = () => {
    const n = ++toastCount;
    const close = h(
      'button',
      { type: 'button', class: 'ui-toast-close', 'aria-label': 'Dismiss notification' },
      '×',
    );
    const t = h(
      'div',
      { class: 'ui-toast' },
      h('span', { class: 'ui-toast-dot', 'aria-hidden': 'true' }),
      h('span', null, h('strong', null, 'New message'), ` · Ana replied to your comment (#${n})`),
      close,
    );
    const remove = () => t.remove();
    close.addEventListener('click', remove);
    setTimeout(remove, TOAST_MS);
    toasts.append(t);
  };
  const toastBtn = h(
    'button',
    { type: 'button', class: 'ui-btn secondary', 'data-sound': 'notification', onclick: showToast },
    'Show notification',
  );

  // --- Validated form ---
  const errId = id('email-error');
  const email = h('input', {
    type: 'email',
    class: 'ui-input',
    id: 'stage-email',
    name: 'email',
    autocomplete: 'off',
    placeholder: 'you@example.com',
    'aria-describedby': errId,
  });
  const err = h('p', { class: 'ui-error', id: errId, hidden: true });
  const ok = h('p', { class: 'ui-success', role: 'status', hidden: true });
  const form = h(
    'form',
    { class: 'ui-form', novalidate: true, 'data-sound': 'error', 'aria-label': 'Subscribe' },
    h('label', { for: 'stage-email', class: 'ui-label' }, 'Email address'),
    h(
      'div',
      { class: 'demo-row tight' },
      email,
      h('button', { type: 'submit', class: 'ui-btn primary' }, 'Subscribe'),
    ),
    err,
    ok,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = email.value.trim();
    const problem = !v
      ? 'Enter your email address.'
      : !EMAIL.test(v)
        ? 'That email address looks incomplete.'
        : '';
    form.dataset.sound = problem ? 'error' : 'success';
    email.setAttribute('aria-invalid', String(!!problem));
    err.hidden = !problem;
    err.textContent = problem ? `⚠ ${problem}` : '';
    ok.hidden = !!problem;
    ok.textContent = problem ? '' : `✓ Subscribed ${v}. Check your inbox.`;
    if (problem) email.focus();
  });
  email.addEventListener('input', () => {
    if (!err.hidden) {
      err.hidden = true;
      email.removeAttribute('aria-invalid');
    }
    ok.hidden = true;
  });

  // --- Disclosure / accordion ---
  const panelId = id('disclosure');
  const discBtn = h(
    'button',
    {
      type: 'button',
      class: 'ui-disclosure',
      'aria-expanded': 'false',
      'aria-controls': panelId,
      'data-sound': 'open',
    },
    h('span', { class: 'ui-chevron', 'aria-hidden': 'true' }, '▸'),
    'Shipping details',
  );
  const discPanel = h(
    'div',
    { class: 'ui-disclosure-panel', id: panelId, hidden: true },
    h('p', null, 'Free delivery in 2–4 days. Returns within 30 days, no questions asked.'),
  );
  discBtn.addEventListener('click', () => {
    const open = discBtn.getAttribute('aria-expanded') != 'true';
    discBtn.setAttribute('aria-expanded', String(open));
    // bind() reads data-sound after this handler: name what just happened.
    discBtn.dataset.sound = open ? 'open' : 'close';
    discPanel.hidden = !open;
  });

  const card = (title: string, ...body: Node[]) =>
    h(
      'section',
      { class: 'demo-card', 'aria-label': title },
      h('h3', { class: 'demo-title' }, title),
      ...body,
    );

  demo.append(
    card('Buttons', buttons),
    card('Toggle', toggleRow),
    card('Notification', h('div', { class: 'demo-row' }, toastBtn), toasts),
    card('Form', form),
    card('Disclosure', discBtn, discPanel),
  );

  const el = h(
    'aside',
    { class: 'stage', 'aria-label': 'Component stage' },
    h('h2', { class: 'col-title' }, 'Stage'),
    h(
      'p',
      { class: 'hint' },
      'Real components wired with kit.bind(), the same API that ships. Every state is visible without sound.',
    ),
    h('div', { class: 'stage-controls' }, ab, hover.root),
    h('p', { class: 'hint' }, 'Hover sounds are off by default and exported with the kit.'),
    demo,
  );

  setSound(true);

  return {
    el,
    update() {
      hover.input.checked = !!store.kit.options?.hover;
    },
  };
}
