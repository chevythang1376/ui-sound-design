/** The size budget, enforced here and by `npm run size` (scripts/check-size.mjs). */
import { describe, expect, it } from 'vitest';
import { checks, measure } from '../../scripts/check-size.mjs';

describe('size budget', () => {
  it('engine runtime and engine + default kit are within budget', async () => {
    const m = await measure();
    const over = checks(m)
      .filter(([, n, limit]) => n > limit)
      .map(([label, n, limit]) => `${label}: ${n} B > ${limit} B`);
    expect(over, 'Run `npm run size` for the per-module breakdown').toEqual([]);
  }, 30_000);
});
