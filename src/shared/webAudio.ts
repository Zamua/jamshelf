// Web Audio helpers every audio adapter shares.

// A new AudioContext (older iOS Safari ships it only as webkitAudioContext).
export function newAudioContext(): AudioContext {
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new C();
}

// Call inside a user gesture: iOS Safari keeps a context silent until a sound starts in one, so a
// 1-sample silent buffer plays, and a suspended context resumes.
export function unlockAudio(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    /* best-effort: the resume below still runs */
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
