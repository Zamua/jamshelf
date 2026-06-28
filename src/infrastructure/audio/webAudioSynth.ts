import type { PatchName, SynthPort } from '../../application/ports';

// Full Web Audio implementation of SynthPort. Ported from the single-file
// prototype: six patch voices, dual oscillators with detune + ratio, a per-voice
// lowpass with an optional filter envelope, ADSR VCA, a generated-impulse reverb
// bus (no asset files), a master compressor, a global 32-voice cap with
// oldest-steal, and per-chord strum spread. Everything below the SynthPort
// surface is free to change; the port itself stays stable.

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface Patch {
  osc1: Wave;
  osc2: Wave | null;
  osc2gain: number; // mix level of the second oscillator
  osc2ratio: number; // osc2 frequency multiplier
  detune: number; // cents of spread between the two oscillators
  cutoff: number; // lowpass cutoff (Hz)
  cutoffFloor?: number; // filter-envelope target when filterEnv is on
  filterEnv?: boolean; // ramp cutoff -> cutoffFloor over A+D
  q: number; // lowpass resonance
  A: number; // attack (s)
  D: number; // decay (s)
  S: number; // sustain (0..1, fraction of peak)
  R: number; // release (s)
  wet: number; // reverb send level
}

// The six factory patches. Values mirror the prototype's table exactly.
const PATCHES: Record<PatchName, Patch> = {
  POLY: {
    osc1: 'sawtooth',
    osc2: 'sawtooth',
    osc2gain: 1.0,
    osc2ratio: 1,
    detune: 7,
    cutoff: 2600,
    q: 0.7,
    A: 0.008,
    D: 0.18,
    S: 0.65,
    R: 0.35,
    wet: 0.25,
  },
  WARM: {
    osc1: 'triangle',
    osc2: 'sawtooth',
    osc2gain: 0.4,
    osc2ratio: 1,
    detune: 5,
    cutoff: 1600,
    q: 0.6,
    A: 0.02,
    D: 0.25,
    S: 0.7,
    R: 0.5,
    wet: 0.25,
  },
  PLUCK: {
    osc1: 'sawtooth',
    osc2: null,
    osc2gain: 0,
    osc2ratio: 1,
    detune: 0,
    cutoff: 3200,
    cutoffFloor: 800,
    filterEnv: true,
    q: 1.2,
    A: 0.002,
    D: 0.22,
    S: 0.0,
    R: 0.18,
    wet: 0.25,
  },
  ORGAN: {
    osc1: 'square',
    osc2: 'square',
    osc2gain: 0.5,
    osc2ratio: 2,
    detune: 0,
    cutoff: 4000,
    q: 0.3,
    A: 0.005,
    D: 0.05,
    S: 0.9,
    R: 0.12,
    wet: 0.12,
  },
  BELL: {
    osc1: 'sine',
    osc2: 'sine',
    osc2gain: 0.5,
    osc2ratio: 2.01,
    detune: 0,
    cutoff: 5000,
    q: 0.5,
    A: 0.001,
    D: 0.6,
    S: 0.0,
    R: 0.9,
    wet: 0.4,
  },
  SQUARE: {
    osc1: 'square',
    osc2: null,
    osc2gain: 0,
    osc2ratio: 1,
    detune: 0,
    cutoff: 2200,
    q: 0.5,
    A: 0.006,
    D: 0.15,
    S: 0.6,
    R: 0.25,
    wet: 0.25,
  },
};

const PEAK = 0.16; // ADSR peak amplitude (per voice)
const MAX_VOICES = 32; // global polyphony cap (oldest-steal beyond this)
const STEAL_RELEASE = 0.05; // fast release applied to a stolen voice (s)
const TINY = 0.0001; // amplitude floor (avoids zero for ramps + click-free stop)

interface Voice {
  id: string; // owning chord/group id (for registry bookkeeping)
  oscs: OscillatorNode[];
  vca: GainNode;
  nodes: AudioNode[]; // every node to disconnect on cleanup (filter, vca, sends)
  release: number; // this voice's release time (s)
  released: boolean;
}

export class WebAudioSynth implements SynthPort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverbBus: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private patchName: PatchName = 'POLY';
  private strumMs = 8;
  private groups = new Map<string, Voice[]>();
  private active: Voice[] = []; // insertion-ordered, for oldest-steal

  resume(): void {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    // 1-sample silent buffer: unlocks audio on iOS/Safari first-gesture.
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      /* unlock is best-effort */
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  noteOn(voiceId: string, freqs: number[]): void {
    if (!this.ctx || !this.master || !this.reverbBus) return;
    // Re-noteOn with the same id replaces the group (powers the live morph).
    this.noteOff(voiceId);
    const patch = PATCHES[this.patchName];
    const t0 = this.ctx.currentTime + 0.005;
    const spread = this.strumMs / 1000;
    const voices: Voice[] = freqs.map((f, i) =>
      this.makeVoice(voiceId, f, t0 + i * spread, patch),
    );
    this.groups.set(voiceId, voices);
    for (const v of voices) this.active.push(v);
    this.stealIfNeeded();
  }

  noteOff(voiceId: string): void {
    const voices = this.groups.get(voiceId);
    if (!voices) return;
    this.groups.delete(voiceId);
    for (const v of voices) this.releaseVoice(v, v.release);
  }

  releaseAll(): void {
    for (const id of [...this.groups.keys()]) this.noteOff(id);
  }

  setPatch(patch: PatchName): void {
    this.patchName = patch;
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

  // --- internals -----------------------------------------------------------

  private build(): void {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    // Master gain -> compressor -> destination.
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // Reverb send bus -> convolver(generated impulse) -> wet gain -> master.
    const reverbBus = ctx.createGain();
    reverbBus.gain.value = 1;
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(ctx, 1.8, 2.5);
    const wet = ctx.createGain();
    wet.gain.value = 1;
    reverbBus.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);
    this.reverbBus = reverbBus;
  }

  // Stereo, exponentially-decaying white-noise impulse response (no asset file).
  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  private makeVoice(id: string, freq: number, t0: number, patch: Patch): Voice {
    const ctx = this.ctx!;
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [];

    // Lowpass biquad shared by both oscillators of this voice.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = patch.q;
    nodes.push(filter);

    // VCA (ADSR amplitude envelope).
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(TINY, t0);
    nodes.push(vca);

    // Oscillator 1.
    const osc1 = ctx.createOscillator();
    osc1.type = patch.osc1;
    osc1.frequency.setValueAtTime(freq, t0);
    osc1.detune.setValueAtTime(patch.detune * 0.5, t0); // half the spread, +
    osc1.connect(filter);
    oscs.push(osc1);

    // Oscillator 2 (optional), detuned the other way + frequency ratio.
    if (patch.osc2) {
      const osc2 = ctx.createOscillator();
      osc2.type = patch.osc2;
      osc2.frequency.setValueAtTime(freq * patch.osc2ratio, t0);
      osc2.detune.setValueAtTime(patch.detune * -0.5, t0); // half the spread, -
      const og = ctx.createGain();
      og.gain.value = patch.osc2gain;
      osc2.connect(og);
      og.connect(filter);
      oscs.push(osc2);
      nodes.push(og);
    }

    filter.connect(vca);

    // Dry path -> master.
    vca.connect(this.master!);

    // Wet path -> reverb bus (per-voice send scaled by patch.wet).
    const send = ctx.createGain();
    send.gain.value = patch.wet;
    vca.connect(send);
    send.connect(this.reverbBus!);
    nodes.push(send);

    // Filter envelope: ramp cutoff -> cutoffFloor over A+D (else static cutoff).
    if (patch.filterEnv && patch.cutoffFloor != null) {
      filter.frequency.setValueAtTime(patch.cutoff, t0);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(1, patch.cutoffFloor),
        t0 + patch.A + patch.D,
      );
    } else {
      filter.frequency.setValueAtTime(patch.cutoff, t0);
    }

    // ADSR: attack to PEAK, decay to PEAK*S, hold until release.
    vca.gain.linearRampToValueAtTime(PEAK, t0 + patch.A);
    vca.gain.linearRampToValueAtTime(Math.max(TINY, PEAK * patch.S), t0 + patch.A + patch.D);

    const voice: Voice = {
      id,
      oscs,
      vca,
      nodes,
      release: patch.R,
      released: false,
    };
    // Disconnect everything once the oscillators stop (leak-free).
    oscs[0].onended = () => this.cleanupVoice(voice);

    for (const o of oscs) o.start(t0);
    return voice;
  }

  // Release one voice's envelope then stop + free its oscillators.
  private releaseVoice(v: Voice, releaseTime: number): void {
    if (v.released || !this.ctx) return;
    v.released = true;
    const now = this.ctx.currentTime;
    try {
      v.vca.gain.cancelScheduledValues(now);
      v.vca.gain.setValueAtTime(Math.max(TINY, v.vca.gain.value), now);
      v.vca.gain.linearRampToValueAtTime(TINY, now + releaseTime);
      for (const o of v.oscs) o.stop(now + releaseTime + 0.03);
    } catch {
      /* an osc may already be stopped */
    }
  }

  // Global polyphony cap: steal the oldest sounding voices beyond MAX_VOICES.
  private stealIfNeeded(): void {
    let live = this.active.filter((v) => !v.released).length;
    if (live <= MAX_VOICES) return;
    for (const v of this.active) {
      if (live <= MAX_VOICES) break;
      if (v.released) continue;
      this.releaseVoice(v, STEAL_RELEASE);
      live--;
    }
  }

  private cleanupVoice(v: Voice): void {
    for (const o of v.oscs) {
      try {
        o.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    const idx = this.active.indexOf(v);
    if (idx >= 0) this.active.splice(idx, 1);
  }
}
