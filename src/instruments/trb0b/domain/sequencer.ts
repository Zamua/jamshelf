// Pure domain model for the TR-B0B step sequencer. No I/O, no framework imports. An unbranded
// TR-808-style drum machine: a fixed set of synth drum voices, each with a 16-step on/off pattern.

// The kit voices (unbranded 808 essentials). Order = top-to-bottom row order in the UI.
export type DrumVoice = 'BD' | 'SD' | 'LT' | 'CP' | 'CH' | 'OH' | 'CB' | 'CY';

export const VOICES: readonly DrumVoice[] = ['BD', 'SD', 'LT', 'CP', 'CH', 'OH', 'CB', 'CY'];

// Display names for each voice.
export const VOICE_LABEL: Record<DrumVoice, string> = {
  BD: 'BASS',
  SD: 'SNARE',
  LT: 'TOM',
  CP: 'CLAP',
  CH: 'HAT',
  OH: 'OPEN HAT',
  CB: 'COWBELL',
  CY: 'CYMBAL',
};

export const STEPS = 16;

// A pattern: for every voice, which of the 16 steps are active. Immutable value object; the pure
// helpers below return new patterns rather than mutating.
export type Pattern = Record<DrumVoice, boolean[]>;

export function emptyPattern(): Pattern {
  const p = {} as Pattern;
  for (const v of VOICES) p[v] = new Array(STEPS).fill(false);
  return p;
}

// Toggle one step of one voice, returning a new pattern (the voice's row is copied).
export function toggleStep(pattern: Pattern, voice: DrumVoice, step: number): Pattern {
  if (step < 0 || step >= STEPS) return pattern;
  const row = pattern[voice].slice();
  row[step] = !row[step];
  return { ...pattern, [voice]: row };
}

// Clear one voice's row (or the whole pattern if voice is omitted), returning a new pattern.
export function clearVoice(pattern: Pattern, voice?: DrumVoice): Pattern {
  if (!voice) return emptyPattern();
  return { ...pattern, [voice]: new Array(STEPS).fill(false) };
}

// The next step index, wrapping at STEPS.
export function nextStep(step: number): number {
  return (step + 1) % STEPS;
}

// Which voices have an active hit on the given step (what to trigger this tick).
export function voicesAtStep(pattern: Pattern, step: number): DrumVoice[] {
  return VOICES.filter((v) => pattern[v][step]);
}

// True if the whole pattern is empty (no active steps) - the sequencer can idle silently.
export function isEmpty(pattern: Pattern): boolean {
  return VOICES.every((v) => pattern[v].every((s) => !s));
}
