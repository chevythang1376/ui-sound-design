# UI Sound Designer — rules for every session

Browser tool that synthesizes UI sounds live with the Web Audio API, previews them on real
components, and exports a tiny self-contained JS sound kit with zero audio files.
Sound is treated like a design token: one kit, one character, semantic names.

## The architectural rule

**The editor and the exported kit run the exact same synth engine (`src/engine/`).**
What you hear while designing is exactly what ships. Never fork, copy, or reimplement the
engine for export. The exporter inlines the esbuild-minified build of `src/engine`
(`generated/runtime.*.min.js`, imported via `?raw`); it never bundles at runtime.

## Non-negotiable rules

1. **One engine.** Editor imports `src/engine`; exporter inlines the minified build of the
   same `src/engine`. A test verifies both come from the same source.
2. **One shared AudioContext**, created lazily inside the first user gesture and resumed on
   later gestures. Never create a context at import time.
3. **Short-lived nodes.** Every play builds fresh oscillator/filter/gain nodes, schedules
   them, stops them, disconnects them on `ended`. No node pooling.
4. **Voice cap** (default 8 concurrent plays). Over the cap, steal the oldest with a ~5 ms
   fade — never a hard cut.
5. **Hover sounds are off by default** and rate-limited (≤ 1 per ~80 ms) when turned on.
6. **Sound never carries meaning on its own.** Every stage component is fully usable and
   understandable muted.
7. **A visible mute control ships with every kit**; the kit respects OS/site quiet
   preferences (`soundkit:muted`, `<html data-sound="off">`, `window.SOUNDKIT_OFF`,
   `prefers-reduced-motion`).
8. **No audio files anywhere.** No samples, no base64 audio, no fetches. All synthesized.
9. **Quiet defaults.** Master volume defaults to ~0.5; every preset peaks well below clipping.
10. **Size budget**, enforced by `scripts/check-size.mjs` (`npm run size`) and a test:
    engine runtime ≤ 4 KB min / ≤ 2 KB gzip; engine + 8-sound default kit ≤ 6 KB min.
    If a budget fails, report which part grew. Never raise a budget without asking.
11. **UI sounds are short.** Most finish well under 500 ms; the editor warns above 500 ms.

## Boundaries (enforced by ESLint `no-restricted-imports`)

- Nothing in `src/engine/` imports from outside `src/engine/`. Zero runtime dependencies.
- The editor plays sound only through `src/engine/index.ts` (`createKit`). It may also import
  the pure, sound-free modules `types.ts`, `notes.ts`, `schema.ts`.
- Theme transforms (global pitch / volume) are applied at play time, never baked into recipes.
- `fx` is preserved on load/save but ignored by v1 playback. Unknown future fields and wave
  types are preserved; unknown waves are warned about and skipped during playback.

## Working agreements

- Stack: Vite + strict TypeScript, no UI framework (plain TS + small custom elements),
  esbuild, Vitest, Playwright (Chromium + WebKit), ESLint + Prettier.
- Approved dev deps only: vite, typescript, esbuild, vitest, @playwright/test, eslint,
  prettier and their standard TS plugins. **No runtime deps.** Ask before adding anything.
- Build only v1 scope. "Later" items are not built, but the data model must not block them.
- Sound-design values are judgment calls: keep them in one obvious place
  (`src/presets/default-kit.ts`, `src/engine/types.ts` DEFAULTS) and move on.
- After each milestone: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`,
  fix failures, commit with a clear message.
- No external fonts or CDNs; system font stacks. WCAG AA contrast; respect reduced motion.
