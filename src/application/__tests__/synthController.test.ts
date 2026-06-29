import { describe, it, expect, beforeEach } from 'vitest';
import { SynthController } from '../synthController';
import { midiToFreq, type PlayMode } from '../../domain/music';
import { FakeAudioLooper, FakeClock, SpySynth } from './fakes';

// C major triad (degree 1, C major, octave 0) = MIDI 60/64/67.
const C = midiToFreq(60);
const E = midiToFreq(64);
const G = midiToFreq(67);

let synth: SpySynth;
let clock: FakeClock;
let looper: FakeAudioLooper;
let c: SynthController;

beforeEach(() => {
  synth = new SpySynth();
  clock = new FakeClock();
  looper = new FakeAudioLooper();
  c = new SynthController(synth, clock, looper);
});

// Drive a mode change through the public MODE menu, cycling from the CURRENT mode.
const MODE_ORDER: PlayMode[] = ['PLAY', 'STRUM', 'ARP', 'DRONE', 'REPEAT', 'LEAD', 'DRUM'];
function switchMode(target: PlayMode) {
  c.toggleMenu('MODE'); // opens on the MODE field
  const cur = c.getState().mode;
  const steps =
    (MODE_ORDER.indexOf(target) - MODE_ORDER.indexOf(cur) + MODE_ORDER.length) % MODE_ORDER.length;
  for (let i = 0; i < steps; i++) c.editValue(1);
  c.toggleMenu('MODE'); // close
}

describe('construction', () => {
  it('wires the synth + clock and starts in PLAY', () => {
    expect(synth.vol).toBeCloseTo(0.8);
    expect(synth.strum).toBe(4); // near-zero PLAY spread
    expect(clock.bpm).toBe(120);
    expect(clock.running).toBe(false); // PLAY does not run the clock
    expect(c.getState().mode).toBe('PLAY');
    expect(looper.bpm).toBe(120); // the looper's metronome gets the tempo too
  });
});

describe('looper wiring', () => {
  it('the joystick click toggles and the long-press clears', () => {
    c.joyClick();
    expect(looper.toggles).toBe(1);
    c.joyHold();
    expect(looper.cleared).toBe(1);
  });

  it('every pad press signals the looper (so an armed take starts on the first key)', () => {
    c.pressPad('p1', 1);
    c.pressPad('p2', 3);
    expect(looper.notes).toBe(2);
  });

  it('does not toggle/clear while powered off or inspecting', () => {
    c.togglePower(); // off
    c.joyClick();
    c.joyHold();
    expect(looper.toggles).toBe(0);
    expect(looper.cleared).toBe(0);
  });

  it('editing BPM forwards the new tempo to the looper', () => {
    c.toggleMenu('MODE');
    // walk to the BPM field (PLAY mode: MODE, BPM) and bump it
    c.cursorField(1); // -> BPM
    c.editValue(1);
    expect(looper.bpm).toBe(121);
  });

  it('the OLED reflects armed / rec / play looper states', () => {
    looper.mode = 'armed';
    looper.emit();
    expect(c.getState().screenSmall).toBe('LOOP ARMED');
    looper.mode = 'rec';
    looper.recTrack = 0;
    looper.emit();
    expect(c.getState().screenBig).toBe('REC 1');
    looper.mode = 'play';
    looper.trackCount = 2;
    looper.selected = 1;
    looper.loopBars = 4;
    looper.bar = 2;
    looper.beat = 3;
    looper.emit();
    expect(c.getState().screenSmall).toBe('TRK 2/2 4BR');
    expect(c.getState().screenBig).toBe('BAR 2.3'); // live transport on the big line
  });

  it('forwards joystick layer-select to the looper, gated by power/inspect', () => {
    c.selectLoopTrack(1);
    c.selectLoopTrack(-1);
    expect(looper.selectDirs).toEqual([1, -1]);
    c.togglePower(); // off
    c.selectLoopTrack(1);
    expect(looper.selectDirs).toEqual([1, -1]); // ignored while powered off
  });

  it('forwards joystick-down stop to the looper, gated by power/inspect', () => {
    c.looperStop();
    expect(looper.stops).toBe(1);
    c.togglePower(); // off
    c.looperStop();
    expect(looper.stops).toBe(1); // ignored while powered off
  });

  it('signals note-ended to the looper on every pad release', () => {
    c.pressPad('p1', 1);
    c.releasePad('p1');
    expect(looper.ended).toBe(1);
  });

  it('the OLED shows the count-in countdown and the stopped state', () => {
    looper.mode = 'rec';
    looper.recTrack = 1;
    looper.countdown = 3;
    looper.emit();
    expect(c.getState().screenBig).toBe('COUNT 3');
    looper.countdown = 0;
    looper.emit();
    expect(c.getState().screenBig).toBe('REC 2');
    looper.mode = 'play';
    looper.trackCount = 1;
    looper.loopBars = 2;
    looper.stopped = true;
    looper.emit();
    expect(c.getState().screenBig).toBe('STOPPED');
  });
});

describe('PLAY mode', () => {
  it('plays the full chord on press and releases it on up', () => {
    c.pressPad('p1', 1);
    expect(synth.lastOn().id).toBe('p1');
    expect(synth.lastOn().freqs).toHaveLength(3);
    expect(synth.lastOn().freqs[0]).toBeCloseTo(C);
    c.releasePad('p1');
    expect(synth.off).toContain('p1');
  });

  it('glissando replaces the voice with the new chord', () => {
    c.pressPad('p1', 1);
    c.movePad('p1', 5);
    // same voice id re-triggered with the V chord (G major: G B D)
    expect(synth.lastOn().id).toBe('p1');
    expect(synth.lastOn().freqs[0]).toBeCloseTo(midiToFreq(67));
  });
});

describe('STRUM mode', () => {
  it('sets a real strum spread', () => {
    switchMode('STRUM');
    expect(synth.strum).toBe(80); // MED default
    c.pressPad('p1', 1);
    expect(synth.lastOn().freqs).toHaveLength(3);
  });
});

describe('DRONE mode', () => {
  it('latches: the chord keeps sounding after pad release', () => {
    switchMode('DRONE');
    c.pressPad('p1', 1);
    expect(synth.sounding.has('drone')).toBe(true);
    c.releasePad('p1');
    expect(synth.sounding.has('drone')).toBe(true); // still latched
    expect(c.getState().litPads).toEqual([1]);
  });
  it('pressing the same pad again stops it; a different pad switches', () => {
    switchMode('DRONE');
    c.pressPad('p1', 1);
    c.pressPad('p1', 1); // same degree -> stop
    expect(synth.sounding.has('drone')).toBe(false);
    c.pressPad('p2', 4); // latch IV
    expect(synth.sounding.has('drone')).toBe(true);
    expect(c.getState().litPads).toEqual([4]);
  });
});

describe('LEAD mode', () => {
  it('is monophonic and plays only the root', () => {
    switchMode('LEAD');
    c.pressPad('p1', 1);
    expect(synth.lastOn().id).toBe('lead');
    expect(synth.lastOn().freqs).toHaveLength(1);
    expect(synth.lastOn().freqs[0]).toBeCloseTo(C);
    c.pressPad('p2', 5); // newest wins
    expect(synth.lastOn().freqs[0]).toBeCloseTo(midiToFreq(67));
    c.releasePad('p2'); // falls back to the still-held p1
    expect(synth.lastOn().freqs[0]).toBeCloseTo(C);
    c.releasePad('p1');
    expect(synth.off).toContain('lead');
  });

  it('the OLED names the single NOTE, not the chord', () => {
    switchMode('LEAD');
    c.pressPad('p1', 1); // C major root = C4
    expect(c.getState().screenBig).toBe('C4');
    c.pressPad('p2', 5); // V chord root = G4
    expect(c.getState().screenBig).toBe('G4');
  });

  it('the joystick is a pitch bend in LEAD, ignored elsewhere, reset on mode change', () => {
    c.setLeadBend(150);
    expect(synth.bend).toBe(0); // PLAY: not a bend, ignored
    switchMode('LEAD');
    c.setLeadBend(150);
    expect(synth.bend).toBe(150);
    switchMode('PLAY'); // leaving LEAD clears the bend
    expect(synth.bend).toBe(0);
  });
});

describe('ARP mode', () => {
  it('runs the clock and steps through the pattern on ticks', () => {
    switchMode('ARP');
    expect(clock.running).toBe(false); // clock idles until a pad is held
    c.pressPad('p1', 1); // immediate first step (UP -> 60), starts the clock
    expect(clock.running).toBe(true);
    expect(synth.lastOn().id).toBe('arp');
    expect(synth.lastOn().freqs).toHaveLength(1);
    expect(synth.lastOn().freqs[0]).toBeCloseTo(C);
    clock.tick(); // -> 64
    expect(synth.lastOn().freqs[0]).toBeCloseTo(E);
    clock.tick(); // -> 67
    expect(synth.lastOn().freqs[0]).toBeCloseTo(G);
    clock.tick(); // wraps -> 60
    expect(synth.lastOn().freqs[0]).toBeCloseTo(C);
  });
  it('releases the arp when the last pad lifts (and the clock stops)', () => {
    switchMode('ARP');
    c.pressPad('p1', 1);
    c.releasePad('p1');
    expect(synth.off).toContain('arp');
    expect(clock.running).toBe(false); // nothing held: clock idles again
  });
});

describe('REPEAT mode', () => {
  it('re-triggers the held chord on every tick', () => {
    switchMode('REPEAT');
    c.pressPad('p1', 1);
    expect(clock.running).toBe(true); // starts on first press
    const before = synth.on.length;
    clock.tick();
    clock.tick();
    const repeats = synth.on.slice(before).filter((o) => o.id === 'p1');
    expect(repeats.length).toBe(2);
  });
});

describe('DRUM mode', () => {
  it('pads fire one-shot drums, not tonal chords', () => {
    switchMode('DRUM');
    c.pressPad('p1', 1);
    expect(synth.drums).toContain('KICK');
    c.pressPad('p2', 3);
    expect(synth.drums).toContain('SNARE');
    expect(synth.on).toHaveLength(0); // no chord notes in drum mode
    c.releasePad('p1'); // one-shots: release is a no-op
    expect(synth.off).toHaveLength(0);
  });
});

describe('clock lifecycle', () => {
  it('runs only in ARP/REPEAT while a pad is held', () => {
    switchMode('ARP');
    expect(clock.running).toBe(false); // armed mode but nothing held
    c.pressPad('p1', 1);
    expect(clock.running).toBe(true);
    switchMode('PLAY'); // clears held + stops the clock
    expect(clock.running).toBe(false);
    switchMode('REPEAT');
    c.pressPad('p2', 3);
    expect(clock.running).toBe(true);
  });
  it('power-off and inspect stop the clock and release everything', () => {
    switchMode('ARP');
    c.pressPad('p1', 1);
    c.togglePower(); // off
    expect(clock.running).toBe(false);
    expect(synth.releasedAll).toBeGreaterThan(0);
    expect(synth.muted).toBe(true);
  });
});

describe('menus', () => {
  it('KEY menu edits key / scale / octave', () => {
    c.toggleMenu('KEY');
    expect(c.getState().menuKind).toBe('KEY');
    c.editValue(1); // KEY field: C -> C#
    expect(c.getState().root).toBe(1);
    c.cursorField(1); // -> SCL
    c.editValue(1); // MAJOR -> next scale
    expect(c.getState().scale).not.toBe('MAJOR');
    c.cursorField(1); // -> OCT
    c.editValue(1);
    expect(c.getState().octave).toBe(1);
  });

  it('OCT reaches -2 (for the bass presets) and clamps there', () => {
    c.toggleMenu('KEY');
    c.cursorField(1); // SCL
    c.cursorField(1); // OCT
    c.editValue(-1);
    c.editValue(-1); // -> -2
    expect(c.getState().octave).toBe(-2);
    c.editValue(-1); // clamped at the floor
    expect(c.getState().octave).toBe(-2);
  });

  // The OLED's big line is ">FIELD value"; the active field label is what we read
  // back as we step the cursor through the menu.
  const activeField = () => c.getState().screenBig.split(' ')[0].slice(1);
  function walkFields(count: number): string[] {
    const seen: string[] = [];
    for (let i = 0; i < count; i++) {
      seen.push(activeField());
      c.cursorField(1);
    }
    return seen;
  }

  it('MODE menu exposes mode-specific fields (PATTERN+RATE only for ARP)', () => {
    switchMode('ARP');
    c.toggleMenu('MODE');
    expect(walkFields(4)).toEqual(['MODE', 'PATTERN', 'RATE', 'BPM']);
  });

  it('STRUM menu exposes SPEED, not PATTERN/RATE', () => {
    switchMode('STRUM');
    c.toggleMenu('MODE');
    expect(walkFields(3)).toEqual(['MODE', 'SPEED', 'BPM']);
  });

  it('DRUM menu exposes a KIT field', () => {
    switchMode('DRUM');
    c.toggleMenu('MODE');
    expect(walkFields(3)).toEqual(['MODE', 'KIT', 'BPM']);
  });

  it('the KEY menu FX field toggles delay/chorus on the synth', () => {
    c.toggleMenu('KEY');
    c.cursorField(1); // SCL
    c.cursorField(1); // OCT
    c.cursorField(1); // BASS
    c.cursorField(1); // FX
    c.editValue(1); // OFF -> DELAY
    expect(synth.fx.delay).toBe(true);
    expect(synth.fx.chorus).toBe(false);
    c.editValue(1); // DELAY -> CHORUS
    expect(synth.fx.delay).toBe(false);
    expect(synth.fx.chorus).toBe(true);
  });

  it('BASS ROOT (KEY menu) prepends a bass note two octaves under the root', () => {
    c.toggleMenu('KEY');
    c.cursorField(1); // SCL
    c.cursorField(1); // OCT
    c.cursorField(1); // BASS
    c.editValue(1); // OFF -> ROOT
    c.toggleMenu('KEY'); // close
    c.pressPad('p1', 1); // C major triad
    expect(synth.lastOn().freqs).toHaveLength(4); // bass + 3 chord tones
    expect(synth.lastOn().freqs[0]).toBeCloseTo(midiToFreq(36)); // C2 = root - 2 octaves
    expect(synth.lastOn().freqs[1]).toBeCloseTo(midiToFreq(60)); // then the chord root
  });

  it('yellow cycles the voice when idle, the inversion while a pad is held', () => {
    const patch0 = c.getState().patch;
    c.pressSound(); // nothing held -> cycle the synth voice
    expect(c.getState().patch).not.toBe(patch0);
    c.pressPad('p1', 1); // C major triad, root position (lowest = C4 = 60)
    c.pressSound(); // a pad is held -> cycle to 1st inversion (lowest = E4 = 64)
    expect(synth.lastOn().id).toBe('p1');
    expect(synth.lastOn().freqs[0]).toBeCloseTo(midiToFreq(64));
  });

  it('pressing the same menu button closes it; the other switches', () => {
    c.toggleMenu('KEY');
    expect(c.getState().menuOpen).toBe(true);
    c.toggleMenu('MODE'); // switch
    expect(c.getState().menuKind).toBe('MODE');
    c.toggleMenu('MODE'); // close
    expect(c.getState().menuOpen).toBe(false);
  });
});
