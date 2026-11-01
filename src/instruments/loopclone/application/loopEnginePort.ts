import { DEFAULT_LEVEL, TRACK_COUNT, type TrackState } from '../domain/loopStation';

export interface LoopTrackView {
  state: TrackState;
  level: number;
  muted: boolean;
  soloed: boolean;
}

// What the controller drives: record/play/overdub per track, mute, solo, levels, undo/redo.
export interface LoopEnginePort {
  button(i: number): void; // record -> play -> overdub -> play, or resume a stopped track
  stop(i: number): void; // mute, phase-preserving
  clear(i: number): void;
  solo(i: number): void;
  allStop(): void;
  setLevel(i: number, level: number): void;
  undo(i: number): void;
  redo(i: number): void;
  view(): LoopTrackView[];
  canUndo(i: number): boolean;
  onChange(cb: () => void): () => void; // async changes (a capture closing on the beat, a restore)
  dispose(): void;
}

// No audio graph to record from (a shelf thumbnail, tests): every track stays empty and silent.
export class NullLoopEngine implements LoopEnginePort {
  button(): void {}
  stop(): void {}
  clear(): void {}
  solo(): void {}
  allStop(): void {}
  setLevel(): void {}
  undo(): void {}
  redo(): void {}
  view(): LoopTrackView[] {
    return Array.from({ length: TRACK_COUNT }, () => ({ state: 'empty', level: DEFAULT_LEVEL, muted: false, soloed: false }));
  }
  canUndo(): boolean {
    return false;
  }
  onChange(): () => void {
    return () => {};
  }
  dispose(): void {}
}
