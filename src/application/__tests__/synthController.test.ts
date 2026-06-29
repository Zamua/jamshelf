import { describe, it, expect, beforeEach } from 'vitest';
import { SynthController } from '../synthController';
import { midiToFreq, type PlayMode } from '../../domain/music';
import { FakeClock, SpySynth } from './fakes';

// C major triad (degree 1, C major, octave 0) = MIDI 60/64/67.
const C = midiToFreq(60);
const E = midiToFreq(64);
const G = midiToFreq(67);

let synth: SpySynth;
let clock: FakeClock;
let c: SynthController;

beforeEach(() => {
  synth = new SpySynth();
  clock = new FakeClock();
  c = new SynthController(synth, clock);
});

// Drive a mode change through the public MODE menu, cycling from the CURRENT mode.
const MODE_ORDER: PlayMode[] = ['PLAY', 'STRUM', 'ARP', 'DRONE', 'REPEAT', 'LEAD'];
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

  it('pressing the same menu button closes it; the other switches', () => {
    c.toggleMenu('KEY');
    expect(c.getState().menuOpen).toBe(true);
    c.toggleMenu('MODE'); // switch
    expect(c.getState().menuKind).toBe('MODE');
    c.toggleMenu('MODE'); // close
    expect(c.getState().menuOpen).toBe(false);
  });
});
