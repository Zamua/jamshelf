// The rig's shared audio. Web Audio can't connect nodes across separate AudioContexts, and every
// instrument makes its own today - so routing device audio into the looper needs ONE context for the
// whole rig. Each device gets its own output node (its "output jack"): that node feeds the master
// (→ speakers) and, when a virtual wire connects it, the looper's input bus. Recording taps that bus.
// See docs/ROUTING.md.

// What an instrument's audio adapter needs from the rig: the shared context, and the node it should
// connect its final output to (instead of ctx.destination). Solo is a rig of one - still shared.
export interface SharedAudio {
  readonly ctx: AudioContext;
  output(deviceId: string): AudioNode;
  readonly looperInput: AudioNode; // the bus the LoopClone taps to record the wired devices
  readonly loopOut: AudioNode; // where the LoopClone plays its loops back (→ master → speakers)
}

type Ctor = { new (): AudioContext };

export class RigAudio implements SharedAudio {
  readonly ctx: AudioContext;
  readonly looperInput: GainNode; // the LoopClone engine taps this
  private readonly master: GainNode;
  private readonly outs = new Map<string, GainNode>(); // per-device output jacks
  private readonly wired = new Set<string>(); // device ids currently patched into the looper

  // ctx is injectable so tests can pass a fake AudioContext.
  constructor(ctx?: AudioContext) {
    if (ctx) {
      this.ctx = ctx;
    } else {
      const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext: Ctor }).webkitAudioContext) as Ctor;
      this.ctx = new C();
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.looperInput = this.ctx.createGain();
  }

  // A device's output jack: created once, feeds the master, and is tappable by a wire. The instrument
  // connects its final node here.
  output(deviceId: string): AudioNode {
    let g = this.outs.get(deviceId);
    if (!g) {
      g = this.ctx.createGain();
      g.connect(this.master);
      this.outs.set(deviceId, g);
    }
    return g;
  }

  // The LoopClone's own loop playback / metronome joins the master after the input tap.
  get loopOut(): AudioNode {
    return this.master;
  }

  // A virtual wire: join a device's output onto the looper's input bus (idempotent).
  wire(deviceId: string): void {
    if (this.wired.has(deviceId)) return;
    (this.output(deviceId) as GainNode).connect(this.looperInput);
    this.wired.add(deviceId);
  }
  unwire(deviceId: string): void {
    if (!this.wired.has(deviceId)) return;
    (this.output(deviceId) as GainNode).disconnect(this.looperInput);
    this.wired.delete(deviceId);
  }
  isWired(deviceId: string): boolean {
    return this.wired.has(deviceId);
  }
  wiredDevices(): readonly string[] {
    return [...this.wired];
  }
}
