// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - signalsmith-stretch ships no types; the runtime API is documented in its README.
import SignalsmithStretch from 'signalsmith-stretch';

// Pitch-preserving time-stretch of a recorded loop to a new tempo (Signalsmith Stretch, MIT).
// A loop recorded at `fromBpm` is re-rendered to play in time at `toBpm` WITHOUT changing pitch, so
// it stays locked to the (sequenced, already-following) drums. Offline: we render a stretched copy
// off the audio thread and hand back a plain PCM buffer the looper plays through its normal source -
// so the live playback path is unchanged. Always stretch from the ORIGINAL record-tempo PCM, never
// a prior stretch, so there is no cumulative artifact.
//
// `rate` is Signalsmith's playback rate: rate > 1 = faster/shorter. To play a loop at a higher tempo
// it must get shorter, so rate = toBpm / fromBpm. The output loop length in samples is therefore
// round(inputLen * fromBpm / toBpm) - exactly one bar-grid period at the new tempo.

const TAIL_SEC = 0.5; // extra render room for the algorithm's latency, trimmed off the front

// Render `channels` (one Float32Array per channel, one loop period at fromBpm) stretched to toBpm.
// Returns one seamless loop period per channel at the new tempo. `fromBpm === toBpm` is a cheap copy.
export async function stretchLoop(
  channels: Float32Array[],
  sampleRate: number,
  fromBpm: number,
  toBpm: number,
): Promise<Float32Array[]> {
  const inLen = channels[0]?.length ?? 0;
  if (inLen === 0 || fromBpm === toBpm) return channels.map((c) => c.slice());

  const rate = toBpm / fromBpm;
  const outLen = Math.max(1, Math.round(inLen / rate));
  const inSec = inLen / sampleRate;
  const tail = Math.ceil(sampleRate * TAIL_SEC);

  // Render THREE output periods with the input auto-looping, then take the SECOND one. The first
  // period absorbs the stretcher's warm-up + sub-ms latency; by the second it's in steady state
  // across the loop point, so that period tiles seamlessly when the looper plays it on repeat.
  const octx = new OfflineAudioContext(channels.length, outLen * 3 + tail, sampleRate);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const st: any = await SignalsmithStretch(octx);
  st.connect(octx.destination);
  // AWAIT: addBuffers/schedule reach the worklet over its MessagePort; without awaiting, the offline
  // render fires before the worklet has the audio + would produce silence.
  await st.addBuffers(channels);
  st.schedule({ active: true, input: 0, rate, semitones: 0, loopStart: 0, loopEnd: inSec, output: 0 });
  await new Promise((res) => setTimeout(res, 60)); // let the schedule message land before rendering
  const rendered = await octx.startRendering();

  const start = outLen; // second period (steady state)
  return channels.map((_, ch) => {
    const out = new Float32Array(outLen);
    out.set(rendered.getChannelData(ch).subarray(start, start + outLen));
    return out;
  });
}
