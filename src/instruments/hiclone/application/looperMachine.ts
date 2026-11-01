// The HiClone looper's lifecycle, pure. The audio looper (WebAudioLooper) holds the PCM, the timers
// and the graph; it sends every input here and performs the effects that come back, so this is the
// only place the looper's state changes.
//
//   idle --click--> countIn --downbeat--> capturing --click--> playing --click--> countIn (overdub)
//   playing <--toggleStop / follow--> halted;  countIn --click--> cancelled (resume)
//   exit (joystick up) closes any take and halts; clear wipes or drops the selected layer.

export const MAX_LAYERS = 6;
export const COUNT_IN_BEATS = 4;

export type Phase =
  | { readonly kind: 'idle' } // no loop recorded
  | { readonly kind: 'countIn'; readonly track: number; readonly beatsLeft: number } // the rig is halted, clicks count to bar 1
  | { readonly kind: 'capturing'; readonly track: number } // recording layer `track` (0 = the master)
  | { readonly kind: 'playing' }
  | { readonly kind: 'halted' }; // layers recorded, not sounding

export interface LooperState {
  readonly phase: Phase;
  readonly active: boolean; // in looper MODE: entered by a click, left by joystick up
  readonly layers: number;
  readonly selected: number; // the layer the clear cursor is on
}

export type LooperEvent =
  | { readonly type: 'click' }
  | { readonly type: 'exit' }
  | { readonly type: 'countBeat'; readonly beatsLeft: number } // a count-in click sounded
  | { readonly type: 'downbeat' } // the count-in reached bar 1
  | { readonly type: 'toggleStop' } // joystick down, solo
  | { readonly type: 'follow'; readonly playing: boolean; readonly beat: number } // the rig transport moved
  | { readonly type: 'select'; readonly dir: -1 | 1 }
  | { readonly type: 'clear' } // long press
  | { readonly type: 'restored'; readonly layers: number };

export type LooperEffect =
  | { readonly kind: 'beginTake'; readonly track: number } // halt the rig, count in, cue the layers for bar 1
  | { readonly kind: 'startCapture' } // bar 1: the rig restarts, capture + metronome begin
  | { readonly kind: 'finishTake'; readonly track: number } // the take becomes a layer (track 0 sets the length)
  | { readonly kind: 'cancelTake'; readonly resume: boolean } // drop the count-in; resume = restart from bar 1
  | { readonly kind: 'play'; readonly beat: number } // layers sound from `beat` beats into the loop
  | { readonly kind: 'halt' }
  | { readonly kind: 'dropLayer'; readonly index: number }
  | { readonly kind: 'wipe'; readonly resumeRig: boolean } // every layer gone
  | { readonly kind: 'restore' };

export interface LooperTransition {
  readonly state: LooperState;
  readonly effects: readonly LooperEffect[];
}

export const initialLooper: LooperState = { phase: { kind: 'idle' }, active: false, layers: 0, selected: 0 };

const stay = (state: LooperState): LooperTransition => ({ state, effects: [] });
const to = (state: LooperState, phase: Phase, ...effects: LooperEffect[]): LooperTransition => ({ state: { ...state, phase }, effects });

// A finished take is a new layer, and the cursor moves onto it.
function finishTake(s: LooperState, track: number): LooperTransition {
  return { state: { ...s, phase: { kind: 'playing' }, layers: s.layers + 1, selected: s.layers }, effects: [{ kind: 'finishTake', track }] };
}

// Abandon a count-in: back to where the take started, sounding again (resume) or left halted.
function cancelCountIn(s: LooperState, resume: boolean): LooperTransition {
  const phase: Phase = s.layers === 0 ? { kind: 'idle' } : resume ? { kind: 'playing' } : { kind: 'halted' };
  return to(s, phase, { kind: 'cancelTake', resume });
}

function click(s: LooperState): LooperTransition {
  if (!s.active) return stay({ ...s, active: true }); // the first click only enters looper mode
  const p = s.phase;
  switch (p.kind) {
    case 'idle':
      return to(s, { kind: 'countIn', track: 0, beatsLeft: COUNT_IN_BEATS }, { kind: 'beginTake', track: 0 });
    case 'countIn':
      return cancelCountIn(s, true); // a re-press before bar 1: nothing recorded, abandon
    case 'capturing':
      return finishTake(s, p.track);
    case 'playing':
    case 'halted':
      if (s.layers >= MAX_LAYERS) return stay(s);
      return to(s, { kind: 'countIn', track: s.layers, beatsLeft: COUNT_IN_BEATS }, { kind: 'beginTake', track: s.layers });
  }
}

// Joystick up: keep a take that is recording, drop one still counting in, halt, leave the mode.
function exit(s: LooperState): LooperTransition {
  if (!s.active) return stay(s);
  const p = s.phase;
  let t: LooperTransition;
  switch (p.kind) {
    case 'countIn':
      t = cancelCountIn(s, false);
      break;
    case 'capturing': {
      const done = finishTake(s, p.track);
      t = { state: { ...done.state, phase: { kind: 'halted' } }, effects: [...done.effects, { kind: 'halt' }] };
      break;
    }
    case 'playing':
      t = to(s, { kind: 'halted' }, { kind: 'halt' });
      break;
    case 'idle':
    case 'halted':
      t = stay(s);
      break;
  }
  return { state: { ...t.state, active: false }, effects: t.effects };
}

export function nextLooper(s: LooperState, e: LooperEvent): LooperTransition {
  const p = s.phase;
  switch (e.type) {
    case 'click':
      return click(s);
    case 'exit':
      return exit(s);
    case 'countBeat':
      return p.kind === 'countIn' ? to(s, { ...p, beatsLeft: e.beatsLeft }) : stay(s);
    case 'downbeat':
      return p.kind === 'countIn' ? to(s, { kind: 'capturing', track: p.track }, { kind: 'startCapture' }) : stay(s);
    case 'toggleStop':
      switch (p.kind) {
        case 'countIn':
          return cancelCountIn(s, false);
        case 'playing':
          return to(s, { kind: 'halted' }, { kind: 'halt' });
        case 'halted':
          return to(s, { kind: 'playing' }, { kind: 'play', beat: 0 }); // solo restarts from bar 1
        case 'idle':
        case 'capturing':
          return stay(s);
      }
      break;
    case 'follow':
      // only recorded loops ride the rig; a take runs its own flow
      if (p.kind === 'playing' && !e.playing) return to(s, { kind: 'halted' }, { kind: 'halt' });
      if (p.kind === 'halted' && e.playing) return to(s, { kind: 'playing' }, { kind: 'play', beat: e.beat });
      return stay(s);
    case 'select':
      if ((p.kind !== 'playing' && p.kind !== 'halted') || s.layers === 0) return stay(s);
      return stay({ ...s, selected: (s.selected + e.dir + s.layers) % s.layers });
    case 'clear':
      if (!s.active) return stay(s);
      // the master (layer 0) sets the loop length, so clearing it wipes everything
      if ((p.kind === 'playing' || p.kind === 'halted') && s.selected > 0 && s.selected < s.layers) {
        const layers = s.layers - 1;
        return { state: { ...s, layers, selected: Math.min(s.selected, layers - 1) }, effects: [{ kind: 'dropLayer', index: s.selected }] };
      }
      return { state: { ...initialLooper, active: true }, effects: [{ kind: 'wipe', resumeRig: p.kind === 'countIn' }] };
    case 'restored':
      // a take started before the saved loops loaded wins
      if (p.kind !== 'idle' || s.layers > 0 || e.layers === 0) return stay(s);
      return { state: { ...s, phase: { kind: 'halted' }, layers: e.layers, selected: e.layers - 1 }, effects: [{ kind: 'restore' }] };
  }
  return stay(s);
}
