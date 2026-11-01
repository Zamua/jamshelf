// LoopClone domain: a 5-track loop station (an RC-505-style looper). Each track holds a loop or not;
// at most ONE take is armed or capturing at a time, engine-wide. `next` is the only place either
// changes; the audio engine performs the effects it returns.

export const TRACK_COUNT = 5;

export const DEFAULT_LEVEL = 0.8; // fader 0..1

// What a track holds: nothing, a loop halted until pressed (a restore), or a loop sounding.
export type Content = 'empty' | 'stopped' | 'playing';

// The one take in flight. Armed waits for the next bar downbeat of a running transport.
export type Capture =
  | { readonly kind: 'idle' }
  | { readonly kind: 'armed'; readonly track: number; readonly overdub: boolean }
  | { readonly kind: 'capturing'; readonly track: number; readonly overdub: boolean };

export interface Station {
  readonly tracks: readonly Content[];
  readonly capture: Capture;
}

export type StationEvent =
  | { readonly type: 'button'; readonly track: number; readonly advancing: boolean } // the big round button
  | { readonly type: 'clear'; readonly track: number } // hold stop
  | { readonly type: 'downbeat' } // a bar downbeat of a running transport
  | { readonly type: 'loopFilled' } // the capture reached one loop length
  | { readonly type: 'history'; readonly track: number; readonly step: 'undo' | 'redo'; readonly result: 'loop' | 'empty' | 'none' } // what that step would leave
  | { readonly type: 'restored'; readonly present: readonly boolean[] }; // saved loops loaded

export type StationEffect =
  | { readonly kind: 'startCapture'; readonly track: number; readonly overdub: boolean }
  | { readonly kind: 'finishCapture'; readonly track: number; readonly overdub: boolean }
  | { readonly kind: 'discardCapture' }
  | { readonly kind: 'resume'; readonly track: number } // start a stopped loop
  | { readonly kind: 'clear'; readonly track: number }
  | { readonly kind: 'history'; readonly track: number; readonly step: 'undo' | 'redo' }
  | { readonly kind: 'restore' };

export interface Transition {
  readonly station: Station;
  readonly effects: readonly StationEffect[];
}

export const IDLE: Capture = { kind: 'idle' };

export function emptyStation(): Station {
  return { tracks: Array.from({ length: TRACK_COUNT }, (): Content => 'empty'), capture: IDLE };
}

const withTrack = (s: Station, i: number, c: Content): readonly Content[] => s.tracks.map((t, k) => (k === i ? c : t));
const capturedTrack = (c: Capture): number => (c.kind === 'idle' ? -1 : c.track);
const unchanged = (station: Station): Transition => ({ station, effects: [] });

// Close whatever take is in flight: an armed one is dropped, a capturing one becomes its track's loop.
function settleCapture(s: Station): Transition {
  const c = s.capture;
  switch (c.kind) {
    case 'idle':
      return unchanged(s);
    case 'armed':
      return unchanged({ ...s, capture: IDLE });
    case 'capturing':
      return {
        station: { tracks: withTrack(s, c.track, 'playing'), capture: IDLE },
        effects: [{ kind: 'finishCapture', track: c.track, overdub: c.overdub }],
      };
  }
}

// Start a take on track i: at the next downbeat when the transport runs, else right away.
function take(s: Station, i: number, overdub: boolean, advancing: boolean): Transition {
  if (advancing) return unchanged({ ...s, capture: { kind: 'armed', track: i, overdub } });
  return { station: { ...s, capture: { kind: 'capturing', track: i, overdub } }, effects: [{ kind: 'startCapture', track: i, overdub }] };
}

function press(s: Station, i: number, advancing: boolean): Transition {
  if (capturedTrack(s.capture) === i) return settleCapture(s); // close or cancel this track's take
  // pressing another track closes the take in flight first (one take at a time)
  const settled = settleCapture(s);
  const t = settled.station;
  let rest: Transition;
  switch (t.tracks[i]) {
    case 'empty':
      rest = take(t, i, false, advancing);
      break;
    case 'playing':
      rest = take(t, i, true, advancing);
      break;
    case 'stopped':
      rest = { station: { ...t, tracks: withTrack(t, i, 'playing') }, effects: [{ kind: 'resume', track: i }] };
      break;
  }
  return { station: rest.station, effects: [...settled.effects, ...rest.effects] };
}

export function next(s: Station, e: StationEvent): Transition {
  switch (e.type) {
    case 'button':
      return press(s, e.track, e.advancing);
    case 'downbeat':
      if (s.capture.kind !== 'armed') return unchanged(s);
      return {
        station: { ...s, capture: { kind: 'capturing', track: s.capture.track, overdub: s.capture.overdub } },
        effects: [{ kind: 'startCapture', track: s.capture.track, overdub: s.capture.overdub }],
      };
    case 'loopFilled':
      return s.capture.kind === 'capturing' ? settleCapture(s) : unchanged(s);
    case 'clear': {
      // a take on this track is abandoned, not kept
      const dropped = capturedTrack(s.capture) === e.track;
      const effects: StationEffect[] = dropped && s.capture.kind === 'capturing' ? [{ kind: 'discardCapture' }] : [];
      return {
        station: { tracks: withTrack(s, e.track, 'empty'), capture: dropped ? IDLE : s.capture },
        effects: [...effects, { kind: 'clear', track: e.track }],
      };
    }
    case 'history':
      // never rewrite a track mid-take; 'none' = nothing on that stack
      if (capturedTrack(s.capture) === e.track || e.result === 'none') return unchanged(s);
      return {
        station: { ...s, tracks: withTrack(s, e.track, e.result === 'loop' ? 'playing' : 'empty') },
        effects: [{ kind: 'history', track: e.track, step: e.step }],
      };
    case 'restored':
      // a take already started this session wins over the saved loops
      if (s.capture.kind !== 'idle' || s.tracks.some((t) => t !== 'empty')) return unchanged(s);
      return { station: { ...s, tracks: s.tracks.map((_, i): Content => (e.present[i] ? 'stopped' : 'empty')) }, effects: [{ kind: 'restore' }] };
  }
}

// What a track shows: its take when one is in flight on it, else what it holds.
export type TrackState = 'empty' | 'recording' | 'playing' | 'overdub' | 'stopped';

export function trackState(s: Station, i: number): TrackState {
  const c = s.capture;
  if (capturedTrack(c) === i && c.kind !== 'idle') {
    if (c.kind === 'armed') return c.overdub ? s.tracks[i] : 'recording'; // an armed record shows as recording
    return c.overdub ? 'overdub' : 'recording';
  }
  return s.tracks[i];
}
