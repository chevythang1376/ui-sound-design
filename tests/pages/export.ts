/**
 * Export test harness: the editor's engine, the exporter and the prebuilt runtime in one page,
 * so Playwright can compare the editor's engine against an exported kit loaded from a blob URL.
 */
import { createKit, type Kit } from '../../src/engine/index';
import { kitJson } from '../../src/export/build-kit';
import { RUNTIME } from '../../src/export/runtime';
import { allExports } from '../../src/export/snippets';
import { DEFAULT_KIT } from '../../src/presets/default-kit';
import { renderSound } from './lib';

/** Import an ES module from source text via a blob URL. */
async function importCode(
  code: string,
): Promise<{ default: ReturnType<typeof createKit>; createKit: typeof createKit }> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const exportHarness = {
  createKit,
  DEFAULT_KIT,
  RUNTIME,
  renderSound,
  importCode,
  exports: (kit: Kit = DEFAULT_KIT) => allExports(RUNTIME, kit),
  /** The kit exactly as the export ships it (defaults stripped). */
  shippedKit: (kit: Kit = DEFAULT_KIT): Kit => JSON.parse(kitJson(kit)),
};
export type ExportHarness = typeof exportHarness;
(window as unknown as { exportHarness: ExportHarness }).exportHarness = exportHarness;
