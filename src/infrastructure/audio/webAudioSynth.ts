import type { DrumName, DrumKit } from '../../domain/music';
import type { PatchName, SynthPort } from '../../application/ports';

// Per-kit tuning factors applied to the base drum recipes (kick pitch + decay,
// snare noise/tone balance, hat brightness). TIGHT = neutral; 808 = boomy + softer;
// 909 = punchy + bright.
const KIT_TUNE: Record<string, { kickF: number; kickDecay: number; snareN: number; snareT: number; hatF: number }> = {
  TIGHT: { kickF: 1, kickDecay: 1, snareN: 1, snareT: 1, hatF: 1 },
  BOX808: { kickF: 0.78, kickDecay: 1.7, snareN: 0.8, snareT: 0.7, hatF: 0.9 },
  BOX909: { kickF: 1.12, kickDecay: 0.78, snareN: 1.25, snareT: 0.85, hatF: 1.18 },
};

// Sample kits load mono mp3 one-shots from /drums/<folder>/<pad>.mp3 (CC0). Map of
// kit -> folder; kits not listed here are synthesized.
const SAMPLE_KITS: Partial<Record<DrumKit, string>> = {
  TRAP: 'trap',
  LOFI: 'lofi',
};

// Full Web Audio implementation of SynthPort. Ported from the single-file
// prototype: six patch voices, dual oscillators with detune + ratio, a per-voice
// lowpass with an optional filter envelope, ADSR VCA, a generated-impulse reverb
// bus (no asset files), a master compressor, a global 32-voice cap with
// oldest-steal, and per-chord strum spread. Everything below the SynthPort
// surface is free to change; the port itself stays stable.

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
type Engine = 'sub' | 'fm'; // subtractive (analog) or 2-operator FM

interface Patch {
  engine: Engine;
  // subtractive params
  osc1: Wave;
  osc2: Wave | null;
  osc2gain: number; // mix level of the second oscillator
  osc2ratio: number; // osc2 frequency multiplier
  detune: number; // cents of spread between the two oscillators
  // FM params (2-op): a modulator at carrier*ratio modulates the carrier frequency,
  // its depth (index) enveloped from peak -> sustain over fmDecay (the "FM pluck").
  carrier: Wave;
  modWave: Wave;
  fmRatio: number;
  fmIndex: number; // peak modulation index; depth in Hz = index * carrierFreq
  fmDecay: number; // index envelope time (s)
  fmSustain: number; // index sustain fraction
  // shared
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

// Shared defaults so each patch only states what it changes.
const BASE: Patch = {
  engine: 'sub',
  osc1: 'sawtooth',
  osc2: null,
  osc2gain: 0,
  osc2ratio: 1,
  detune: 0,
  carrier: 'sine',
  modWave: 'sine',
  fmRatio: 1,
  fmIndex: 2,
  fmDecay: 0.4,
  fmSustain: 0.1,
  cutoff: 3200,
  q: 0.6,
  A: 0.005,
  D: 0.2,
  S: 0.6,
  R: 0.3,
  wet: 0.25,
};

// The instrument set, modelled on the real device: analog (SAW/SINE/STRINGS/
// CLARINET/ORGAN/PLUCK) + 2-operator FM (EPIANO/HX7/BELL).
const PATCHES: Record<PatchName, Patch> = {
  SAW: { ...BASE, osc1: 'sawtooth', osc2: 'sawtooth', osc2gain: 1, detune: 7, cutoff: 2600, q: 0.7, A: 0.008, D: 0.18, S: 0.65, R: 0.35 },
  SINE: { ...BASE, osc1: 'sine', cutoff: 4500, A: 0.01, D: 0.2, S: 0.8, R: 0.4, wet: 0.3 },
  EPIANO: { ...BASE, engine: 'fm', carrier: 'sine', modWave: 'sine', fmRatio: 1, fmIndex: 3.2, fmDecay: 0.35, fmSustain: 0.08, cutoff: 5500, A: 0.002, D: 0.5, S: 0.45, R: 0.5, wet: 0.3 },
  HX7: { ...BASE, engine: 'fm', carrier: 'sine', modWave: 'sine', fmRatio: 2, fmIndex: 2.6, fmDecay: 0.5, fmSustain: 0.3, cutoff: 6000, A: 0.004, D: 0.3, S: 0.6, R: 0.4 },
  STRINGS: { ...BASE, osc1: 'sawtooth', osc2: 'sawtooth', osc2gain: 0.8, detune: 13, cutoff: 2000, q: 0.5, A: 0.18, D: 0.3, S: 0.85, R: 0.7, wet: 0.4 },
  CLARINET: { ...BASE, osc1: 'square', cutoff: 1700, q: 0.4, A: 0.03, D: 0.1, S: 0.82, R: 0.2, wet: 0.2 },
  BELL: { ...BASE, engine: 'fm', carrier: 'sine', modWave: 'sine', fmRatio: 3.5, fmIndex: 4, fmDecay: 0.9, fmSustain: 0, cutoff: 7000, A: 0.001, D: 0.8, S: 0, R: 1, wet: 0.45 },
  ORGAN: { ...BASE, osc1: 'square', osc2: 'square', osc2gain: 0.5, osc2ratio: 2, cutoff: 4000, q: 0.3, A: 0.005, D: 0.05, S: 0.9, R: 0.12, wet: 0.12 },
  PLUCK: { ...BASE, osc1: 'sawtooth', cutoff: 3200, cutoffFloor: 800, filterEnv: true, q: 1.2, A: 0.002, D: 0.22, S: 0, R: 0.18 },
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
  private liveSum: GainNode | null = null; // tap point: the full live mix (recorded)
  private loopSum: GainNode | null = null; // loop playback + metronome (not recorded)
  private bendNode: ConstantSourceNode | null = null; // global pitch bend (cents) -> every osc.detune
  private reverbBus: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private patchName: PatchName = 'SAW';
  private strumMs = 8;
  private groups = new Map<string, Voice[]>();
  private active: Voice[] = []; // insertion-ordered, for oldest-steal
  private noise: AudioBuffer | null = null; // shared white noise for the drum voices
  private sampleCache = new Map<string, AudioBuffer>(); // `${kit}:${pad}` -> decoded sample
  private kitLoading = new Set<DrumKit>();
  // Global FX (delay + chorus); wet gains start at 0 = off.
  private delay: DelayNode | null = null;
  private delayWet: GainNode | null = null;
  private chorusWet: GainNode | null = null;
  private fxDelayOn = false;
  private fxChorusOn = false;
  private fxDelayMs = 250;

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

  noteOn(voiceId: string, freqs: number[], patchName?: PatchName): void {
    if (!this.ctx || !this.master || !this.reverbBus) return;
    // Re-noteOn with the same id replaces the group (powers the live morph).
    this.noteOff(voiceId);
    const patch = PATCHES[patchName ?? this.patchName];
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

  // Global pitch bend in cents (smoothed). LEAD mode drives this from the joystick.
  setBend(cents: number): void {
    if (this.bendNode && this.ctx)
      this.bendNode.offset.setTargetAtTime(cents, this.ctx.currentTime, 0.012);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    // Power also silences any playing loops + the metronome (they bypass the
    // volume knob but not the mute gate).
    if (this.loopSum && this.ctx)
      this.loopSum.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  // The audio looper (infrastructure) taps these nodes directly: it records
  // `live` (the full live mix) and plays its loops + metronome back through
  // `loopOut` (which the recorder does NOT tap). Builds the context on demand.
  audioGraph(): { ctx: AudioContext; live: AudioNode; loopOut: AudioNode } | null {
    if (!this.ctx) this.build();
    if (!this.ctx || !this.liveSum || !this.loopSum) return null;
    return { ctx: this.ctx, live: this.liveSum, loopOut: this.loopSum };
  }

  // --- internals -----------------------------------------------------------

  private build(): void {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    // Global pitch-bend source: a constant signal (in cents) fanned out to every
    // oscillator's detune param, so LEAD mode's joystick can bend / octave-shift the
    // sounding note smoothly. 0 = no bend.
    const bend = ctx.createConstantSource();
    bend.offset.value = 0;
    bend.start();
    this.bendNode = bend;

    // Master gain -> compressor (glue) -> limiter (brickwall) -> destination. The
    // limiter is what keeps stacked loop layers + live drums from clipping: the comp's
    // 3ms attack lets sharp drum transients through, so a fast near-0dB limiter catches
    // the peaks before the output hard-clips (which is what made layered drums crackle).
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.0005;
    limiter.release.value = 0.06;
    comp.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;

    // Two summing buses sit between the live graph and the compressor so the looper
    // can tap ONLY the live signal:
    //   liveSum  = everything the player makes right now (master dry + reverb +
    //              delay + chorus). The audio looper records its output.
    //   loopSum  = loop playback. It joins AFTER the tap, so replaying a loop is
    //              never re-recorded (overdubs layer cleanly), and the metronome
    //              click routes here too so it stays out of the recording.
    // Both feed the compressor. loopSum is gated by mute (power) but NOT by the
    // volume knob, so a recorded layer keeps the level it was captured at.
    const liveSum = ctx.createGain();
    const loopSum = ctx.createGain();
    loopSum.gain.value = this.muted ? 0 : 1;
    master.connect(liveSum);
    liveSum.connect(comp);
    loopSum.connect(comp);
    this.liveSum = liveSum;
    this.loopSum = loopSum;

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

    // A second of white noise, reused by the drum voices (snare/hats/ride).
    const nlen = ctx.sampleRate;
    const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nbuf;

    // FX sends off the master (dry stays master -> comp): a feedback delay and a
    // chorus (LFO-modulated short delay). Their wet gains gate them on/off.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.25;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.34;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;
    master.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(liveSum);
    this.delay = delay;
    this.delayWet = delayWet;

    const chDelay = ctx.createDelay(0.05);
    chDelay.delayTime.value = 0.022;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.006;
    lfo.connect(lfoGain);
    lfoGain.connect(chDelay.delayTime);
    lfo.start();
    const chWet = ctx.createGain();
    chWet.gain.value = 0;
    master.connect(chDelay);
    chDelay.connect(chWet);
    chWet.connect(liveSum);
    this.chorusWet = chWet;

    // Browsers SUSPEND the AudioContext when the tab is backgrounded (currentTime
    // freezes); on return it stays suspended and everything goes silent. Resume it
    // when the page becomes visible again so loops + the live synth keep playing.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && ctx.state === 'suspended')
          void ctx.resume();
      });
    }

    this.applyFx();
  }

  setFx(delay: boolean, chorus: boolean, delayMs: number): void {
    this.fxDelayOn = delay;
    this.fxChorusOn = chorus;
    this.fxDelayMs = delayMs;
    this.applyFx();
  }
  private applyFx(): void {
    if (!this.ctx || !this.delay || !this.delayWet || !this.chorusWet) return;
    const now = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(Math.max(0.02, this.fxDelayMs / 1000), now, 0.05);
    this.delayWet.gain.setTargetAtTime(this.fxDelayOn ? 0.33 : 0, now, 0.05);
    this.chorusWet.gain.setTargetAtTime(this.fxChorusOn ? 0.5 : 0, now, 0.05);
  }

  // A drum hit: play the loaded sample for a sample kit, else synthesize. Sample
  // kits are lazy-loaded on first use; until ready, this hit falls back to the
  // synth so it is never silent.
  drum(name: DrumName, kit: DrumKit): void {
    if (!this.ctx || !this.master || this.muted) return;
    const folder = SAMPLE_KITS[kit];
    if (folder) {
      const buf = this.sampleCache.get(`${kit}:${name}`);
      if (buf) {
        this.playBuffer(buf);
        return;
      }
      void this.loadKit(kit, folder); // kick off loading for next time
      this.synthDrum(name, 'TIGHT'); // neutral fallback for this hit
      return;
    }
    this.synthDrum(name, kit);
  }

  private playBuffer(buf: AudioBuffer): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.7; // headroom so a drum layer summed over chords does not clip
    src.connect(g);
    g.connect(this.master!);
    src.start();
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  private async loadKit(kit: DrumKit, folder: string): Promise<void> {
    if (this.kitLoading.has(kit) || !this.ctx) return;
    this.kitLoading.add(kit);
    const pads: DrumName[] = ['KICK', 'KICK2', 'SNARE', 'HAT', 'TOM', 'RIDE', 'OPENHAT'];
    await Promise.all(
      pads.map(async (n) => {
        try {
          const res = await fetch(`drums/${folder}/${n.toLowerCase()}.mp3`);
          const arr = await res.arrayBuffer();
          const buf = await this.ctx!.decodeAudioData(arr);
          this.sampleCache.set(`${kit}:${n}`, buf);
        } catch {
          /* leave it missing; the synth fallback covers it */
        }
      }),
    );
  }

  // One-shot synthesized drum hit (no samples). Builds a tiny percussion graph
  // (pitch-swept tone and/or filtered noise burst with a fast amp decay) straight
  // to the master, then disconnects it once it has rung out.
  private synthDrum(name: DrumName, kit: DrumKit): void {
    if (!this.ctx || !this.master || this.muted || !this.noise) return;
    const ctx = this.ctx;
    const k = KIT_TUNE[kit];
    const t = ctx.currentTime + 0.002;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.master);
    let until = t + 0.1;

    const tone = (wave: OscillatorType, f0: number, f1: number, peak: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
      until = Math.max(until, t + dur);
    };
    const noiseHit = (type: BiquadFilterType, freq: number, q: number, peak: number, dur: number) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      n.connect(f);
      f.connect(g);
      g.connect(out);
      n.start(t);
      n.stop(t + dur + 0.02);
      until = Math.max(until, t + dur);
    };

    switch (name) {
      case 'KICK':
        tone('sine', 150 * k.kickF, 45 * k.kickF, 0.9, 0.35 * k.kickDecay);
        break;
      case 'KICK2':
        tone('sine', 110 * k.kickF, 40 * k.kickF, 0.95, 0.28 * k.kickDecay);
        break;
      case 'SNARE':
        noiseHit('highpass', 1500, 0, 0.6 * k.snareN, 0.2);
        tone('triangle', 190, 190, 0.4 * k.snareT, 0.12);
        break;
      case 'HAT':
        noiseHit('highpass', 8000 * k.hatF, 0, 0.4, 0.045);
        break;
      case 'OPENHAT':
        noiseHit('highpass', 7000 * k.hatF, 0, 0.4, 0.3);
        break;
      case 'TOM':
        tone('sine', 160 * k.kickF, 80 * k.kickF, 0.8, 0.25);
        break;
      case 'RIDE':
        noiseHit('bandpass', 6000 * k.hatF, 2, 0.3, 0.5);
        tone('square', 320, 320, 0.08, 0.4);
        break;
    }
    const ms = (until - ctx.currentTime + 0.1) * 1000;
    setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        /* already gone */
      }
    }, ms);
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

    if (patch.engine === 'fm') {
      // 2-operator FM: modulator (carrier*ratio) -> modGain -> carrier.frequency.
      // The modulation depth (index*freq, in Hz) is enveloped from peak to sustain,
      // which gives the bright attack + mellowing decay of FM E.pianos / bells.
      const carrier = ctx.createOscillator();
      carrier.type = patch.carrier;
      carrier.frequency.setValueAtTime(freq, t0);
      const mod = ctx.createOscillator();
      mod.type = patch.modWave;
      mod.frequency.setValueAtTime(freq * patch.fmRatio, t0);
      const modGain = ctx.createGain();
      const peak = Math.max(1, patch.fmIndex * freq);
      modGain.gain.setValueAtTime(peak, t0);
      modGain.gain.exponentialRampToValueAtTime(
        Math.max(1, peak * patch.fmSustain),
        t0 + patch.fmDecay,
      );
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(filter);
      oscs.push(carrier, mod);
      nodes.push(modGain);
    } else {
      // Subtractive: oscillator 1 (+ optional detuned oscillator 2) -> filter.
      const osc1 = ctx.createOscillator();
      osc1.type = patch.osc1;
      osc1.frequency.setValueAtTime(freq, t0);
      osc1.detune.setValueAtTime(patch.detune * 0.5, t0); // half the spread, +
      osc1.connect(filter);
      oscs.push(osc1);

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
    }

    // Fan the global bend (cents) into every oscillator's detune, so a LEAD bend
    // shifts the whole voice (carrier + modulator / both detuned oscs) in lockstep,
    // preserving the FM ratio + detune spread.
    if (this.bendNode) for (const o of oscs) this.bendNode.connect(o.detune);

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
