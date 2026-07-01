import type { AudioLooper, LooperMode, LooperView } from '../../application/ports';
import type { LooperStore, SerializedLooper } from '../../application/persistence';
import type { WebAudioSynth } from './webAudioSynth';

// An AUDIO loop recorder: it records the synth's rendered output (not note events)
// off a tap on the live bus, so every layer is frozen the instant it is captured -
// switching patch / play-mode / fx afterwards never alters a recorded loop.
//
// The state machine, driven by the joystick click (`toggle`):
//   idle  --click-->  armed   (waiting for the first key; nothing recorded yet)
//   armed --key---->  rec      (the FIRST key starts the master capture - no
//                               leading silence; that note is the loop's downbeat)
//   rec(master) --click--> play (master length is snapped to a whole number of
//                               beats so the metronome + overdubs lock to the loop)
//   play  --click-->  rec      (overdub: a new layer, recorded for one loop and
//                               aligned to the loop boundary - whole-track, not
//                               per-note quantize)
//   rec(overdub) --click--> play
// Long-press (`clear`) wipes every layer back to idle.
//
// A metronome clicks while arming + recording so layers can be played in time; it
// routes to the synth's loop bus, so it is never captured into a recording.

const MAX_TRACKS = 6;
const BEATS_PER_BAR = 4; // 4/4 - the master loop is snapped to whole bars
const BUFFER_SIZE = 2048; // ScriptProcessor block (~46ms @ 44.1k) - safe on iOS
const LOOKAHEAD_MS = 25; // metronome scheduler poll interval
const SCHEDULE_AHEAD = 0.12; // seconds of click events to schedule each poll

interface Track {
  source: AudioBufferSourceNode;
  gain: GainNode; // per-layer gain, so a layer can be faded out on delete (no click)
  buffer: AudioBuffer; // kept so the layer can be re-started (stop/resume, overdub count-in)
}

export class WebAudioLooper implements AudioLooper {
  private readonly synth: WebAudioSynth;
  private ctx: AudioContext | null = null;
  private live: AudioNode | null = null; // tap source (full live mix)
  private loopOut: AudioNode | null = null; // loop + metronome out (untapped)
  private script: ScriptProcessorNode | null = null;

  private mode: LooperMode = 'idle';
  private tracks: Track[] = [];
  private recTrack = -1;
  private selected = 0; // the layer the clear/redo cursor is on (during play)
  private bpm = 120;

  // capture: a growable list of input blocks (used for the master AND each overdub,
  // both recorded contiguously from their start point).
  private masterChunks: [Float32Array[], Float32Array[]] = [[], []];
  private capturedSamples = 0; // total samples captured this take (caps overdubs at 1 loop)
  private capturing = false; // copy input blocks this audio frame?

  private loopLenSamples = 0; // master loop length (defines every layer)
  private loopBeats = 0; // its length in whole beats (locks the metronome)
  private loopBars = 0; // its length in whole bars (BEATS_PER_BAR beats each)
  private anchorTime = 0; // ctx time of loop phase 0 (the first note)
  private lastActivity = 0; // ctx time of the last note on/off while recording the
  // master - the loop length quantizes to THIS (the notes), not the captured audio,
  // so a long release/reverb tail bleeds into the loop instead of adding a bar.
  private stopped = false; // joystick-down stop: layers halted (resume from the top)
  // In looper MODE: entered by a joystick click, exited by joystick UP. The click only
  // records/advances once you are IN the mode; UP halts playback + leaves. Loops are kept
  // (stopped) when you exit, so re-entering + a down-flick resumes them.
  private active = false;
  private countdown = 0; // overdub count-in clicks remaining (0 = not counting in)
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

  private listeners = new Set<() => void>();
  private readonly store: LooperStore | null;

  constructor(synth: WebAudioSynth, store?: LooperStore) {
    this.synth = synth;
    this.store = store ?? null;
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
    this.bpm = bpm;
  }

  view(): LooperView {
    let pos = 0;
    let bar = 0;
    let beat = 0;
    if (this.ctx && this.loopLenSamples > 0 && this.mode === 'play' && !this.stopped) {
      const lenSec = this.loopLenSamples / this.ctx.sampleRate;
      const t = (((this.ctx.currentTime - this.anchorTime) % lenSec) + lenSec) % lenSec;
      pos = t / lenSec;
      const beatIdx = Math.min(this.loopBeats - 1, Math.floor(pos * this.loopBeats));
      bar = Math.floor(beatIdx / BEATS_PER_BAR) + 1;
      beat = (beatIdx % BEATS_PER_BAR) + 1;
    }
    return {
      active: this.active,
      mode: this.mode,
      recTrack: this.recTrack,
      trackCount: this.tracks.length,
      selected: this.selected,
      loopBars: this.loopBars,
      bar,
      beat,
      stopped: this.stopped,
      countdown: this.countdown,
      posFraction: pos,
    };
  }

  selectTrack(dir: -1 | 1): void {
    if (this.mode !== 'play' || this.tracks.length === 0) return;
    const n = this.tracks.length;
    this.selected = (this.selected + dir + n) % n;
    this.emit();
  }

  // Joystick CLICK. The FIRST click ENTERS looper mode (no recording yet); once you are
  // in the mode, clicks run the record/stop cycle. Exit is a separate gesture (up).
  click(): void {
    if (!this.ensureGraph()) return;
    if (!this.active) {
      this.active = true; // enter looper mode
      this.emit();
      return;
    }
    switch (this.mode) {
      case 'idle':
        // arm the master; capture waits for the first key (noteStarted)
        this.mode = 'armed';
        this.recTrack = 0;
        this.startMetronome(this.ctx!.currentTime + 0.12);
        break;
      case 'armed':
        // cancel before any note was played
        this.mode = 'idle';
        this.recTrack = -1;
        this.stopMetronome();
        break;
      case 'rec':
        if (this.recTrack === 0)
          this.finalizeMaster();
        // a re-press DURING an overdub count-in (nothing recorded yet) abandons the new
        // layer and resumes playback - it does NOT finalize a near-empty bogus track.
        else if (this.countdown > 0) this.cancelOverdub();
        else this.finalizeOverdub();
        break;
      case 'play':
        if (this.tracks.length < MAX_TRACKS) this.startOverdub();
        break;
    }
    this.emit();
  }

  // Joystick UP: exit looper mode AND stop playback. Any in-progress take is finalized
  // (kept), then all layers halt; the loops stay recorded but stopped, so re-entering
  // (click) + a down-flick resumes them.
  exit(): void {
    if (!this.active) return;
    if (this.mode === 'armed') {
      this.mode = 'idle';
      this.recTrack = -1;
      this.stopMetronome();
    } else if (this.mode === 'rec') {
      if (this.recTrack === 0) this.finalizeMaster();
      else if (this.countdown > 0) this.cancelOverdub();
      else this.finalizeOverdub();
    }
    if (this.mode === 'play' && !this.stopped) {
      this.stopAllSources();
      this.stopped = true;
      this.stopDisplayTimer();
    }
    this.active = false;
    this.emit();
  }

  // Abandon an in-progress overdub count-in: kill the scheduled count-in clicks + the
  // pending capture-start. resume=true (a re-press) plays the existing layers again;
  // resume=false (a joystick-down) leaves them stopped.
  private cancelOverdub(resume = true): void {
    this.clearPendingTimers();
    this.killFutureClicks();
    this.capturing = false;
    this.capturedSamples = 0;
    this.masterChunks = [[], []];
    this.countdown = 0;
    this.recTrack = -1;
    this.mode = 'play';
    if (resume) {
      this.stopped = false;
      const at = this.ctx!.currentTime + 0.05;
      this.anchorTime = at;
      this.restartTracks(at); // existing layers (silenced for the count-in) play again
      this.startDisplayTimer();
    } else {
      // Pulled DOWN to cancel: the layers were already silenced for the count-in, so
      // leave them stopped (a later joystick-down resumes them, same as a normal stop).
      this.stopped = true;
      this.stopDisplayTimer();
    }
  }

  noteStarted(): void {
    if (!this.ctx) return;
    if (this.mode === 'armed') {
      // The first key of the master take: start capturing rendered audio NOW and make
      // this instant the loop's downbeat (re-anchor the metronome to it).
      this.mode = 'rec';
      this.recTrack = 0;
      this.masterChunks = [[], []];
      this.capturedSamples = 0;
      this.capturing = true;
      this.anchorTime = this.ctx.currentTime;
      this.lastActivity = this.anchorTime;
      this.startMetronome(this.anchorTime);
      this.emit();
    } else if (this.mode === 'rec' && this.recTrack === 0) {
      this.lastActivity = this.ctx.currentTime; // a note while recording the master
    }
  }
  // A pad release while recording the master - marks where the playing ended (the
  // loop quantizes to this, not to where the release/reverb tail finally decays).
  noteEnded(): void {
    if (this.mode === 'rec' && this.recTrack === 0 && this.ctx)
      this.lastActivity = this.ctx.currentTime;
  }

  // Joystick down: STOP all layers (resume restarts them from the top / bar 1). Pulled
  // DOWN during an overdub count-in instead CANCELS the pending recording and leaves the
  // existing layers stopped (the re-press path resumes them; down stops everything).
  toggleStop(): void {
    if (this.countdown > 0) {
      this.cancelOverdub(false);
      this.emit();
      return;
    }
    if (this.mode !== 'play') return;
    if (!this.stopped) {
      this.stopAllSources();
      this.stopped = true;
      this.stopDisplayTimer();
    } else {
      const at = this.ctx!.currentTime + 0.05;
      this.anchorTime = at;
      this.restartTracks(at);
      this.stopped = false;
      this.startDisplayTimer();
    }
    this.emit();
  }

  clear(): void {
    if (!this.active) return; // long-press only clears while you are in looper mode
    // While a loop plays, clear ONLY the selected layer - unless it's the master
    // (layer 0), which defines the loop length, so clearing it wipes everything.
    if (this.mode === 'play' && this.selected > 0 && this.selected < this.tracks.length) {
      const [t] = this.tracks.splice(this.selected, 1);
      this.stopTrack(t, true); // fade out so deleting a layer doesn't click
      this.selected = Math.min(this.selected, this.tracks.length - 1);
      this.persist();
      this.emit();
      return;
    }
    this.resetAll();
  }

  private resetAll(): void {
    this.clearPendingTimers();
    for (const t of this.tracks) this.stopTrack(t, false);
    this.tracks = [];
    this.mode = 'idle';
    this.recTrack = -1;
    this.selected = 0;
    this.capturing = false;
    this.capturedSamples = 0;
    this.masterChunks = [[], []];
    this.loopLenSamples = 0;
    this.loopBeats = 0;
    this.loopBars = 0;
    this.stopped = false;
    this.countdown = 0;
    this.stopMetronome();
    this.stopDisplayTimer();
    this.store?.clear(); // wiped everything -> drop the persisted loops too
    this.emit();
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
    this.capturing = false;
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
    this.tracks.push(this.startLoop(buf, startAt));
    this.selected = this.tracks.length - 1;
    this.recTrack = -1;
    this.mode = 'play';
    this.stopped = false;
    this.stopMetronome();
    this.startDisplayTimer();
    this.persist();
  }

  // Overdub with a 4-beat count-in: silence the existing layers, click 4 times, then
  // restart every layer from bar 1 AND begin capturing - all locked to the downbeat
  // after the count-in, so a new layer never waits a whole (e.g. 8-bar) loop to align.
  private startOverdub(): void {
    const ctx = this.ctx!;
    this.stopAllSources(); // layers go silent during the count-in
    this.stopMetronome();
    this.stopped = false; // recording an overdub clears any prior stop state
    this.recTrack = this.tracks.length;
    this.capturing = false; // not yet - wait out the count-in
    this.mode = 'rec';
    this.countdown = BEATS_PER_BAR;

    const beat = this.beatSec();
    const t0 = ctx.currentTime + 0.12; // first count-in click
    for (let k = 0; k < BEATS_PER_BAR; k++) this.clickSound(t0 + k * beat, k === 0);
    // tick the on-screen countdown 4 -> 1 on each count-in beat
    for (let k = 0; k < BEATS_PER_BAR; k++)
      this.scheduleAt(t0 + k * beat, () => {
        this.countdown = BEATS_PER_BAR - k;
        this.emit();
      });

    const downbeat = t0 + BEATS_PER_BAR * beat; // the loop's new bar 1
    this.anchorTime = downbeat;
    this.restartTracks(downbeat); // existing layers replay from the top, in sync
    this.scheduleAt(downbeat, () => {
      this.countdown = 0;
      this.stopped = false; // layers are audibly playing again from bar 1
      this.masterChunks = [[], []]; // contiguous capture, starting at phase 0
      this.capturedSamples = 0;
      this.capturing = true; // recording begins
      this.startMetronome(downbeat);
      this.startDisplayTimer();
      this.emit();
    });
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
      const fresh = this.startLoop(t.buffer, at);
      t.source = fresh.source;
      t.gain = fresh.gain;
    }
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
    this.capturing = false;
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
    this.tracks.push(this.startLoop(buf, this.nextBoundary()));
    this.selected = this.tracks.length - 1;
    this.recTrack = -1;
    this.mode = 'play';
    this.stopped = false;
    this.stopMetronome();
    this.persist();
  }

  private startLoop(buf: AudioBuffer, at: number): Track {
    const { source, gain } = this.makeLayer(buf);
    source.start(at);
    return { source, gain, buffer: buf };
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
    if (this.mode !== 'idle' || this.tracks.length > 0) return;
    if (!this.ensureGraph() || !this.ctx) return;
    const ctx = this.ctx;
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
      this.tracks.push({ source, gain, buffer: buf });
    }
    this.selected = this.tracks.length - 1;
    this.recTrack = -1;
    this.mode = 'play';
    this.stopped = true; // halted until the user starts them
    this.emit();
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
    if (!this.capturing) return;
    // An overdub starts capturing exactly on the loop downbeat (after the count-in),
    // so it is a plain CONTIGUOUS recording of one loop from phase 0 - no per-block
    // phase math (which jittered off playbackTime and left discontinuities a sharp
    // drum hit exposed). Stop once we have a full loop: one clean pass from bar 1.
    if (this.recTrack > 0 && this.capturedSamples >= this.loopLenSamples) return;
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
