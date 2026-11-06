/**
 * Live ADSR drawing. Mirrors the engine's envelope exactly (src/engine/envelope.ts): linear
 * attack (min 1 ms), exponential decay toward sustain (or 0.0001), then, only when s > 0, a hold
 * at sustain and an exponential release. Each voice is drawn at its own delayMs.
 */
import { FLOOR, LONG_SOUND_MS, envMs, fullEnv, recipeMs } from '../../engine/schema';
import type { Recipe } from '../../engine/types';
import { cssVar, fitCanvas } from '../ui/dom';

/** Envelope level (0..1) at t ms after the trigger. */
export function envAt(r: Recipe, t: number): number {
  const e = fullEnv(r.env);
  const a = Math.max(e.a, 1);
  if (t < 0) return 0;
  if (t < a) return t / a;
  t -= a;
  const s = Math.max(e.s, FLOOR);
  if (t < e.d) return e.d ? s ** (t / e.d) : s;
  if (e.s <= 0) return 0;
  t -= e.d;
  if (t < e.h) return e.s;
  t -= e.h;
  if (t < e.r) return e.s * (FLOOR / e.s) ** (t / e.r);
  return 0;
}

export function drawEnvelope(canvas: HTMLCanvasElement, r: Recipe): void {
  const g = fitCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  const total = recipeMs(r);
  const span = Math.max(total * 1.1, 120);
  const pad = 6;
  const x = (ms: number) => pad + (ms / span) * (w - pad * 2);
  const y = (v: number) => h - pad - v * (h - pad * 2);

  g.clearRect(0, 0, w, h);
  // Grid every 50 / 100 ms.
  const step = span > 600 ? 100 : 50;
  g.lineWidth = 1;
  g.strokeStyle = cssVar('--line', '#2c323b');
  g.fillStyle = cssVar('--text-dim', '#a2aab6');
  g.font = `10px ${cssVar('--mono', 'monospace')}`;
  for (let ms = 0; ms <= span; ms += step) {
    g.beginPath();
    g.moveTo(Math.round(x(ms)) + 0.5, pad);
    g.lineTo(Math.round(x(ms)) + 0.5, h - pad);
    g.stroke();
    if (ms && ms % (step * 2) == 0) g.fillText(`${ms}`, x(ms) + 3, pad + 10);
  }
  // The 500 ms guideline.
  if (span >= LONG_SOUND_MS) {
    g.strokeStyle = cssVar('--danger', '#ff7a7a');
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(x(LONG_SOUND_MS), pad);
    g.lineTo(x(LONG_SOUND_MS), h - pad);
    g.stroke();
    g.setLineDash([]);
  }

  const accent = cssVar('--accent', '#ffb547');
  const len = envMs(fullEnv(r.env));
  r.voices.slice(0, 2).forEach((v, i) => {
    const delay = v.delayMs ?? 0;
    const peak = v.gain ?? 1;
    g.strokeStyle = accent;
    g.globalAlpha = i ? 0.7 : 1;
    g.setLineDash(i ? [5, 4] : []);
    g.lineWidth = 2;
    g.beginPath();
    const n = Math.max(2, Math.round(w));
    for (let k = 0; k <= n; k++) {
      const ms = (k / n) * span;
      const val = ms > delay + len ? 0 : envAt(r, ms - delay) * peak;
      if (k) g.lineTo(x(ms), y(val));
      else g.moveTo(x(ms), y(val));
    }
    g.stroke();
    if (!i) {
      g.globalAlpha = 0.12;
      g.lineTo(x(span), y(0));
      g.lineTo(x(0), y(0));
      g.fillStyle = accent;
      g.fill();
    }
  });
  g.globalAlpha = 1;
  g.setLineDash([]);
}
