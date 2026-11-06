/** Run `f`, returning `d` if it throws (privacy modes, missing DOM, missing Web Audio). */
export const safe = <T>(f: () => T, d?: T): T | undefined => {
  try {
    return f();
  } catch {
    return d;
  }
};

export const noop = () => {};
