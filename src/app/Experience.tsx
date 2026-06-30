import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Stage } from '../stage/Stage';
import { EyeIcon } from './EyeIcon';
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

  // Eye button: float the device up + let the user spin it. `spin` holds the drag-accumulated
  // rotation (x = tilt, y = turn) plus its angular velocity (vx/vy) so a flick coasts; the
  // stage reads + advances it every frame. Reset each time inspect opens.
  const [inspect, setInspect] = useState(false);
  const spin = useRef({ x: 0, y: 0, vx: 0, vy: 0, dragging: false });

  // The device only becomes interactive once it has landed on the desk (after the float).
  const [interactive, setInteractive] = useState(mode === 'play');
  useEffect(() => {
    if (mode === 'play') {
      const t = setTimeout(() => setInteractive(true), FLOAT_MS);
      return () => clearTimeout(t);
    }
    setInteractive(false);
    setInspect(false); // leaving play closes inspect
    setManualOpen(false);
  }, [mode]);

  const toggleInspect = () => {
    setInspect((on) => {
      if (!on) spin.current = { x: 0, y: 0, vx: 0, vy: 0, dragging: false }; // start at rest
      return !on;
    });
  };

  // Drag-to-spin while inspecting: a horizontal drag turns the device, a vertical drag tilts it.
  // We set BOTH position and angular velocity here (velocity from the real pointer-event timing,
  // so it survives the release), then drop `dragging` so the stage coasts on that velocity and
  // decays it - the floaty momentum. Holding still bleeds the velocity (in the stage), so a
  // stop-then-lift doesn't fling.
  const TURN_SENS = 0.01; // rad per px, horizontal -> turn
  const TILT_SENS = 0.008; // rad per px, vertical -> tilt
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    spin.current.dragging = true;
    spin.current.vx = 0; // catch a coasting device: grabbing stops it
    spin.current.vy = 0;
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dyaw = (e.clientX - d.x) * TURN_SENS;
    const nx = Math.max(-1.2, Math.min(1.2, spin.current.x + (e.clientY - d.y) * TILT_SENS));
    const dpitch = nx - spin.current.x; // actually-applied tilt (after the clamp)
    spin.current.y += dyaw;
    spin.current.x = nx;
    const dtS = (e.timeStamp - d.t) / 1000;
    if (dtS > 0) {
      // exponential-smoothed velocity tracks the recent motion (rad/s)
      spin.current.vy = spin.current.vy * 0.4 + (dyaw / dtS) * 0.6;
      spin.current.vx = spin.current.vx * 0.4 + (dpitch / dtS) * 0.6;
    }
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onDragEnd = () => {
    drag.current = null;
    spin.current.dragging = false; // release -> the stage coasts on the carried velocity
  };

  const deviceHandlers = useMemo<DeviceHandlers>(
    () => ({ ...handlers, onHelpToggle: () => setManualOpen((o) => !o) }),
    [handlers],
  );
  // No playing while inspecting (you're looking at it, not playing it).
  const stageHandlers = interactive && !inspect ? deviceHandlers : NOOP_HANDLERS;

  const play = () => {
    handlers.resume(); // build + unlock audio on the first gesture
    navigate(`/${hero.id}`);
  };
  const theme = BODY_THEMES[vm.themeIndex % BODY_THEMES.length];

  return (
    <div className="experience">
      <Stage mode={mode} inspect={inspect} spinRef={spin} vm={vm} handlers={stageHandlers} onShelfTap={play} />

      {/* drag-to-spin surface, only while inspecting (sits under the chrome buttons) */}
      {inspect && (
        <div
          className="inspect-drag"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerLeave={onDragEnd}
          onPointerCancel={onDragEnd}
        />
      )}

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
          <button
            className={'tool-btn' + (inspect ? ' is-active' : '')}
            onClick={toggleInspect}
            aria-label="Inspect the device in 3D"
            aria-pressed={inspect}
          >
            <EyeIcon />
          </button>
        </div>
      </div>

      <Manual open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
