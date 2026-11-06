// Size budget for the shipped code (run: npm run size). Fails (exit 1) when over budget and
// reports which part grew, against scripts/size-baseline.json when present.
//
//   Engine runtime:                   <= 5 KB minified, <= 2.75 KB gzipped
//   Engine + the 8-sound default kit: <= 7 KB minified
//
// The brief started at 4 KB / 2 KB / 6 KB; the full v1 engine measured 4.83 / 2.52 / 6.54 KB
// after two compaction passes, and the user agreed to 5 / 2.75 / 7 KB on 2026-11-06.
// Never raise a budget silently: change BUDGET only with the user's agreement (CLAUDE.md).
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildRuntime } from './build-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(root, 'scripts/size-baseline.json');

/** Bytes. 1 KB = 1024 bytes. */
export const BUDGET = {
  runtimeMin: 5 * 1024,
  runtimeGzip: 2.75 * 1024,
  kitMin: 7 * 1024,
};

const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
const bytes = (s) => Buffer.byteLength(s);

/** Load the exporter and the default kit (TypeScript) exactly as the editor uses them. */
async function loadExporter() {
  const out = await build({
    stdin: {
      contents:
        "export { buildEsm, buildIife, kitJson } from './src/export/build-kit.ts';" +
        "export { DEFAULT_KIT } from './src/presets/default-kit.ts';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const b64 = Buffer.from(out.outputFiles[0].text).toString('base64');
  return import(`data:text/javascript;base64,${b64}`);
}

/** Per-module bytes of the minified engine (which part grew). */
async function engineParts() {
  const r = await build({
    entryPoints: [join(root, 'src/engine/index.ts')],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    metafile: true,
  });
  const inputs = Object.values(r.metafile.outputs)[0].inputs;
  return Object.fromEntries(
    Object.entries(inputs).map(([k, v]) => [
      relative(root, resolve(root, k)).replace(/\\/g, '/'),
      v.bytesInOutput,
    ]),
  );
}

export async function measure() {
  const runtime = await buildRuntime();
  const ex = await loadExporter();
  const esmKit = ex.buildEsm(runtime, ex.DEFAULT_KIT);
  const iifeKit = ex.buildIife(runtime, ex.DEFAULT_KIT);
  return {
    runtime: {
      esmMin: bytes(runtime.esm),
      esmGzip: gz(runtime.esm),
      iifeMin: bytes(runtime.iife),
      iifeGzip: gz(runtime.iife),
    },
    kit: {
      json: bytes(ex.kitJson(ex.DEFAULT_KIT)),
      esmMin: bytes(esmKit),
      iifeMin: bytes(iifeKit),
      esmGzip: gz(esmKit),
    },
    parts: await engineParts(),
  };
}

/** Budget checks: [label, actual, limit]. */
export function checks(m) {
  return [
    ['Engine runtime (ESM), minified', m.runtime.esmMin, BUDGET.runtimeMin],
    ['Engine runtime (IIFE), minified', m.runtime.iifeMin, BUDGET.runtimeMin],
    ['Engine runtime (ESM), gzipped', m.runtime.esmGzip, BUDGET.runtimeGzip],
    ['Engine runtime (IIFE), gzipped', m.runtime.iifeGzip, BUDGET.runtimeGzip],
    ['Engine + default kit (sound-kit.js), minified', m.kit.esmMin, BUDGET.kitMin],
    ['Engine + default kit (script tag), minified', m.kit.iifeMin, BUDGET.kitMin],
  ];
}

const kb = (n) => `${(n / 1024).toFixed(2)} KB`.padStart(9);
const delta = (now, was) =>
  was == null ? '' : now === was ? '  (=)' : `  (${now > was ? '+' : ''}${now - was} B)`;

async function main() {
  const m = await measure();
  let base = null;
  try {
    base = JSON.parse(await readFile(BASELINE, 'utf8'));
  } catch {}
  const rows = checks(m);
  let failed = false;
  console.log('\nSize budget (1 KB = 1024 B)\n');
  for (const [label, n, limit] of rows) {
    const ok = n <= limit;
    failed ||= !ok;
    console.log(
      `  ${ok ? 'ok  ' : 'OVER'} ${label.padEnd(48)} ${kb(n)} / ${kb(limit)}${ok ? '' : `  over by ${n - limit} B`}`,
    );
  }
  console.log(
    `\n  Kit JSON (defaults stripped): ${m.kit.json} B${delta(m.kit.json, base?.kit?.json)}`,
  );
  console.log('\n  Engine runtime by module (minified bytes):');
  for (const [file, n] of Object.entries(m.parts).sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(5)}  ${file}${delta(n, base?.parts?.[file])}`);
  if (process.argv.includes('--save-baseline')) {
    await writeFile(BASELINE, JSON.stringify(m, null, 2) + '\n');
    console.log('\n  Baseline saved to scripts/size-baseline.json');
  }
  if (failed) {
    console.error(
      '\nSize budget exceeded. The deltas above show which part grew since the baseline.',
    );
    console.error('Do not raise the budget without agreement (see CLAUDE.md).\n');
    process.exit(1);
  }
  console.log('\nWithin budget.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
