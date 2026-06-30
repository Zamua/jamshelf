import { describe, it, expect } from 'vitest';
import { SynthController } from '../synthController';
import { FakeAudioLooper, FakeClock, MemorySettingsStore, SpySynth } from './fakes';
import { coerceSettings, type SettingsSnapshot } from '../persistence';

function make(store?: MemorySettingsStore) {
  return new SynthController(new SpySynth(), new FakeClock(), new FakeAudioLooper(), store);
}

const DEFAULTS: SettingsSnapshot = {
  v: 1,
  root: 0,
  scale: 'MAJOR',
  octave: 0,
  patch: 'SAW',
  bpm: 120,
  volume: 0.8,
  themeIndex: 0,
  mode: 'PLAY',
  arpPattern: 'UP',
  arpRate: '1/8',
  repeatRate: '1/8',
  strumSpeed: 'MED',
  bass: 'OFF',
  fx: 'OFF',
  glide: 'OFF',
  drumKit: 'TIGHT',
  inversion: 0,
};

describe('coerceSettings (pure validation)', () => {
  it('keeps valid fields and clamps numbers into range', () => {
    const s = coerceSettings(
      { ...DEFAULTS, scale: 'DORIAN', patch: 'NEON', octave: 9, volume: -1, bpm: 1000 },
      DEFAULTS,
    );
    expect(s.scale).toBe('DORIAN');
    expect(s.patch).toBe('NEON');
    expect(s.octave).toBe(2); // clamped to [-2, 2]
    expect(s.volume).toBe(0); // clamped to [0, 1]
    expect(s.bpm).toBe(240); // clamped to [40, 240]
  });

  it('falls back for unknown enums and non-objects', () => {
    expect(coerceSettings({ scale: 'NOPE', mode: 'ZZ' }, DEFAULTS)).toMatchObject({
      scale: 'MAJOR',
      mode: 'PLAY',
    });
    expect(coerceSettings(null, DEFAULTS)).toEqual(DEFAULTS);
    expect(coerceSettings('garbage', DEFAULTS)).toEqual(DEFAULTS);
  });
});

describe('settings persistence', () => {
  it('saves durable settings to the store as they change', () => {
    const store = new MemorySettingsStore();
    const c = make(store);

    c.setPatch('REESE');
    c.swapColor(); // themeIndex 0 -> 1
    c.toggleMenu('KEY');
    c.cursorField(1); // SCL
    c.cursorField(1); // OCT
    c.editValue(-1); // octave -> -1

    expect(store.saved?.patch).toBe('REESE');
    expect(store.saved?.themeIndex).toBe(1);
    expect(store.saved?.octave).toBe(-1);
    expect(store.saved?.v).toBe(1);
  });

  it('restores the saved settings into a fresh controller', () => {
    const store = new MemorySettingsStore();
    const c1 = make(store);
    c1.setPatch('NEON');
    c1.swapColor();
    c1.swapColor(); // themeIndex -> 2

    // a new controller (a "reload") sharing the store comes up with those settings
    const c2 = make(store);
    const vm = c2.getState();
    expect(vm.patch).toBe('NEON');
    expect(vm.themeIndex).toBe(2);
  });

  it('does not write to the store when nothing durable changed', () => {
    const store = new MemorySettingsStore();
    const c = make(store);
    const before = store.saves;
    // A pure morph is transient (quality is not persisted), so it must not hit storage.
    c.setQuality('7th');
    c.springToTriad();
    expect(store.saves).toBe(before);
  });

  it('ignores a corrupt / out-of-range payload and keeps safe defaults', () => {
    const bad = {
      v: 1,
      root: 999,
      scale: 'NONSENSE',
      octave: 50,
      patch: 'NOPE',
      bpm: -10,
      volume: 5,
      themeIndex: -3,
      mode: 'XYZ',
      arpPattern: 'ZZ',
      arpRate: '9/9',
      repeatRate: 'no',
      strumSpeed: 'huge',
      bass: 'maybe',
      fx: 'bad',
      glide: 'bad',
      drumKit: 'bad',
      inversion: 99,
    } as unknown as SettingsSnapshot;
    const store = new MemorySettingsStore(bad);
    const c = make(store);
    const vm = c.getState();
    // every field fell back to a valid default rather than the garbage
    expect(vm.scale).toBe('MAJOR');
    expect(vm.patch).toBe('SAW');
    expect(vm.mode).toBe('PLAY');
    expect(vm.octave).toBe(2); // clamped into [-2, 2]
    expect(vm.bpm).toBe(40); // clamped into [40, 240]
    expect(vm.volume).toBe(1); // clamped into [0, 1]
  });

  it('works with no store (persistence is optional)', () => {
    const c = make(); // no store
    expect(() => {
      c.setPatch('HUGE');
      c.swapColor();
    }).not.toThrow();
    expect(c.getState().patch).toBe('HUGE');
  });
});
