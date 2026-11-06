export type Player = (name: string, opts?: undefined, hover?: boolean) => void;

const EVENTS = ['click', 'submit', 'pointerover'];

/**
 * Delegated auto-wiring with one listener. The sound name is read from `data-sound` when the
 * event reaches `root` (after the component's own handlers ran), so a toggle can set
 * data-sound="toggleOn" / "toggleOff" in its click handler and a form can set "success" /
 * "error" in its submit handler.
 *
 * - click on (or inside) a matching non-form element -> its data-sound
 * - submit of a matching <form>                      -> the form's data-sound
 * - pointer entering a matching element (not touch)  -> "hover" (gated by options.hover)
 */
export const bind = (
  play: Player,
  selector = '[data-sound]',
  root: ParentNode & EventTarget = document,
): (() => void) => {
  let over: Element | null | undefined;
  const handle = (e: Event) => {
    const el = (e.target as Element).closest?.(selector);
    if (e.type == 'pointerover') {
      if (el != over && (over = el) && (e as PointerEvent).pointerType != 'touch')
        play('hover', undefined, true);
    } else if (el && (e.type == 'submit') == (el.tagName == 'FORM')) {
      play(el.getAttribute('data-sound')!);
    }
  };
  const each = (m: 'addEventListener' | 'removeEventListener') =>
    EVENTS.forEach((t) => root[m](t, handle));
  each('addEventListener');
  return () => each('removeEventListener');
};
