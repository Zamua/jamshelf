import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Stage, type StageInstrument } from '../stage/Stage';
import { EyeIcon } from './EyeIcon';
import { INSTRUMENTS, instrumentById } from '../instruments/registry';
import type { AnyInstrumentModule } from '../shared/instrument';
import './experience.css';

const FLOAT_MS = 1250; // matches the Stage's float DURATION; the device plays after it lands

interface Spin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
}

// One mounted instrument's live state, keyed by id in the context.
interface Entry {
  module: AnyInstrumentModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vm: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: any;
}

// Accumulates every mounted instrument's { vm, handlers } so the StageHost (a single consumer
// below the provider stack) can build all the device nodes + wire the active one's chrome.
const InstrumentsCtx = createContext<Record<string, Entry>>({});

// One provider = one instrument's hook, merged into the context. Nesting these (built by
// reduceRight over the static registry) keeps a constant hook order across renders, so calling
// each instrument's hook stays rules-of-hooks clean while the host stays registry-driven.
function InstrumentProvider({
  module,
  enabled,
  children,
}: {
  module: AnyInstrumentModule;
  enabled: boolean;
  children: ReactNode;
}) {
  const parent = useContext(InstrumentsCtx);
  const { vm, handlers } = module.useInstrument(enabled);
  const value = useMemo(
    () => ({ ...parent, [module.manifest.id]: { module, vm, handlers } }),
    [parent, module, vm, handlers],
  );
  return <InstrumentsCtx.Provider value={value}>{children}</InstrumentsCtx.Provider>;
}

// Replace every handler method with a no-op (generic across instruments), so a device that is
// mid-float or being inspected does not fire notes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function noopLike(handlers: any): any {
  const out: Record<string, () => void> = {};
  for (const k of Object.keys(handlers)) out[k] = () => {};
  return out;
}

// The whole experience: ONE persistent 3D stage hosting every instrument (each on a shelf slot),
// plus the HTML chrome cross-faded over it. The route (`/` vs `/<id>`) sets which instrument is
// active; the active device floats continuously between the shelf and the desk - no remount.
export function Experience() {
  const navigate = useNavigate();
  const location = useLocation();

  const id = location.pathname.replace(/^\//, '');
  const known = !!instrumentById(id);
  const activeId = id && known ? id : null;
  const valid = !id || known; // '/' or a known instrument

  useEffect(() => {
    if (!valid) navigate('/', { replace: true });
  }, [valid, navigate]);

  // Build the provider stack (one hook per instrument) around the StageHost. Only the ACTIVE
  // instrument is `enabled` (responds to the desktop keyboard); the rest are mounted but idle.
  const tree = INSTRUMENTS.reduceRight<ReactNode>(
    (children, module) => (
      <InstrumentProvider key={module.manifest.id} module={module} enabled={module.manifest.id === activeId}>
        {children}
      </InstrumentProvider>
    ),
    <StageHost activeId={activeId} onNavigate={navigate} />,
  );

  return <div className="experience">{tree}</div>;
}

function StageHost({ activeId, onNavigate }: { activeId: string | null; onNavigate: (to: string) => void }) {
  const entries = useContext(InstrumentsCtx);
  const [manualOpen, setManualOpen] = useState(false);
  const [inspect, setInspect] = useState(false);
  const spin = useRef<Spin>({ x: 0, y: 0, vx: 0, vy: 0, dragging: false });

  // The active device only becomes interactive once it has landed on the desk (after the float).
  const [interactive, setInteractive] = useState(activeId !== null);
  useEffect(() => {
    if (activeId !== null) {
      const t = setTimeout(() => setInteractive(true), FLOAT_MS);
      return () => clearTimeout(t);
    }
    setInteractive(false);
    setInspect(false);
    setManualOpen(false);
  }, [activeId]);

  const toggleInspect = () => {
    setInspect((on) => {
      if (!on) spin.current = { x: 0, y: 0, vx: 0, vy: 0, dragging: false };
      return !on;
    });
  };

  // Drag-to-spin while inspecting (velocity from real pointer-event timing so a flick coasts; the
  // Stage reads + advances spin every frame).
  const TURN_SENS = 0.01;
  const TILT_SENS = 0.008;
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    spin.current.dragging = true;
    spin.current.vx = 0;
    spin.current.vy = 0;
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dyaw = (e.clientX - d.x) * TURN_SENS;
    const nx = Math.max(-1.2, Math.min(1.2, spin.current.x + (e.clientY - d.y) * TILT_SENS));
    const dpitch = nx - spin.current.x;
    spin.current.y += dyaw;
    spin.current.x = nx;
    const dtS = (e.timeStamp - d.t) / 1000;
    if (dtS > 0) {
      spin.current.vy = spin.current.vy * 0.4 + (dyaw / dtS) * 0.6;
      spin.current.vx = spin.current.vx * 0.4 + (dpitch / dtS) * 0.6;
    }
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onDragEnd = () => {
    drag.current = null;
    spin.current.dragging = false;
  };

  const active = activeId ? entries[activeId] : null;

  // Build a device node per instrument. The active device gets real handlers only once it has
  // landed and is not being inspected; otherwise (mid-float, inspecting, or a shelf device) its
  // taps are no-ops. Shelf devices are shielded by the tap-to-open catcher anyway.
  const stageInstruments: StageInstrument[] = INSTRUMENTS.map((module) => {
    const mid = module.manifest.id;
    const entry = entries[mid];
    const isActive = mid === activeId;
    const live = isActive && interactive && !inspect;
    const handlers = live ? entry.handlers : noopLike(entry.handlers);
    const Device = module.Device;
    return { id: mid, label: module.manifest.name, node: <Device vm={entry.vm} handlers={handlers} /> };
  });

  const openInstrument = (id: string) => {
    entries[id]?.handlers.resume(); // unlock + build that instrument's audio on the first gesture
    onNavigate(`/${id}`);
  };

  const onPointerMissed = () => {
    if (active) active.module.releaseOnMiss(active.handlers);
  };

  const ActiveManual = active?.module.Manual;
  const ActivePlayTools = active?.module.PlayTools;

  return (
    <>
      <Stage
        instruments={stageInstruments}
        activeId={activeId}
        inspect={inspect}
        spinRef={spin}
        onShelfTap={openInstrument}
        onPointerMissed={onPointerMissed}
      />

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
      <div className={'overlay shelf-chrome' + (activeId === null ? ' is-on' : '')}>
        <header className="shelf-title">jam<span>shelf</span></header>
        <footer className="shelf-foot">tap an instrument to play</footer>
      </div>

      {/* play chrome */}
      <div className={'overlay play-chrome' + (activeId !== null ? ' is-on' : '')}>
        <button className="back-to-shelf" onClick={() => onNavigate('/')} aria-label="Back to the shelf">
          ‹
        </button>
        <div className="tools">
          {active && ActivePlayTools && <ActivePlayTools vm={active.vm} handlers={active.handlers} />}
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

      {ActiveManual && <ActiveManual open={manualOpen} onClose={() => setManualOpen(false)} />}
    </>
  );
}
