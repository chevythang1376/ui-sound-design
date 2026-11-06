/**
 * One engine: the runtime the exporter inlines (generated/, imported via ?raw) must be exactly
 * the esbuild build of the current src/engine, the same source the editor imports.
 */
import { describe, expect, it } from 'vitest';
import { buildRuntime, engineHash } from '../../scripts/build-runtime.mjs';
import { ENGINE_HASH, RUNTIME } from '../../src/export/runtime';

describe('same engine in editor and export', () => {
  it('the inlined runtime is a fresh build of src/engine', async () => {
    const fresh = await buildRuntime();
    expect(RUNTIME.esm).toBe(fresh.esm);
    expect(RUNTIME.iife).toBe(fresh.iife);
  });

  it('the runtime was built from the current engine sources', async () => {
    expect(ENGINE_HASH).toBe(await engineHash());
  });

  it('the editor imports its engine from src/engine/index.ts', async () => {
    const main = (await import('../../src/editor/main.ts?raw')).default;
    expect(main).toMatch(/from '\.\.\/engine\/index'/);
  });
});
