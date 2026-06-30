import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Stage } from '../stage/Stage';
import { useSynth } from '../instruments/hichord/ui/hooks/useSynth';
import { BODY_THEMES } from '../instruments/hichord/ui/three/palette';
import { Manual } from '../instruments/hichord/ui/components/Manual';
import type { DeviceHandlers } from '../instruments/hichord/ui/three/deviceProps';
import { INSTRUMENTS, instrumentById } from '../instruments/registry';
import './experience.css';

const NOOP_HANDLERS: DeviceHandlers = {
  resume() {},
  onPadDown() {},
  onPadMove() {},
  onPadUp() {},
  onJoyMove() {},
  onJoyEnd() {},
  onJoyClick() {},
  onJoyHold() {},
  onKey() {},
  onSound() {},
  onTempo() {},
  onPower() {},
  onVolume() {},
  onInspectToggle() {},
  onHelpToggle() {},
  onSwapColor() {},
};
const FLOAT_MS = 1250; // matches the Stage's float DURATION; the device plays after it lands

// The whole experience: ONE persistent 3D stage with the shelf + the desk, plus the
// HTML chrome cross-faded over it. The route (`/` vs `/<id>`) only sets the mode; the
// device + camera float continuously between the shelf and the desk - no remount, no cut.
// (Single instrument for now: the stage hosts the HiClone directly; generalize when a
// second instrument lands.)
export function Experience() {
  const navigate = useNavigate();
  const location = useLocation();
  const { vm, handlers } = useSynth();
  const [manualOpen, setManualOpen] = useState(false);
  const hero = INSTRUMENTS[0];

  const id = location.pathname.replace(/^\//, '');
  const valid = !id || !!instrumentById(id); // '/' or a known instrument
  const mode: 'shelf' | 'play' = id && instrumentById(id) ? 'play' : 'shelf';

  // An unknown path falls back to the shelf.
  useEffect(() => {
    if (!valid) navigate('/', { replace: true });
  }, [valid, navigate]);

  // The device only becomes interactive once it has landed on the desk (after the float).
  const [interactive, setInteractive] = useState(mode === 'play');
  useEffect(() => {
    if (mode === 'play') {
      const t = setTimeout(() => setInteractive(true), FLOAT_MS);
      return () => clearTimeout(t);
    }
    setInteractive(false);
    setManualOpen(false);
  }, [mode]);

  const deviceHandlers = useMemo<DeviceHandlers>(
    () => ({ ...handlers, onHelpToggle: () => setManualOpen((o) => !o) }),
    [handlers],
  );
  const stageHandlers = interactive ? deviceHandlers : NOOP_HANDLERS;

  const play = () => {
    handlers.resume(); // build + unlock audio on the first gesture
    navigate(`/${hero.id}`);
  };
  const theme = BODY_THEMES[vm.themeIndex % BODY_THEMES.length];

  return (
    <div className="experience">
      <Stage mode={mode} vm={vm} handlers={stageHandlers} onShelfTap={play} />

      {/* shelf chrome */}
      <div className={'overlay shelf-chrome' + (mode === 'shelf' ? ' is-on' : '')}>
        <header className="shelf-title">jam<span>shelf</span></header>
        <button className="shelf-caption" onClick={play}>
          <span className="shelf-name">{hero.name}</span>
          <span className="shelf-blurb">{hero.blurb}</span>
          <span className="shelf-play">tap to play ▸</span>
        </button>
        <footer className="shelf-foot">more instruments coming soon</footer>
      </div>

      {/* play chrome */}
      <div className={'overlay play-chrome' + (mode === 'play' ? ' is-on' : '')}>
        <button className="back-to-shelf" onClick={() => navigate('/')} aria-label="Back to the shelf">
          ‹
        </button>
        <div className="tools">
          <button
            className="tool-btn tool-swatch"
            onClick={deviceHandlers.onSwapColor}
            aria-label="Swap the device color"
            title={theme.name}
            style={{ background: theme.body }}
          />
          <button
            className={'tool-btn' + (manualOpen ? ' is-active' : '')}
            onClick={() => setManualOpen((o) => !o)}
            aria-label="Toggle the how-to-play guide"
            aria-pressed={manualOpen}
          >
            ?
          </button>
        </div>
      </div>

      <Manual open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
