/**
 * Export modal (ES module, Script tag, CMS block, Plain HTML) with copy / download and the
 * minified + gzip size of the current export; plus the share-link dialog and the kit JSON
 * import / export dialog.
 */
import { validateKit } from '../../engine/schema';
import type { Kit } from '../../engine/types';
import { byteLength, gzipSize, kitJson } from '../../export/build-kit';
import { RUNTIME } from '../../export/runtime';
import { allExports, type ExportFile } from '../../export/snippets';
import { shareUrl } from '../share';
import { h, id } from '../ui/dom';

const kb = (n: number) => `${(n / 1024).toFixed(2)} KB`;

/** A modal <dialog> with a title, body and footer; resolves when closed. */
export function modal(title: string, body: Node[], footer: Node[] = [], wide = false) {
  const titleId = id('modal-title');
  const close = h(
    'button',
    { type: 'button', class: 'btn icon modal-close', 'aria-label': 'Close' },
    h('span', { 'aria-hidden': 'true' }, '×'),
  );
  const dlg = h(
    'dialog',
    { class: wide ? 'dialog modal wide' : 'dialog modal', 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', { id: titleId, class: 'dialog-title' }, title),
      close,
    ),
    h('div', { class: 'modal-body' }, ...body),
    footer.length ? h('div', { class: 'dialog-actions' }, ...footer) : null,
  );
  const done = new Promise<void>((resolve) =>
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve();
    }),
  );
  close.addEventListener('click', () => dlg.close());
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, done, close: () => dlg.close() };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy button that confirms in place. */
const copyButton = (getText: () => string, label = 'Copy') => {
  const b = h('button', { type: 'button', class: 'btn' }, label);
  b.addEventListener('click', async () => {
    const ok = await copyText(getText());
    b.textContent = ok ? 'Copied ✓' : 'Select and copy manually';
    setTimeout(() => (b.textContent = label), 1600);
  });
  return b;
};

export function openExportModal(kit: Kit, say: (msg: string) => void): Promise<void> {
  const files = allExports(RUNTIME, kit);
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  const runtimeBytes = byteLength(RUNTIME.iife);
  const jsonBytes = byteLength(kitJson(kit));

  const panelFor = (f: ExportFile, i: number, tabId: string) => {
    const size = h(
      'p',
      { class: 'size mono', 'aria-live': 'polite' },
      `${kb(byteLength(f.code))} minified · gzip …`,
    );
    void gzipSize(f.code).then((g) => {
      size.textContent = `${kb(byteLength(f.code))} minified · ${kb(g)} gzip`;
    });
    const code = h('textarea', {
      class: 'code mono',
      readonly: true,
      spellcheck: 'false',
      rows: 12,
      'aria-label': `${f.title} code`,
    });
    code.value = f.code;
    return h(
      'section',
      {
        role: 'tabpanel',
        id: `export-panel-${i}`,
        'aria-labelledby': tabId,
        hidden: i > 0,
        class: 'export-panel',
      },
      h('ul', { class: 'usage' }, ...f.usage.map((u) => h('li', null, h('code', null, u)))),
      h(
        'div',
        { class: 'export-actions' },
        size,
        h('span', { class: 'spacer' }),
        copyButton(() => f.code),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-accent',
            onclick: () => {
              download(f.filename, f.code, f.mime);
              say(`Downloaded ${f.filename}`);
            },
          },
          `Download ${f.filename}`,
        ),
      ),
      code,
    );
  };

  const select = (i: number, focus = false) => {
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(i == j));
      t.tabIndex = i == j ? 0 : -1;
      panels[j]!.hidden = i != j;
    });
    if (focus) tabs[i]!.focus();
  };

  files.forEach((f, i) => {
    const tabId = `export-tab-${i}`;
    const t = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: tabId,
        'aria-controls': `export-panel-${i}`,
        class: 'tab',
      },
      f.title,
    );
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      const n = files.length;
      const to =
        e.key == 'ArrowRight'
          ? (i + 1) % n
          : e.key == 'ArrowLeft'
            ? (i - 1 + n) % n
            : e.key == 'Home'
              ? 0
              : e.key == 'End'
                ? n - 1
                : -1;
      if (to >= 0) {
        e.preventDefault();
        select(to, true);
      }
    });
    tabs.push(t);
    panels.push(panelFor(f, i, tabId));
  });

  const m = modal(
    'Export sound kit',
    [
      h(
        'p',
        { class: 'hint' },
        `Engine runtime ${kb(runtimeBytes)} + kit data ${kb(jsonBytes)}. One self-contained file: no audio files, no network requests. It runs the exact engine you are hearing in the editor.`,
      ),
      h('div', { role: 'tablist', 'aria-label': 'Export format', class: 'tabs' }, ...tabs),
      ...panels,
    ],
    [],
    true,
  );
  select(0);
  tabs[0]!.focus();
  return m.done;
}

export async function openShareDialog(kit: Kit, say: (msg: string) => void): Promise<void> {
  const url = await shareUrl(kit, location.href);
  const input = h('input', { class: 'share-url mono', readonly: true, 'aria-label': 'Share link' });
  input.value = url;
  const copied = await copyText(url);
  const m = modal(
    'Share link',
    [
      h(
        'p',
        null,
        copied ? 'Link copied to your clipboard.' : 'Copy this link:',
        ' The whole kit lives in the link itself; nothing is uploaded.',
      ),
      input,
      h('p', { class: 'hint' }, `${url.length.toLocaleString()} characters`),
    ],
    [copyButton(() => url, 'Copy link')],
  );
  input.focus();
  input.select();
  if (copied) say('Share link copied');
  return m.done;
}

export function openJsonDialog(
  kit: Kit,
  load: (k: Kit, notes: string[]) => void,
  say: (msg: string) => void,
): Promise<void> {
  const text = h('textarea', {
    class: 'code mono',
    rows: 16,
    spellcheck: 'false',
    'aria-label': 'Kit JSON',
    'aria-describedby': 'json-issues',
  });
  text.value = JSON.stringify(kit, null, 2);
  const issues = h('div', { id: 'json-issues', class: 'issues', role: 'alert' });
  const file = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'visually-hidden',
    'aria-label': 'Open a kit JSON file',
  });
  const openBtn = h(
    'button',
    { type: 'button', class: 'btn', onclick: () => file.click() },
    'Open file…',
  );

  const tryLoad = () => {
    issues.replaceChildren();
    let data: unknown;
    try {
      data = JSON.parse(text.value);
    } catch (e) {
      issues.append(h('p', { class: 'issue error' }, `Not valid JSON: ${(e as Error).message}`));
      return;
    }
    const v = validateKit(data);
    if (!v.ok || !v.kit || !Object.keys(v.kit.sounds).length) {
      for (const er of v.errors.length ? v.errors : ['The kit has no sounds.'])
        issues.append(h('p', { class: 'issue error' }, er));
      return;
    }
    load(v.kit, [...v.errors, ...v.warnings]);
    m.close();
  };

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    text.value = await f.text();
    tryLoad();
  });

  const m = modal(
    'Kit JSON',
    [
      h(
        'p',
        { class: 'hint' },
        'The full kit, including fields v1 does not play yet (fx). Paste a kit here or open a .json file to load it; it is validated first and the load can be undone.',
      ),
      text,
      issues,
      file,
    ],
    [
      openBtn,
      copyButton(() => text.value),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () => {
            download(
              `${(kit.name || 'kit').replace(/[^\w-]+/g, '-').toLowerCase()}.json`,
              text.value,
              'application/json',
            );
            say('Kit JSON downloaded');
          },
        },
        'Download .json',
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn-accent', onclick: tryLoad },
        'Load into editor',
      ),
    ],
    true,
  );
  return m.done;
}
