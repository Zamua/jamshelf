// LoopClone domain: a 5-track loop station (an RC-505-style looper), I/O-free + unit-tested. Each
// track is an independent loop with a simple state machine driven by one button (the big round
// record/play button) plus a stop. NO audio here - this is the pure timing/state model; the audio
// adapter renders it later.

export const TRACK_COUNT = 5;

// A track's lifecycle. The big round button cycles empty -> recording -> playing -> overdub ->
// playing -> overdub ... ; stop halts to `stopped`; clear empties it.
export type TrackState = 'empty' | 'recording' | 'playing' | 'overdub' | 'stopped';

export interface Track {
  readonly state: TrackState;
  readonly level: number; // fader 0..1
}

export const DEFAULT_LEVEL = 0.8;

export function emptyTrack(): Track {
  return { state: 'empty', level: DEFAULT_LEVEL };
}

// The big round button press: record the empty track, then loop it, then toggle overdub/playing.
export function nextOnButton(state: TrackState): TrackState {
  switch (state) {
    case 'empty':
      return 'recording';
    case 'recording':
      return 'playing'; // close the loop, start playing it
    case 'playing':
      return 'overdub';
    case 'overdub':
      return 'playing';
    case 'stopped':
      return 'playing'; // resume a stopped loop
  }
}

// The stop button: halt a live track; an empty track stays empty.
export function onStop(state: TrackState): TrackState {
  return state === 'empty' ? 'empty' : 'stopped';
}

// Whether a track currently holds recorded audio (anything but empty).
export function hasContent(state: TrackState): boolean {
  return state !== 'empty';
}

// Whether a track is actively producing sound right now (playing or overdubbing).
export function isLive(state: TrackState): boolean {
  return state === 'playing' || state === 'overdub';
}
