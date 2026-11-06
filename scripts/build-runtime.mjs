// Builds src/engine with esbuild into two minified strings — an ES module and an IIFE
// expression — written to generated/ and imported by the editor via Vite `?raw`.
// The exporter only concatenates these strings with kit JSON; it never bundles at runtime.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(root, 'src/engine');
const outDir = join(root, 'generated');

/** Placeholder call in the IIFE entry; replaced by `return(` so the IIFE evaluates to createKit. */
const RETURN_MARK = '__SOUNDKIT_RETURN__';

const common = {
  bundle: true,
  minify: true,
  write: false,
  target: 'es2020',
  platform: 'browser',
  legalComments: 'none',
  charset: 'utf8',
};

/** Hash of every engine source file: proves which source a runtime build came from. */
export async function engineHash() {
  const files = (await readdir(engineDir)).filter((f) => f.endsWith('.ts')).sort();
  const h = createHash('sha256');
  for (const f of files) h.update(f + '\0' + (await readFile(join(engineDir, f), 'utf8')) + '\0');
  return h.digest('hex');
}

/** Returns { esm, iife } minified runtime strings built from src/engine/index.ts. */
export async function buildRuntime() {
  const esm = await build({ ...common, entryPoints: [join(engineDir, 'index.ts')], format: 'esm' });
  const iife = await build({
    ...common,
    format: 'iife',
    stdin: {
      contents: `import { createKit } from './index.ts'; ${RETURN_MARK}(createKit);`,
      resolveDir: engineDir,
      sourcefile: 'iife-entry.ts',
      loader: 'ts',
    },
  });
  const esmCode = esm.outputFiles[0].text.trim();
  let iifeCode = iife.outputFiles[0].text.trim();
  if (iifeCode.split(RETURN_MARK).length !== 2)
    throw new Error('IIFE build: return marker not found exactly once');
  // `(()=>{...;__SOUNDKIT_RETURN__(x)})();` -> `(()=>{...;return(x)})()` : an expression yielding createKit.
  iifeCode = iifeCode.replace(RETURN_MARK + '(', 'return(').replace(/;$/, '');
  if (!/export\s*\{[^}]*\bcreateKit\b[^}]*\}\s*;?$/.test(esmCode)) {
    throw new Error('ESM build: expected a trailing `export{… createKit}` statement');
  }
  return { esm: esmCode, iife: iifeCode };
}

async function main() {
  const { esm, iife } = await buildRuntime();
  const hash = await engineHash();
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'runtime.esm.min.js'), esm + '\n');
  await writeFile(join(outDir, 'runtime.iife.min.js'), iife + '\n');
  await writeFile(
    join(outDir, 'runtime.meta.json'),
    JSON.stringify({ engineHash: hash, esmBytes: esm.length, iifeBytes: iife.length }, null, 2) +
      '\n',
  );
  console.log(`runtime: esm ${esm.length} B, iife ${iife.length} B (engine ${hash.slice(0, 12)})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
