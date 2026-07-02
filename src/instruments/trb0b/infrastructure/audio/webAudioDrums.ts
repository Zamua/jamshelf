import type { DrumVoice } from '../../domain/sequencer';
import type { DrumMachinePort } from '../../application/ports';

// The TR-B0B drum engine: each voice is a one-shot SYNTHESIZED hit (no samples), modelled on the
// 808's analog voices. Everything routes master -> limiter -> destination so stacked hits never
// hard-clip. The AudioContext is built lazily on the first gesture.

export class WebAudioDrums implements DrumMachinePort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.85;
  private muted = false;
  private levels: Partial<Record<DrumVoice, number>> = {}; // per-voice level (1 if unset)

  resume(): void {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* unlock is best-effort */
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  trigger(voice: DrumVoice, accent = false): void {
    if (!this.ctx) this.build();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const gain = (accent ? 1.3 : 1) * (this.levels[voice] ?? 1);
    switch (voice) {
      case 'BD': this.kick(t, gain); break;
      case 'SD': this.snare(t, gain); break;
      case 'LT': this.tom(t, gain); break;
      case 'CP': this.clap(t, gain); break;
      case 'CH': this.hat(t, 0.05, gain); break;
      case 'OH': this.hat(t, 0.3, gain); break;
      case 'CB': this.cowbell(t, gain); break;
      case 'CY': this.cymbal(t, gain); break;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setLevel(voice: DrumVoice, level: number): void {
    this.levels[voice] = level;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  // --- internals ---
  private build(): void {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;

    // one reusable white-noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    if (typeof document !== 'undefined') {
      const tryResume = () => {
        if (ctx.state !== 'running') void ctx.resume();
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tryResume();
      });
      ctx.addEventListener('statechange', () => {
        if (document.visibilityState === 'visible') tryResume();
      });
      for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(ev, tryResume, { passive: true });
    }
  }

  private env(peak: number, decay: number, t: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.master!);
    return g;
  }

  private noiseSource(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private kick(t: number, g: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const env = this.env(0.9 * g, 0.42, t);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private tom(t: number, g: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    const env = this.env(0.75 * g, 0.32, t);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  private snare(t: number, g: number): void {
    const ctx = this.ctx!;
    // tone body
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, t);
    const tone = this.env(0.4 * g, 0.14, t);
    osc.connect(tone);
    osc.start(t);
    osc.stop(t + 0.16);
    // noise
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const ne = this.env(0.6 * g, 0.2, t);
    n.connect(hp);
    hp.connect(ne);
    n.start(t);
    n.stop(t + 0.22);
  }

  private hat(t: number, decay: number, g: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    const env = this.env(0.4 * g, decay, t);
    n.connect(hp);
    hp.connect(bp);
    bp.connect(env);
    n.start(t);
    n.stop(t + decay + 0.02);
  }

  private clap(t: number, g: number): void {
    const ctx = this.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 1.2;
    // 3 quick bursts + a tail
    for (const [off, dec, pk] of [[0, 0.02, 0.7], [0.01, 0.02, 0.7], [0.02, 0.02, 0.7], [0.03, 0.14, 0.5]] as const) {
      const n = this.noiseSource();
      const env = this.env(pk * g, dec, t + off);
      n.connect(bp);
      bp.connect(env);
      n.start(t + off);
      n.stop(t + off + dec + 0.02);
    }
  }

  private cowbell(t: number, g: number): void {
    const ctx = this.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2640;
    bp.Q.value = 1.5;
    const env = this.env(0.4 * g, 0.28, t);
    bp.connect(env);
    for (const f of [540, 800]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(bp);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  private cymbal(t: number, g: number): void {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const env = this.env(0.3 * g, 0.9, t);
    hp.connect(env);
    // a bank of inharmonic square oscillators (the metallic 808 cymbal)
    for (const f of [523, 673, 784, 924, 1140, 1367]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(hp);
      osc.start(t);
      osc.stop(t + 0.95);
    }
    // plus a noise wash
    const n = this.noiseSource();
    n.connect(hp);
    n.start(t);
    n.stop(t + 0.95);
  }
}
