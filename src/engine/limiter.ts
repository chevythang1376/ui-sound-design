/** Minimum time between two plays of the same sound. */
export const RETRIGGER_MS = 25;
/** At most one hover sound per this many ms. */
export const HOVER_MS = 80;

/** A playing voice: when it ends (ms, same clock as `t`) and how to steal it. */
export interface Held {
  e: number;
  k: () => void;
}

/**
 * Pure limiter logic, driven by the caller's clock so it can be tested with a fake one.
 * - per-sound minimum retrigger interval
 * - hover gate: only when hover is enabled, at most one per HOVER_MS
 * - global voice cap: the oldest voice is stolen (faded, see render.ts) first
 */
export const createLimiter = () => {
  const last: Record<string, number> = {};
  let hover = -1e9;
  let active: Held[] = [];
  return {
    ok(name: string, t: number, isHover?: boolean, hoverOn?: boolean): boolean {
      if (
        (isHover && (!hoverOn || t - hover < HOVER_MS)) ||
        t - (last[name] ?? -1e9) < RETRIGGER_MS
      )
        return false;
      if (isHover) hover = t;
      last[name] = t;
      return true;
    },
    add(v: Held, t: number, cap: number): void {
      active = active.filter((a) => a.e > t);
      while (active.length >= cap) active.shift()!.k();
      active.push(v);
    },
    /** Steal everything (mute / destroy). Returns how many voices were stolen. */
    clear(): number {
      active.forEach((a) => a.k());
      return active.splice(0).length;
    },
  };
};
