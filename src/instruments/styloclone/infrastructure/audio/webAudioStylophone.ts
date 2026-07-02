import { midiToFreq, type Midi } from '../../domain/keyboard';
import type { StylophonePort, VoiceName } from '../../application/ports';

// The StyloClone's audio engine: a strictly MONOPHONIC relaxation-oscillator voice, faithful
// to the 1968 Stylophone's dirty, reedy buzz. ONE oscillator runs continuously; the stylus
// making/breaking contact is modelled by gating a VCA (fast attack, short release), and sliding
// the stylus across keys just re-ramps the oscillator frequency (a natural legato slur).
//
// Signal chain:  osc -> drive (tanh waveshaper) -> lowpass -> vca -> master -> limiter -> out
// Pitch mod:     tune (ConstantSource, cents) + vibrato LFO (triangle ~7Hz, cents) -> osc.detune

interface VoiceSpec {
  type: OscillatorType; // sawtooth is closest to the relaxation-osc ramp
  cutoff: number; // lowpass Hz (tames the fizz)
  drive: number; // tanh pre-gain (the nasal grit); 1 = clean
}

// BUZZ = the faithful original buzz; ROUND + REED = the two S1-reissue alternates.
const VOICES: Record<VoiceName, VoiceSpec> = {
  BUZZ: { type: 'sawtooth', cutoff: 3400, drive: 2.6 },
  ROUND: { type: 'triangle', cutoff: 2100, drive: 1.1 },
  REED: { type: 'square', cutoff: 4200, drive: 3.2 },
};

const VIBRATO_HZ = 7; // the original's ~7 Hz vibrato
const VIBRATO_CENTS = 16; // modest pitch depth
const ATTACK = 0.006; // near-instant (contact made)
const RELEASE = 0.04; // short (contact broken), enough to avoid a click
const SLUR = 0.02; // frequency ramp when sliding across keys (the stylus slur)

// A tanh soft-clip curve for the reedy drive.
function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x);
  }
  return curve;
}

export class WebAudioStylophone implements StylophonePort {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private drive: WaveShaperNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private vca: GainNode | null = null;
  private master: GainNode | null = null;
  private tuneNode: ConstantSourceNode | null = null;
  private vibratoLfo: OscillatorNode | null = null;
  private vibratoDepth: GainNode | null = null;

  // desired state, applied on build (the controller sets these before any gesture)
  private voice: VoiceName = 'BUZZ';
  private vibrato = false;
  private tune = 0; // cents
  private volume = 0.8;
  private muted = false;
  private sounding = false;

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

  noteOn(midi: Midi): void {
    if (!this.ctx) this.build();
    if (!this.ctx || !this.osc || !this.vca) return;
    const now = this.ctx.currentTime;
    const freq = midiToFreq(midi);
    if (this.sounding) {
      // legato slur: glide the oscillator to the new pitch without re-attacking
      this.osc.frequency.cancelScheduledValues(now);
      this.osc.frequency.setTargetAtTime(freq, now, SLUR / 3);
    } else {
      this.osc.frequency.setValueAtTime(freq, now);
      // contact made: open the VCA fast
      this.vca.gain.cancelScheduledValues(now);
      this.vca.gain.setTargetAtTime(this.muted ? 0 : 1, now, ATTACK / 3);
      this.sounding = true;
    }
  }

  noteOff(): void {
    if (!this.ctx || !this.vca) return;
    const now = this.ctx.currentTime;
    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.setTargetAtTime(0, now, RELEASE / 3);
    this.sounding = false;
  }

  setVibrato(on: boolean): void {
    this.vibrato = on;
    if (this.ctx && this.vibratoDepth) {
      this.vibratoDepth.gain.setTargetAtTime(on ? VIBRATO_CENTS : 0, this.ctx.currentTime, 0.02);
    }
  }

  setTune(cents: number): void {
    this.tune = cents;
    if (this.ctx && this.tuneNode) {
      this.tuneNode.offset.setTargetAtTime(cents, this.ctx.currentTime, 0.02);
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.master && !this.muted) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  setVoice(name: VoiceName): void {
    this.voice = name;
    if (this.ctx && this.osc && this.drive && this.lowpass) {
      const spec = VOICES[name];
      this.osc.type = spec.type;
      this.drive.curve = makeDriveCurve(spec.drive);
      this.lowpass.frequency.setTargetAtTime(spec.cutoff, this.ctx.currentTime, 0.02);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  // --- internals ---
  private build(): void {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    const spec = VOICES[this.voice];

    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.value = midiToFreq(45); // A2, parked until the first note

    const drive = ctx.createWaveShaper();
    drive.curve = makeDriveCurve(spec.drive);
    drive.oversample = '2x';

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = spec.cutoff;
    lowpass.Q.value = 0.7;

    const vca = ctx.createGain();
    vca.gain.value = 0; // silent until a key is pressed

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;

    // A brickwall-ish limiter so the driven voice never hard-clips.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;

    osc.connect(drive);
    drive.connect(lowpass);
    lowpass.connect(vca);
    vca.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    osc.start();

    // pitch modulation: tune (static cents) + vibrato LFO (cents), summed into osc.detune
    const tuneNode = ctx.createConstantSource();
    tuneNode.offset.value = this.tune;
    tuneNode.connect(osc.detune);
    tuneNode.start();

    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = VIBRATO_HZ;
    const depth = ctx.createGain();
    depth.gain.value = this.vibrato ? VIBRATO_CENTS : 0;
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start();

    this.osc = osc;
    this.drive = drive;
    this.lowpass = lowpass;
    this.vca = vca;
    this.master = master;
    this.tuneNode = tuneNode;
    this.vibratoLfo = lfo;
    this.vibratoDepth = depth;
    void this.vibratoLfo;

    // iOS/desktop: re-resume the context on return-to-foreground + the next user gesture
    // (a backgrounded context stays suspended/interrupted otherwise). Only while visible.
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
      for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
        window.addEventListener(ev, tryResume, { passive: true });
      }
    }
  }
}
