import type { PatchName, SynthPort } from '../../application/ports';

// Minimal Web Audio implementation of SynthPort so the app makes sound from the
// start. The audio lane replaces/extends this with the full engine (the six
// patch voices, filter envelopes, generated-impulse reverb, 32-voice cap, and
// strum spread) ported from the single-file prototype. Keep the SynthPort
// surface stable; everything below the port is free to change.
interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
}

export class WebAudioSynth implements SynthPort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private patch: PatchName = 'POLY';
  private strumMs = 8;
  private groups = new Map<string, Voice[]>();

  resume(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  noteOn(voiceId: string, freqs: number[]): void {
    if (!this.ctx || !this.master) return;
    this.noteOff(voiceId);
    const t0 = this.ctx.currentTime + 0.001;
    const spread = this.strumMs / 1000;
    const voices: Voice[] = freqs.map((f, i) => this.makeVoice(f, t0 + i * spread));
    this.groups.set(voiceId, voices);
  }

  noteOff(voiceId: string): void {
    const voices = this.groups.get(voiceId);
    if (!voices || !this.ctx) return;
    this.groups.delete(voiceId);
    const t = this.ctx.currentTime;
    for (const v of voices) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
        v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.3);
        v.oscs.forEach((o) => o.stop(t + 0.34));
      } catch {
        /* already stopped */
      }
    }
  }

  releaseAll(): void {
    for (const id of [...this.groups.keys()]) this.noteOff(id);
  }

  setPatch(patch: PatchName): void {
    this.patch = patch;
  }
  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx && !this.muted)
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }
  setStrumMs(ms: number): void {
    this.strumMs = ms;
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  private makeVoice(freq: number, t0: number): Voice {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.16, t0 + 0.01);
    gain.gain.linearRampToValueAtTime(0.1, t0 + 0.2);
    const osc = ctx.createOscillator();
    osc.type = this.patch === 'ORGAN' || this.patch === 'SQUARE' ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(t0);
    return { oscs: [osc], gain };
  }
}
