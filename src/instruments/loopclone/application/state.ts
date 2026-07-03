import type { TrackState } from '../domain/loopStation';

// The observable view-model the 3D device renders. Plain + serializable.
export interface TrackVM {
  readonly state: TrackState;
  readonly level: number; // fader 0..1
}

export interface ViewModel {
  readonly power: boolean;
  readonly tracks: readonly TrackVM[]; // one per track (length TRACK_COUNT)
  readonly bpm: number;
  readonly playing: boolean; // shared transport running (the top-panel transport readout)
  readonly inspect: boolean;
}

export type Listener = (vm: ViewModel) => void;
