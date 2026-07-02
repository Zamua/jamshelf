// The Transport: a software DIN-sync master clock. Pure timing, no I/O and no notes - just tempo,
// a running (play/stop) state, and a position counter. It advances one PULSE at a time (driven by
// a Ticker adapter) and hands each synced instrument a Clock at its own subdivision, all derived
// from the same counter so everything is phase-locked by construction.

export const PPQN = 24; // pulses per quarter note (as DIN sync + MIDI clock both use)
export const BEATS_PER_BAR = 4;
const PULSES_PER_BAR = PPQN * BEATS_PER_BAR;

// Where we are in musical time. bar + beat are 1-based (for display); tick is 0-based within the
// beat; phase is 0..1 within the bar (for downbeat alignment).
export interface Position {
  pulse: number; // total pulses since the transport was created
  bar: number;
  beat: number;
  tick: number;
  phase: number;
}

// The contract an instrument's sequencer/arp consumes. `start`/`stop` say whether THIS instrument
// wants ticks right now (e.g. an arp starts when a pad is held). onTick passes the absolute sub-tick
// index (0,1,2,... since pulse 0) so a consumer can derive its exact position (a 16-step sequencer:
// index % 16). A GATED clock (a sequencer) only fires while the transport is explicitly playing; a
// FREE clock (a live arp) fires on every pulse, so it also runs in free-run (see setFreeRun).
export interface Clock {
  setBpm(bpm: number): void;
  setBeatsPerTick(beats: number): void; // 0.25 = a 16th note
  start(): void;
  stop(): void;
  onTick(cb: (tick: number) => void): () => void;
}

export type Listener = () => void;

function clampBpm(bpm: number): number {
  return Math.max(20, Math.min(300, Math.round(bpm)));
}

export class Transport {
  private bpm = 120;
  private running = false; // explicit play/stop; drives position + gates sequencer clocks
  private freeRun = false; // keep the pulse advancing even when stopped, for FREE clocks (a live
  //                          arp with no play button). Set by the composition root for a solo
  //                          free-running instrument; off in a rig (there the bar owns play/stop).
  private pulse = -1; // zero-based index of the CURRENT pulse; -1 = none fired yet (first is pulse 0)
  private readonly pulseSubs = new Set<(pulse: number) => void>(); // sub-clocks
  private readonly changeSubs = new Set<Listener>(); // structural: tempo / running (re-arms the ticker)
  private readonly positionSubs = new Set<Listener>(); // per-pulse (a bar.beat readout)

  // --- timing state ---
  getBpm(): number {
    return this.bpm;
  }
  isRunning(): boolean {
    return this.running;
  }
  // Should the pulse counter advance right now? True when explicitly playing OR in free-run.
  isAdvancing(): boolean {
    return this.running || this.freeRun;
  }
  // Free-run keeps the clock ticking for FREE sub-clocks (a live arp) without "playing" - so a solo
  // instrument with no transport bar still arps on pad-hold, while sequencers (gated) stay silent.
  setFreeRun(on: boolean): void {
    if (on === this.freeRun) return;
    this.freeRun = on;
    this.emitChange(); // the ticker re-arms on advancing changes
  }
  intervalMs(): number {
    return 60000 / this.bpm / PPQN; // ms per pulse (what the Ticker schedules)
  }

  setBpm(bpm: number): void {
    const next = clampBpm(bpm);
    if (next === this.bpm) return;
    this.bpm = next;
    this.emitChange();
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    this.emitChange();
  }
  stop(): void {
    if (!this.running) return;
    this.running = false; // pause: hold the position, resume from here on the next play
    this.emitChange();
  }
  toggle(): void {
    this.running ? this.stop() : this.play();
  }
  // Reset the position to the downbeat (bar 1). Used when a context resets - e.g. entering a rig
  // after solo free-run noodling left the counter far along. Refuses while running (never yanks a
  // playing clock).
  rewind(): void {
    if (this.running) return;
    this.pulse = -1;
    for (const cb of this.positionSubs) cb();
  }

  // Called by the Ticker once per pulse-interval. Advances the counter while advancing (playing or
  // free-run), then fires the sub-clocks + the position listeners. Each sub-clock decides for itself
  // whether to fire (a gated one only while playing). Does NOT fire onChange - a per-pulse structural
  // change would make the ticker re-arm every pulse.
  advance(): void {
    if (!this.isAdvancing()) return;
    this.pulse += 1;
    for (const cb of this.pulseSubs) cb(this.pulse);
    for (const cb of this.positionSubs) cb();
  }

  position(): Position {
    const p = Math.max(0, this.pulse); // before the first pulse, report the downbeat
    const inBar = p % PULSES_PER_BAR;
    return {
      pulse: p,
      bar: Math.floor(p / PULSES_PER_BAR) + 1,
      beat: Math.floor(inBar / PPQN) + 1,
      tick: p % PPQN,
      phase: inBar / PULSES_PER_BAR,
    };
  }

  // subscribe to STRUCTURAL changes: tempo + running (the ticker re-arms on these; the UI redraws
  // play/tempo). Fires once per play/stop/setBpm, not per pulse.
  onChange(cb: Listener): () => void {
    this.changeSubs.add(cb);
    return () => this.changeSubs.delete(cb);
  }
  private emitChange(): void {
    for (const cb of this.changeSubs) cb();
  }

  // subscribe to POSITION advancing (fires every pulse while running; for a bar.beat readout).
  onPosition(cb: Listener): () => void {
    this.positionSubs.add(cb);
    return () => this.positionSubs.delete(cb);
  }

  // A Clock at a chosen subdivision, phase-locked to the shared pulse counter. Multiple instruments
  // each get their own; they all fire on the same grid. `gated` (default true) = a sequencer clock
  // that only fires while the transport is explicitly playing; `gated=false` = a FREE clock (a live
  // arp) that fires on every advancing pulse, so it also runs in free-run.
  clock(gated = true): Clock {
    let subPulses = Math.round(0.25 * PPQN); // default a 16th note
    let started = false;
    const subs = new Set<(tick: number) => void>();
    const onPulse = (pulse: number) => {
      if (!started) return;
      if (gated && !this.running) return; // a sequencer stays silent unless explicitly playing
      if (pulse % subPulses === 0) {
        const tick = pulse / subPulses;
        for (const cb of subs) cb(tick);
      }
    };
    this.pulseSubs.add(onPulse);
    return {
      setBpm: (bpm) => this.setBpm(bpm),
      setBeatsPerTick: (beats) => {
        if (Number.isFinite(beats) && beats > 0) subPulses = Math.max(1, Math.round(beats * PPQN));
      },
      start: () => {
        started = true;
      },
      stop: () => {
        started = false;
      },
      onTick: (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    };
  }
}
