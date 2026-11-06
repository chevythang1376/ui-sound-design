/**
 * The four export formats shown in the export modal. All of them inline the same runtime string
 * (the minified build of src/engine): no audio files, no fetches, no network requests.
 */
import type { Kit } from '../engine/types';
import { buildEsm, buildIife, safeName, type Runtime } from './build-kit';

export type ExportKind = 'esm' | 'script' | 'cms' | 'html';

export interface ExportFile {
  kind: ExportKind;
  title: string;
  filename: string;
  mime: string;
  code: string;
  /** Short usage notes for the modal. */
  usage: string[];
}

const soundNames = (kit: Kit) => Object.keys(kit.sounds).join(', ');

/** Indent a multi-line string (for readable HTML). */
const indent = (s: string, n: number) => s.replace(/^(?=.)/gm, ' '.repeat(n));

export function esModule(runtime: Runtime, kit: Kit): ExportFile {
  return {
    kind: 'esm',
    title: 'ES module',
    filename: 'sound-kit.js',
    mime: 'text/javascript',
    code: buildEsm(runtime, kit),
    usage: [
      "import kit from './sound-kit.js';",
      'kit.bind();            // wires every [data-sound] element',
      "kit.play('success');   // or play by name",
      'kit.mountMuteToggle(document.querySelector("#mute"));',
    ],
  };
}

export function scriptTag(runtime: Runtime, kit: Kit): ExportFile {
  return {
    kind: 'script',
    title: 'Script tag',
    filename: 'sound-kit.iife.js',
    mime: 'text/javascript',
    code: buildIife(runtime, kit),
    usage: [
      '<script src="sound-kit.iife.js"></script>  (or paste the code inside a <script> tag)',
      'Exposes window.SoundKit and auto-binds [data-sound] on DOMContentLoaded.',
      'Any <button data-sound-mute> becomes a mute toggle.',
    ],
  };
}

const MUTE_CSS = `.soundkit-mute{display:inline-flex;align-items:center;gap:.4em;min-height:36px;padding:0 .9em;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:.875rem;cursor:pointer}.soundkit-mute::before{content:"\\1F50A"}.soundkit-mute[aria-pressed="true"]::before{content:"\\1F507"}.soundkit-mute:focus-visible{outline:2px solid currentColor;outline-offset:2px}`;

/**
 * One pasteable HTML block for SmartEdit-style CMS components: usage notes, a styled mute
 * button and an inline script. Idempotent (window.SoundKit guard), no other globals, zero
 * network requests, and a silent no-op where Web Audio is missing.
 */
export function cmsBlock(runtime: Runtime, kit: Kit): ExportFile {
  const name = safeName(kit.name);
  const code = `<!--
  UI Sound Designer — "${name}" sound kit (CMS block)

  Paste this whole block into an HTML / rich-text component. Once per page is enough;
  pasting it twice is safe (only one kit is created, as window.SoundKit).

  Add sounds to any button or link on the page:
    <button data-sound="click">Save</button>
  Sounds in this kit: ${soundNames(kit)}
  Forms: <form data-sound="success"> plays on submit.

  Quiet by design: no audio files and no network requests (everything is synthesized).
  Visitors can mute with the button below; their choice is remembered. The kit stays quiet
  when the OS asks for reduced motion, and never plays on pages with <html data-sound="off">.
-->
<button type="button" class="soundkit-mute" data-sound-mute>Mute sounds</button>
<style>${MUTE_CSS}</style>
<script>
${buildIife(runtime, kit).trim()}
</script>
`;
  return {
    kind: 'cms',
    title: 'CMS block',
    filename: 'sound-kit-cms-block.html',
    mime: 'text/html',
    code,
    usage: [
      'Paste the whole block into one HTML component (SmartEdit, AEM, WordPress, Webflow embed…).',
      'Then add data-sound="click" (etc.) to buttons anywhere on the page.',
      'Safe to paste twice; makes no network requests; does nothing if Web Audio is missing.',
    ],
  };
}

export function plainHtml(runtime: Runtime, kit: Kit): ExportFile {
  const name = safeName(kit.name);
  const buttons = Object.keys(kit.sounds)
    .filter((id) => id != 'hover')
    .map((id) => `<button type="button" data-sound="${id}">${id}</button>`)
    .join('\n');
  const code = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name} — sound kit example</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
      .row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
      button { font: inherit; min-height: 40px; padding: 0 1rem; border-radius: 8px; border: 1px solid #888; background: #fff; cursor: pointer; }
      ${MUTE_CSS}
    </style>
  </head>
  <body>
    <h1>${name}</h1>
    <p>Each button has a <code>data-sound</code> attribute. The kit wires them up automatically.</p>
    <div class="row">
${indent(buttons, 6)}
    </div>
    <p><button type="button" class="soundkit-mute" data-sound-mute>Mute sounds</button></p>
    <script>
${indent(buildIife(runtime, kit).trim(), 6)}
    </script>
  </body>
</html>
`;
  return {
    kind: 'html',
    title: 'Plain HTML',
    filename: 'sound-kit-example.html',
    mime: 'text/html',
    code,
    usage: ['A complete page showing data-sound usage. Open it in any browser, no server needed.'],
  };
}

export function allExports(runtime: Runtime, kit: Kit): ExportFile[] {
  return [
    esModule(runtime, kit),
    scriptTag(runtime, kit),
    cmsBlock(runtime, kit),
    plainHtml(runtime, kit),
  ];
}
