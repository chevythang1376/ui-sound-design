/**
 * Editor-only metering (never exported):
 * - a live oscilloscope from an AnalyserNode tapped off the kit's master gain
 * - an offline preview: the selected sound rendered through kit.render() on an
 *   OfflineAudioContext, drawn as a waveform with its peak level in dBFS
 */
import type { SoundKit } from '../../engine/index';
import { cssVar, fitCanvas, h, prefersReducedMotion } from '../ui/dom';

const SR = 44100;

export interface Preview {
  peak: number;
  db: number;
  samples: Float32Array;
}

/** Render one sound offline with the editor's (shared) engine. */
export async function renderPreview(kit: SoundKit, name: string, seconds = 1): Promise<Preview> {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  kit.render(name, ctx);
  const buf = await ctx.startRendering();
  const samples = buf.getChannelData(0);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return { peak, db: peak > 0 ? 20 * Math.log10(peak) : -Infinity, samples };
}

export class Scope {
  readonly el: HTMLElement;
  private live: HTMLCanvasElement;
  private wave: HTMLCanvasElement;
  private meterBar: HTMLDivElement;
  private meterText: HTMLSpanElement;
  private analyser?: AnalyserNode;
  private data?: Float32Array<ArrayBuffer>;
  private raf = 0;
  private until = 0;
  private last?: Preview;

  constructor() {
    this.live = h('canvas', { class: 'scope-live', 'aria-hidden': 'true' });
    this.wave = h('canvas', { class: 'scope-wave', 'aria-hidden': 'true' });
    this.meterBar = h('div', { class: 'meter-fill' });
    this.meterText = h('span', { class: 'meter-text mono' }, '—');
    this.el = h(
      'div',
      { class: 'scope' },
      h(
        'div',
        { class: 'meter', role: 'group', 'aria-label': 'Peak level' },
        h('span', { class: 'meter-label' }, 'Peak'),
        h('div', { class: 'meter-track', 'aria-hidden': 'true' }, this.meterBar),
        this.meterText,
      ),
      h('div', { class: 'scope-canvases' }, this.wave, this.live),
      h(
        'p',
        { class: 'hint' },
        'Waveform (normalized): offline render through the shipping engine. Bright trace: live output.',
      ),
    );
  }

  /** Called by the kit's `tap` option whenever it creates a master gain. */
  attach(master: AudioNode): void {
    const a = master.context.createAnalyser();
    a.fftSize = 2048;
    master.connect(a);
    this.analyser = a;
    this.data = new Float32Array(a.fftSize);
  }

  /** Animate the live scope for `ms` (skipped when the user prefers reduced motion). */
  run(ms: number): void {
    if (!this.analyser || prefersReducedMotion()) return;
    this.until = performance.now() + ms;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame() {
    const g = fitCanvas(this.live);
    const { width: w, height: hh } = this.live.getBoundingClientRect();
    g.clearRect(0, 0, w, hh);
    const a = this.analyser!;
    const d = this.data!;
    a.getFloatTimeDomainData(d);
    g.strokeStyle = cssVar('--text', '#e8eaed');
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < d.length; i++) {
      const xx = (i / (d.length - 1)) * w;
      const yy = hh / 2 - d[i]! * (hh / 2) * 1.8;
      if (i) g.lineTo(xx, yy);
      else g.moveTo(xx, yy);
    }
    g.stroke();
    if (performance.now() < this.until) this.raf = requestAnimationFrame(() => this.frame());
    else {
      this.raf = 0;
      g.clearRect(0, 0, w, hh);
    }
  }

  /** Show an offline preview: waveform + peak meter. */
  show(p: Preview, seconds: number): void {
    this.last = p;
    const db = p.db;
    const pct = Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 48) / 48)) : 0;
    this.meterBar.style.width = `${pct * 100}%`;
    this.meterBar.classList.toggle('hot', db > -3);
    this.meterText.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : 'silent';
    this.drawWave(p, seconds);
  }

  redraw(seconds: number): void {
    if (this.last) this.drawWave(this.last, seconds);
  }

  private drawWave(p: Preview, seconds: number) {
    const g = fitCanvas(this.wave);
    const { width: w, height: hh } = this.wave.getBoundingClientRect();
    g.clearRect(0, 0, w, hh);
    const n = Math.min(p.samples.length, Math.round(seconds * SR));
    const per = Math.max(1, Math.floor(n / w));
    g.fillStyle = cssVar('--accent', '#ffb547');
    g.globalAlpha = 0.85;
    // Normalized to the peak so the shape is readable; the meter shows the true level.
    const gain = 0.9 / Math.max(p.peak, 0.02);
    for (let px = 0; px < w; px++) {
      let lo = 0;
      let hi = 0;
      for (let i = px * per; i < Math.min(n, (px + 1) * per); i++) {
        const s = p.samples[i]!;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
      const y1 = hh / 2 - hi * gain * (hh / 2);
      const y2 = hh / 2 - lo * gain * (hh / 2);
      g.fillRect(px, y1, 1, Math.max(1, y2 - y1));
    }
    g.globalAlpha = 1;
  }
}
