import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebAudioSynth } from '../webAudioSynth';

// A minimal fake Web Audio graph for the synth's LOGIC, not its sound. Every
// AudioParam scheduling call is appended to a shared `ops` log tagged with the
// param's accessor name ('gain', 'frequency', ...), so a test can assert WHICH
// params got re-scheduled. This is how we pin the legato `retune()`: a chord morph
// must SLIDE the oscillator frequencies without RE-ATTACKING the VCA gain envelope.
// (The actual audio fidelity is verified by ear in the browser.)
interface Op {
  acc: string;
  method: string;
}
let ops: Op[] = [];

class FakeParam {
  value = 0;
  acc: string;
  constructor(acc: string) {
    this.acc = acc;
  }
  private log(method: string): void {
    ops.push({ acc: this.acc, method });
  }
  setValueAtTime(v: number): void {
    this.value = v;
    this.log('setValueAtTime');
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
    this.log('linearRampToValueAtTime');
  }
  exponentialRampToValueAtTime(v: number): void {
    this.value = v;
    this.log('exponentialRampToValueAtTime');
  }
  setTargetAtTime(): void {
    this.log('setTargetAtTime');
  }
  cancelScheduledValues(): void {
    this.log('cancelScheduledValues');
  }
}

// One generic node carrying every param accessor any node kind might use (extra
// unused params are harmless). Each FakeParam knows its accessor name for the log.
class FakeNode {
  gain = new FakeParam('gain');
  frequency = new FakeParam('frequency');
  detune = new FakeParam('detune');
  Q = new FakeParam('Q');
  pan = new FakeParam('pan');
  offset = new FakeParam('offset');
  delayTime = new FakeParam('delayTime');
  threshold = new FakeParam('threshold');
  knee = new FakeParam('knee');
  ratio = new FakeParam('ratio');
  attack = new FakeParam('attack');
  release = new FakeParam('release');
  playbackRate = new FakeParam('playbackRate');
  type = '';
  buffer: unknown = null;
  loop = false;
  curve: unknown = null;
  oversample = '';
  normalize = false;
  bufferSize = 0;
  onended: (() => void) | null = null;
  onaudioprocess: ((e: unknown) => void) | null = null;
  // connect returns its target so chains work; a target may be a node OR a param.
  connect<T>(target: T): T {
    return target;
  }
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
  }
  getChannelData(): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeCtx {
  sampleRate = 48000;
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  resume(): Promise<void> {
    return Promise.resolve();
  }
  createGain(): FakeNode {
    return new FakeNode();
  }
  createOscillator(): FakeNode {
    return new FakeNode();
  }
  createBiquadFilter(): FakeNode {
    return new FakeNode();
  }
  createWaveShaper(): FakeNode {
    return new FakeNode();
  }
  createStereoPanner(): FakeNode {
    return new FakeNode();
  }
  createConstantSource(): FakeNode {
    return new FakeNode();
  }
  createDynamicsCompressor(): FakeNode {
    return new FakeNode();
  }
  createConvolver(): FakeNode {
    return new FakeNode();
  }
  createDelay(): FakeNode {
    return new FakeNode();
  }
  createScriptProcessor(): FakeNode {
    return new FakeNode();
  }
  createBufferSource(): FakeNode {
    return new FakeNode();
  }
  createBuffer(ch: number, len: number, rate: number): FakeBuffer {
    return new FakeBuffer(ch, len, rate);
  }
}

const count = (acc: string, method?: string): number =>
  ops.filter((o) => o.acc === acc && (method === undefined || o.method === method)).length;

// A C-major-ish triad and a morph target a third higher (pitches are arbitrary; the
// retune logic only cares about counts + which params move).
const TRIAD = [261.6, 329.6, 392.0];
const MORPH = [277.2, 349.2, 415.3];

describe('WebAudioSynth.retune (legato chord morph)', () => {
  let synth: WebAudioSynth;

  beforeEach(() => {
    ops = [];
    // The synth reads `window.AudioContext` in build(); stub a minimal window.
    (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
    synth = new WebAudioSynth();
    synth.resume(); // builds the graph against the fake context
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('morphs a held chord in place: slides the oscillators, no VCA re-attack', () => {
    synth.noteOn('v', TRIAD);
    const gainOpsAfterOn = count('gain');
    const freqRampsAfterOn = count('frequency', 'exponentialRampToValueAtTime');

    synth.retune('v', MORPH); // same voice count, new pitches

    // No re-attack: the VCA gain envelopes are untouched (no fresh gain scheduling).
    expect(count('gain')).toBe(gainOpsAfterOn);
    // The slide DID happen: oscillator frequencies exponential-ramped to the new pitches.
    expect(count('frequency', 'exponentialRampToValueAtTime')).toBeGreaterThan(freqRampsAfterOn);
  });

  it('adding a note attacks ONLY the new voice, not the whole chord', () => {
    // Measure one voice's attack cost on a clean slate.
    const probe = new WebAudioSynth();
    probe.resume();
    const before = count('gain');
    probe.noteOn('p', [220]);
    const perVoice = count('gain') - before;
    expect(perVoice).toBeGreaterThan(0);

    synth.noteOn('v', TRIAD);
    const gainOps = count('gain');
    synth.retune('v', [...MORPH, 466.2]); // 3 -> 4: exactly one note added

    // Only the added note attacks: the delta is one voice's cost, NOT a full
    // four-voice re-trigger (which would re-pluck the held notes).
    expect(count('gain') - gainOps).toBe(perVoice);
  });

  it('falls back to a fresh attack when the voice id is not currently held', () => {
    const gainBefore = count('gain');
    synth.retune('ghost', TRIAD); // nothing sounding under this id
    // With no group to retune, it noteOns (attacks all three) instead of sliding.
    expect(count('gain')).toBeGreaterThan(gainBefore);
  });
});
