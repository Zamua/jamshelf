import type { AudioLooper, LooperView, TransportControl } from '../../application/ports';
import { COUNT_IN_BEATS, initialLooper, nextLooper, type LooperEffect, type LooperEvent, type LooperState } from '../../application/looperMachine';
import type { LooperStore, SerializedLooper } from '../../application/persistence';
import type { WebAudioSynth } from './webAudioSynth';

// An AUDIO loop recorder: it records the synth's rendered output (not note events)
// off a tap on the live bus, so every layer is frozen the instant it is captured -
// switching patch / play-mode / fx afterwards never alters a recorded loop.
//
// Its lifecycle (idle / count-in / capturing / playing / halted) lives in the pure looperMachine;
// every input goes through dispatch(), and this class performs the effects that come back.
//
// Recording a take drives the shared Transport (via TransportControl): it suspends the rig for
// the count-in, then rewinds to bar 1 and resumes - so the drums replay from the top and the loop's
// bar 1 IS the transport's bar 1, locking the loop to the beat by construction. A metronome clicks
// through the count-in + recording, routed to the synth's loop bus so it is never captured.

const BEATS_PER_BAR = 4; // 4/4 - the master loop is snapped to whole bars
const BUFFER_SIZE = 2048; // ScriptProcessor block (~46ms @ 44.1k) - safe on iOS
const LOOKAHEAD_MS = 25; // metronome scheduler poll interval
const SCHEDULE_AHEAD = 0.12; // seconds of click events to schedule each poll

interface Track {
  source: AudioBufferSourceNode;
  gain: GainNode; // per-layer gain, so a layer can be faded out on delete (no click)
  buffer: AudioBuffer; // the CURRENTLY-PLAYING buffer (the original, or a tempo-stretched copy)
  orig: Float32Array[]; // the ORIGINAL captured PCM, at recordBpm - always time-stretch from this
  recordBpm: number; // the tempo this layer was captured at
}

export class WebAudioLooper implements AudioLooper {
  private readonly synth: WebAudioSynth;
  private ctx: AudioContext | null = null;
  private live: AudioNode | null = null; // tap source (full live mix)
  private loopOut: AudioNode | null = null; // loop + metronome out (untapped)
  private script: ScriptProcessorNode | null = null;

  private state: LooperState = initialLooper;
  private tracks: Track[] = []; // one per layer: state.layers === tracks.length
  private bpm = 120;

  // capture: a growable list of input blocks (used for the master AND each overdub,
  // both recorded contiguously from their start point).
  private masterChunks: [Float32Array[], Float32Array[]] = [[], []];
  private capturedSamples = 0; // total samples captured this take (caps overdubs at 1 loop)

  private loopLenSamples = 0; // master loop length (defines every layer)
  private loopBeats = 0; // its length in whole beats (locks the metronome)
  private loopBars = 0; // its length in whole bars (BEATS_PER_BAR beats each)
  private anchorTime = 0; // ctx time of loop phase 0 (bar 1 - the post-count-in downbeat)
  private lastActivity = 0; // ctx time of the last note on/off while recording the
  // master - the loop length quantizes to THIS (the notes), not the captured audio,
  // so a long release/reverb tail bleeds into the loop instead of adding a bar.
  private restoring: SerializedLooper | null = null; // the saved loops a 'restore' effect applies
  private pendingTimers: ReturnType<typeof setTimeout>[] = []; // scheduled count-in steps
  // every metronome / count-in click oscillator + its scheduled time, so a cancel
  // (disarm, overdub-cancel, stop-metronome) can silence the ones not yet fired -
  // otherwise rapid clicks leave audio-scheduled blips that overlap as new ones start.
  private clickNodes: { osc: OscillatorNode; at: number }[] = [];

  // metronome
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroAnchor = 0; // ctx time of beat 0
  private metroBeat = 0; // next beat index to schedule

  // display tick: re-emits while playing so the OLED bar.beat counter advances
  private displayTimer: ReturnType<typeof setInterval> | null = null;
  private lastBeatKey = -1;

  // tempo-follow: re-stretch recorded loops to a new tempo (debounced; token guards stale renders)
  private restretchTimer: ReturnType<typeof setTimeout> | null = null;
  private restretchToken = 0;

  private listeners = new Set<() => void>();
  private readonly store: LooperStore | null;
  private readonly transport: TransportControl | null; // drives the rig's stop/restart on record

  constructor(synth: WebAudioSynth, store?: LooperStore, transport?: TransportControl) {
    this.synth = synth;
    this.store = store ?? null;
    this.transport = transport ?? null;
    // Reload any saved loops (async). They come back STOPPED so nothing blasts on open
    // (and iOS won't play audio before a gesture anyway); a joystick-down starts them.
    if (this.store)
      void this.store.load().then((data) => {
        if (data) this.restore(data);
      });
  }

  onChange(cb: () => void): void {
    this.listeners.add(cb);
  }
  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  setBpm(bpm: number): void {
    if (bpm === this.bpm) return;
    this.bpm = bpm;
    this.scheduleRestretch(); // re-time any recorded loops to the new tempo (pitch-preserving)
  }

  // Debounce: a tempo drag fires many setBpm calls; re-stretch once, after it settles.
  private scheduleRestretch(): void {
    if (this.tracks.length === 0 || !this.ctx) return;
    if (typeof OfflineAudioContext === 'undefined') return; // the stretch needs it (skip in non-browser)
    if (this.restretchTimer !== null) clearTimeout(this.restretchTimer);
    this.restretchTimer = setTimeout(() => {
      this.restretchTimer = null;
      void this.restretchTracks();
    }, 180);
  }

  private pcmToBuffer(pcm: Float32Array[]): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(pcm.length, pcm[0].length, ctx.sampleRate);
    pcm.forEach((c, i) => buf.getChannelData(i).set(c));
    return buf;
  }

  // Re-time every recorded layer to the CURRENT tempo, pitch-preserved (Signalsmith, offline). Each
  // layer is stretched from its ORIGINAL record-tempo PCM (never a prior stretch, so no cumulative
  // artifact), then swapped in while keeping the loop's PHASE continuous - so it never jumps against
  // the drums, which (being sequenced) already follow the tempo.
  private async restretchTracks(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.tracks.length === 0 || this.loopBars === 0) return;
    const bpm = this.bpm;
    const token = ++this.restretchToken;
    const barSamples = Math.max(1, Math.round((ctx.sampleRate * 60) / bpm)) * BEATS_PER_BAR;
    const newLen = this.loopBars * barSamples;

    // lazy-load the stretcher (Signalsmith WASM) only now that a loop is actually being re-timed,
    // so it stays out of the initial bundle.
    const { stretchLoop } = await import('./timeStretch');
    const bufs = await Promise.all(
      this.tracks.map(async (t) =>
        t.recordBpm === bpm
          ? this.pcmToBuffer(t.orig)
          : this.pcmToBuffer(await stretchLoop(t.orig, ctx.sampleRate, t.recordBpm, bpm)),
      ),
    );
    // the tempo (or the take set) may have moved on while we rendered - a newer run supersedes us
    if (token !== this.restretchToken || this.bpm !== bpm || bufs.length !== this.tracks.length) return;

    const at = ctx.currentTime + 0.03;
    const oldSec = this.loopLenSamples / ctx.sampleRate;
    const phase = oldSec > 0 ? ((((at - this.anchorTime) % oldSec) + oldSec) % oldSec) / oldSec : 0;
    this.loopLenSamples = newLen;
    this.loopBeats = this.loopBars * BEATS_PER_BAR;
    const newSec = newLen / ctx.sampleRate;
    const offset = phase * newSec;
    this.anchorTime = at - offset; // loop phase-0 stays where the transport expects it
    const play = this.state.phase.kind === 'playing';
    this.stopAllSources();
    this.tracks.forEach((t, i) => {
      t.buffer = bufs[i];
      if (play) {
        const { source, gain } = this.startLoop(t.buffer, at, offset);
        t.source = source;
        t.gain = gain;
      }
    });
    this.persist();
    this.emit();
  }

  view(): LooperView {
    const p = this.state.phase;
    let pos = 0;
    let bar = 0;
    let beat = 0;
    if (this.ctx && this.loopLenSamples > 0 && p.kind === 'playing') {
      const lenSec = this.loopLenSamples / this.ctx.sampleRate;
      const t = (((this.ctx.currentTime - this.anchorTime) % lenSec) + lenSec) % lenSec;
      pos = t / lenSec;
      const beatIdx = Math.min(this.loopBeats - 1, Math.floor(pos * this.loopBeats));
      bar = Math.floor(beatIdx / BEATS_PER_BAR) + 1;
      beat = (beatIdx % BEATS_PER_BAR) + 1;
    }
    const taking = p.kind === 'countIn' || p.kind === 'capturing';
    return {
      active: this.state.active,
      mode: p.kind === 'idle' ? 'idle' : taking ? 'rec' : 'play',
      recTrack: taking ? p.track : -1,
      trackCount: this.tracks.length,
      selected: this.state.selected,
      loopBars: this.loopBars,
      bar,
      beat,
      stopped: p.kind === 'halted',
      countdown: p.kind === 'countIn' ? p.beatsLeft : 0,
      posFraction: pos,
    };
  }

  // --- inputs: each is an event for the lifecycle machine -----------------
  selectTrack(dir: -1 | 1): void {
    this.dispatch({ type: 'select', dir });
  }
  // Joystick CLICK: the first enters looper mode, then clicks run the record cycle.
  click(): void {
    if (!this.ensureGraph()) return;
    this.dispatch({ type: 'click' });
  }
  // Joystick UP: leave looper mode. A recording take is kept, one still counting in is dropped, and
  // the layers halt (the rig keeps rolling); re-entering + a down-flick resumes them.
  exit(): void {
    this.dispatch({ type: 'exit' });
  }
  // Joystick down (SOLO): drops a take still counting in, else stops the loops or restarts them
  // from bar 1. In a RIG the controller drives the shared transport and the loops follow it.
  toggleStop(): void {
    this.dispatch({ type: 'toggleStop' });
  }
  // Follow the shared transport at `beat`, the rig's position in beats from bar 1. The loops were
  // recorded from the rig's bar 1, so that position alone says where in the loop to resume.
  followTransport(playing: boolean, beat: number): void {
    this.dispatch({ type: 'follow', playing, beat });
  }
  // Long press: drop the selected layer, or wipe everything when the cursor is on the master.
  clear(): void {
    this.dispatch({ type: 'clear' });
  }

  // While recording the master, the loop length quantizes on the last note played (not on a
  // release/reverb tail); a press or release during the count-in does not count.
  noteStarted(): void {
    if (this.capturingMaster() && this.ctx) this.lastActivity = this.ctx.currentTime;
  }
  noteEnded(): void {
    if (this.capturingMaster() && this.ctx) this.lastActivity = this.ctx.currentTime;
  }
  private capturingMaster(): boolean {
    const p = this.state.phase;
    return p.kind === 'capturing' && p.track === 0;
  }

  private dispatch(event: LooperEvent): void {
    const { state, effects } = nextLooper(this.state, event);
    this.state = state;
    for (const fx of effects) this.perform(fx);
    this.emit();
  }

  private perform(fx: LooperEffect): void {
    switch (fx.kind) {
      case 'beginTake':
        return this.beginTake();
      case 'startCapture':
        return this.startCapture();
      case 'finishTake':
        return fx.track === 0 ? this.finalizeMaster() : this.finalizeOverdub();
      case 'cancelTake':
        return this.cancelTake(fx.resume);
      case 'play':
        return this.playFrom(fx.beat);
      case 'halt':
        return this.halt();
      case 'dropLayer':
        return this.dropLayer(fx.index);
      case 'wipe':
        return this.wipe(fx.resumeRig);
      case 'restore':
        if (this.restoring) this.applyRestore(this.restoring);
        return;
    }
  }

  // Drop a take during its count-in: kill the scheduled clicks + capture start. resume (a re-press)
  // replays from bar 1 (existing layers + the rig); otherwise everything stays halted where the
  // count-in stopped it.
  private cancelTake(resume: boolean): void {
    this.clearPendingTimers();
    this.killFutureClicks();
    this.masterChunks = [[], []];
    this.capturedSamples = 0;
    if (!resume) return this.halt(); // beginTake cued the layers for the cancelled downbeat: stop them
    if (this.tracks.length > 0) {
      const at = this.ctx!.currentTime + 0.05;
      this.anchorTime = at;
      this.restartTracks(at);
      this.startDisplayTimer();
    }
    this.transport?.resumeFromTop();
  }

  // Start every layer `beat` beats into the loop.
  private playFrom(beat: number): void {
    if (!this.ctx || this.tracks.length === 0) return;
    const at = this.ctx.currentTime + 0.03;
    const lenSec = this.loopLenSamples / this.ctx.sampleRate;
    const beats = this.loopBeats > 0 ? this.loopBeats : 1;
    const offset = ((((beat % beats) + beats) % beats) / beats) * lenSec;
    this.anchorTime = at - offset;
    this.stopAllSources();
    for (const t of this.tracks) {
      const { source, gain } = this.startLoop(t.buffer, at, offset);
      t.source = source;
      t.gain = gain;
    }
    this.startDisplayTimer();
  }

  private halt(): void {
    this.stopAllSources();
    this.stopDisplayTimer();
  }

  private dropLayer(index: number): void {
    const [t] = this.tracks.splice(index, 1);
    if (t) this.stopTrack(t, true); // fade out so deleting a layer doesn't click
    this.persist();
  }

  private wipe(resumeRig: boolean): void {
    // a count-in suspended the rig and its scheduled resume is cancelled below: resume it here
    if (resumeRig) this.transport?.resumeFromTop();
    this.clearPendingTimers();
    for (const t of this.tracks) this.stopTrack(t, false);
    this.tracks = [];
    this.masterChunks = [[], []];
    this.capturedSamples = 0;
    this.loopLenSamples = 0;
    this.loopBeats = 0;
    this.loopBars = 0;
    this.stopMetronome();
    this.stopDisplayTimer();
    this.store?.clear(); // wiped everything -> drop the persisted loops too
  }

  private startDisplayTimer(): void {
    this.stopDisplayTimer();
    this.lastBeatKey = -1;
    this.displayTimer = setInterval(() => {
      const v = this.view();
      const key = v.bar * 16 + v.beat;
      if (key !== this.lastBeatKey) {
        this.lastBeatKey = key;
        this.emit(); // only re-render the OLED when the bar/beat actually advances
      }
    }, 40);
  }
  private stopDisplayTimer(): void {
    if (this.displayTimer !== null) {
      clearInterval(this.displayTimer);
      this.displayTimer = null;
    }
  }

  // --- recording lifecycle -------------------------------------------------
  private finalizeMaster(): void {
    const ctx = this.ctx!;
    const left = concat(this.masterChunks[0]);
    const right = concat(this.masterChunks[1]);
    this.masterChunks = [[], []];

    // Quantize on the NOTES, not the captured audio: the length is how long you
    // actually played (anchor -> last note on/off), snapped to whole bars. Measuring
    // the audio instead would let a long release/reverb tail past the bar line round
    // the loop UP a bar. The tail (audio captured past the last note) is wrapped back
    // into the loop start below, so it bleeds in rather than extending the loop.
    const beatSamples = Math.max(1, Math.round((ctx.sampleRate * 60) / this.bpm));
    const barSamples = beatSamples * BEATS_PER_BAR;
    const playedSamples = Math.max(0, (this.lastActivity - this.anchorTime) * ctx.sampleRate);
    this.loopBars = Math.max(1, Math.round(playedSamples / barSamples));
    this.loopBeats = this.loopBars * BEATS_PER_BAR;
    this.loopLenSamples = this.loopBars * barSamples;

    // Wrap-add the captured audio into the loop buffer: anything past loopLenSamples
    // (the note tail) folds onto the start, so the tail rings into bar 1 of the loop.
    const buf = ctx.createBuffer(2, this.loopLenSamples, ctx.sampleRate);
    wrapAdd(buf.getChannelData(0), left, this.loopLenSamples);
    wrapAdd(buf.getChannelData(1), right, this.loopLenSamples);

    // The loop's phase 0 is the first note (anchorTime, set in noteStarted). Start
    // the looping source on the next loop boundary so playback is seamless.
    const startAt = this.nextBoundary();
    this.pushTrack(buf, startAt);
    this.stopMetronome();
    this.startDisplayTimer();
    this.persist();
  }

  // Start a take (master OR overdub) with the same locked flow: suspend the rig, click a 4-beat
  // count-in, then at the downbeat rewind the rig to bar 1 + resume AND begin capturing. Because the
  // capture and the rig both start at that one downbeat, the loop locks to the beat by construction.
  // The master (no existing layers) records until you finalize (length snaps to bars); an overdub
  // replays the existing layers from bar 1 and records one loop's worth. recTrack = the layer index
  // (0 = master), so finalize knows which path to take.
  private beginTake(): void {
    const ctx = this.ctx!;
    this.transport?.suspend(); // halt the rig for the count-in
    this.stopAllSources(); // existing layers go silent during the count-in (none for the master)
    this.stopMetronome();

    const beat = this.beatSec();
    const t0 = ctx.currentTime + 0.12; // first count-in click
    for (let k = 0; k < COUNT_IN_BEATS; k++) this.clickSound(t0 + k * beat, k === 0);
    // tick the on-screen countdown 4 -> 1 on each count-in beat
    for (let k = 0; k < COUNT_IN_BEATS; k++) this.scheduleAt(t0 + k * beat, () => this.dispatch({ type: 'countBeat', beatsLeft: COUNT_IN_BEATS - k }));

    const downbeat = t0 + COUNT_IN_BEATS * beat; // the loop's bar 1
    this.anchorTime = downbeat;
    this.lastActivity = downbeat; // master length measured from bar 1 (bumped as notes play)
    this.restartTracks(downbeat); // existing layers replay from bar 1, in sync (no-op for the master)
    this.scheduleAt(downbeat, () => this.dispatch({ type: 'downbeat' }));
  }

  // Bar 1 of a take: the rig replays from the top and a contiguous capture starts at phase 0.
  private startCapture(): void {
    this.transport?.resumeFromTop();
    this.masterChunks = [[], []];
    this.capturedSamples = 0;
    this.startMetronome(this.anchorTime);
    this.startDisplayTimer();
  }

  // Stop every layer's source (keeping its buffer + gain slot) - used by the
  // joystick-down stop and the overdub count-in.
  private stopAllSources(): void {
    for (const t of this.tracks) {
      try {
        t.source.stop();
        t.source.disconnect();
        t.gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
  }
  // Re-create every layer's source from its retained buffer and start it at `at`, so
  // all layers play from bar 1 in lockstep. STOPS the current sources first - that is
  // what prevents "zombie" tracks: replacing t.source without stopping the old one
  // (e.g. when the `stopped` flag had gone stale) left it playing + untracked, so no
  // stop/clear could reach it.
  private restartTracks(at: number): void {
    this.stopAllSources();
    for (const t of this.tracks) {
      const { source, gain } = this.startLoop(t.buffer, at);
      t.source = source;
      t.gain = gain;
    }
  }

  // Create a Track from a freshly-recorded buffer, keeping its ORIGINAL PCM + record tempo so it can
  // be time-stretched to a new tempo later (always from the original, never a prior stretch).
  private pushTrack(buf: AudioBuffer, at: number): void {
    const { source, gain } = this.startLoop(buf, at);
    this.tracks.push({
      source,
      gain,
      buffer: buf,
      orig: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()],
      recordBpm: this.bpm,
    });
  }
  private scheduleAt(time: number, fn: () => void): void {
    const ms = Math.max(0, (time - this.ctx!.currentTime) * 1000);
    const id = setTimeout(() => {
      this.pendingTimers = this.pendingTimers.filter((t) => t !== id);
      fn();
    }, ms);
    this.pendingTimers.push(id);
  }
  private clearPendingTimers(): void {
    for (const id of this.pendingTimers) clearTimeout(id);
    this.pendingTimers = [];
  }

  private finalizeOverdub(): void {
    this.clearPendingTimers();
    const ctx = this.ctx!;
    // The overdub was captured contiguously from the downbeat (phase 0). Place its
    // first loop's worth at phase 0 (truncate/pad) - a clean, jitter-free layer.
    const left = concat(this.masterChunks[0]);
    const right = concat(this.masterChunks[1]);
    this.masterChunks = [[], []];
    const buf = ctx.createBuffer(2, this.loopLenSamples, ctx.sampleRate);
    copyInto(buf.getChannelData(0), left);
    copyInto(buf.getChannelData(1), right);
    this.pushTrack(buf, this.nextBoundary());
    this.stopMetronome();
    this.persist();
  }

  private startLoop(buf: AudioBuffer, at: number, offset = 0): { source: AudioBufferSourceNode; gain: GainNode } {
    const { source, gain } = this.makeLayer(buf);
    source.start(at, offset);
    return { source, gain };
  }
  // Build a layer's source + per-layer gain wired to the loop bus, WITHOUT starting it
  // (a restored loop comes up stopped; startLoop adds the `start`).
  private makeLayer(buf: AudioBuffer): { source: AudioBufferSourceNode; gain: GainNode } {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this.loopOut!);
    return { source, gain };
  }

  // --- persistence (the recorded loops, to a LooperStore / IndexedDB) ----------
  // Snapshot every layer's PCM + the loop geometry. Null when there is nothing to keep.
  private serialize(): SerializedLooper | null {
    if (!this.ctx || this.tracks.length === 0 || this.loopLenSamples === 0) return null;
    return {
      v: 1,
      sampleRate: this.ctx.sampleRate,
      loopLenSamples: this.loopLenSamples,
      loopBeats: this.loopBeats,
      loopBars: this.loopBars,
      bpm: this.bpm,
      tracks: this.tracks.map((t) => ({
        channels: [
          new Float32Array(t.buffer.getChannelData(0)),
          new Float32Array(t.buffer.getChannelData(1)),
        ],
      })),
    };
  }
  private persist(): void {
    if (!this.store) return;
    const state = this.serialize();
    if (state) this.store.save(state);
    else this.store.clear();
  }
  // Rebuild the saved layers into AudioBuffers and come up STOPPED (loaded, halted): the
  // user pulls the joystick down to start them. Skipped if a fresh recording already
  // started (a race between the async load and the user hitting record).
  private restore(data: SerializedLooper): void {
    if (!this.ensureGraph()) return;
    this.restoring = data;
    this.dispatch({ type: 'restored', layers: data.tracks.length });
    this.restoring = null;
  }

  private applyRestore(data: SerializedLooper): void {
    const ctx = this.ctx!;
    this.loopLenSamples = data.loopLenSamples;
    this.loopBeats = data.loopBeats;
    this.loopBars = data.loopBars;
    this.bpm = data.bpm;
    for (const t of data.tracks) {
      const buf = ctx.createBuffer(2, data.loopLenSamples, data.sampleRate);
      buf.getChannelData(0).set(t.channels[0].subarray(0, data.loopLenSamples));
      buf.getChannelData(1).set(t.channels[1].subarray(0, data.loopLenSamples));
      // an idle (un-started) source: the stopped state holds the buffer; a restart
      // (joystick-down) recreates a playing source from it.
      const { source, gain } = this.makeLayer(buf);
      // treat the saved (record-tempo) PCM as this layer's original for future stretching
      this.tracks.push({
        source,
        gain,
        buffer: buf,
        orig: [t.channels[0].slice(0, data.loopLenSamples), t.channels[1].slice(0, data.loopLenSamples)],
        recordBpm: data.bpm,
      });
    }
  }

  // The next loop boundary (a multiple of the loop length from the anchor) at or
  // after now - where a freshly recorded layer should begin so it is phase-locked.
  private nextBoundary(): number {
    const ctx = this.ctx!;
    const lenSec = this.loopLenSamples / ctx.sampleRate;
    const elapsed = ctx.currentTime - this.anchorTime;
    return this.anchorTime + Math.max(0, Math.ceil(elapsed / lenSec)) * lenSec;
  }

  // Stop a layer. With `fade`, ramp its gain down over ~30ms first so deleting a
  // layer mid-loop doesn't click; otherwise stop immediately (a full reset).
  private stopTrack(t: Track, fade: boolean): void {
    const ctx = this.ctx;
    if (fade && ctx) {
      t.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.01);
      t.source.onended = () => {
        try {
          t.source.disconnect();
          t.gain.disconnect();
        } catch {
          /* already gone */
        }
      };
      try {
        t.source.stop(ctx.currentTime + 0.08);
      } catch {
        /* already stopped */
      }
      return;
    }
    try {
      t.source.stop();
      t.source.disconnect();
      t.gain.disconnect();
    } catch {
      /* already stopped */
    }
  }

  // --- the audio-thread tap ------------------------------------------------
  private ensureGraph(): boolean {
    if (this.script) return true;
    const g = this.synth.audioGraph();
    if (!g) return false;
    this.ctx = g.ctx;
    this.live = g.live;
    this.loopOut = g.loopOut;
    const script = this.ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
    script.onaudioprocess = (e) => this.process(e);
    // ScriptProcessor only runs while connected to the destination; route its
    // (unused) output through a silent gain so it pulls without making sound. The
    // gain stays alive via its connection in the graph (script -> sink -> out).
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.live.connect(script);
    script.connect(sink);
    sink.connect(this.ctx.destination);
    this.script = script;
    return true;
  }

  private process(e: AudioProcessingEvent): void {
    const p = this.state.phase;
    if (p.kind !== 'capturing') return;
    // An overdub starts capturing exactly on the loop downbeat (after the count-in),
    // so it is a plain CONTIGUOUS recording of one loop from phase 0 - no per-block
    // phase math (which jittered off playbackTime and left discontinuities a sharp
    // drum hit exposed). Stop once we have a full loop: one clean pass from bar 1.
    if (p.track > 0 && this.capturedSamples >= this.loopLenSamples) return;
    const inBuf = e.inputBuffer;
    const inL = inBuf.getChannelData(0);
    const inR = inBuf.numberOfChannels > 1 ? inBuf.getChannelData(1) : inL;
    this.masterChunks[0].push(new Float32Array(inL));
    this.masterChunks[1].push(new Float32Array(inR));
    this.capturedSamples += inL.length;
  }

  // --- metronome -----------------------------------------------------------
  // Clicks on the beat while arming + recording so layers stay in time. Once a loop
  // exists, the click interval is the loop's own beat (loopLen / loopBeats) so it
  // can never drift against the loop, even if the tempo knob moves afterward.
  private beatSec(): number {
    if (this.loopBeats > 0 && this.loopLenSamples > 0 && this.ctx)
      return this.loopLenSamples / this.loopBeats / this.ctx.sampleRate;
    return 60 / this.bpm;
  }
  private startMetronome(anchor: number): void {
    this.stopMetronome();
    if (!this.ctx) return;
    this.metroAnchor = anchor;
    this.metroBeat = Math.max(0, Math.ceil((this.ctx.currentTime - anchor) / this.beatSec()));
    this.metroTimer = setInterval(() => this.scheduleClicks(), LOOKAHEAD_MS);
    this.scheduleClicks();
  }
  private stopMetronome(): void {
    if (this.metroTimer !== null) {
      clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
    this.killFutureClicks(); // drop any clicks the scheduler already queued ahead
  }
  private scheduleClicks(): void {
    if (!this.ctx) return;
    const b = this.beatSec();
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD;
    // Accents must land on the TRUE bar grid (1-2-3-4 | 1-2-3-4). Once a loop exists
    // we count beats from the loop's first-note anchor, NOT from this metronome's own
    // anchor - an overdub's metronome restarts on whatever beat boundary is nearest,
    // which may fall mid-bar, and keying the accent off it would drop/shift the accent
    // for later tracks. Before a loop is set (the count-in), the metronome anchor IS
    // the grid origin, so either reference agrees.
    const accentRef = this.loopBars > 0 ? this.anchorTime : this.metroAnchor;
    let t = this.metroAnchor + this.metroBeat * b;
    while (t < horizon) {
      const beatIdx = Math.round((t - accentRef) / b);
      this.clickSound(t, (((beatIdx % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) === 0);
      this.metroBeat++;
      t = this.metroAnchor + this.metroBeat * b;
    }
  }
  private clickSound(at: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1000;
    const g = ctx.createGain();
    const peak = accent ? 0.16 : 0.1;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    osc.connect(g);
    g.connect(this.loopOut!); // untapped bus => never recorded
    osc.start(at);
    osc.stop(at + 0.06);
    this.clickNodes.push({ osc, at });
    osc.onended = () => {
      this.clickNodes = this.clickNodes.filter((c) => c.osc !== osc);
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  // Silence any click scheduled in the FUTURE (not yet started). Cancelling an arm /
  // overdub count-in this way is what stops rapid taps from stacking overlapping clicks.
  private killFutureClicks(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const c of this.clickNodes) {
      if (c.at > now) {
        try {
          c.osc.stop();
        } catch {
          /* already stopped */
        }
      }
    }
  }
}

// Concatenate the captured input blocks into one contiguous buffer.
function concat(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Fold `src` into `dst` (length `len`) with wraparound: samples past `len` add onto
// the start, so a note's release/reverb tail recorded past the loop boundary bleeds
// into bar 1 instead of lengthening the loop. (If src is shorter, the rest stays 0.)
function wrapAdd(dst: Float32Array, src: Float32Array, len: number): void {
  if (len <= 0) return;
  for (let i = 0; i < src.length; i++) dst[i % len] += src[i];
}

// Copy `src` into `dst`, truncating or zero-padding to dst's length (an overdub is one
// loop captured contiguously from phase 0, so its first loop's worth maps straight in).
function copyInto(dst: Float32Array, src: Float32Array): void {
  dst.set(src.length > dst.length ? src.subarray(0, dst.length) : src);
}
