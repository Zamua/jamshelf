// LoopClone domain: a 5-track loop station (an RC-505-style looper). The big round button cycles a
// track empty -> recording -> playing -> overdub -> playing; a restored loop waits `stopped` until
// pressed. The audio engine owns the transitions, because they hinge on capture timing.

export const TRACK_COUNT = 5;

export type TrackState = 'empty' | 'recording' | 'playing' | 'overdub' | 'stopped';

export const DEFAULT_LEVEL = 0.8; // fader 0..1
