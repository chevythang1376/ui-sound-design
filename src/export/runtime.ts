/**
 * The prebuilt runtime strings (esbuild-minified src/engine, from scripts/build-runtime.mjs),
 * imported via Vite ?raw. This is the only place the editor touches generated/.
 */
import esm from '../../generated/runtime.esm.min.js?raw';
import iife from '../../generated/runtime.iife.min.js?raw';
import meta from '../../generated/runtime.meta.json';
import type { Runtime } from './build-kit';

export const RUNTIME: Runtime = { esm: esm.trim(), iife: iife.trim() };

/** sha256 of the src/engine sources the runtime was built from. */
export const ENGINE_HASH: string = meta.engineHash;
