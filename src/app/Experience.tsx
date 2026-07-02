import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Stage, type StageInstrument, type Carousel } from '../stage/Stage';
import { EyeIcon } from './EyeIcon';
import { INSTRUMENTS, instrumentById } from '../instruments/registry';
import type { AnyInstrumentModule, InstrumentTransport } from '../shared/instrument';
import { createRig, loadRig, saveDesk, type RigConfig } from '../rig/rigStore';
import './experience.css';

const FLOAT_MS = 1250; // matches the Stage's float DURATION; the device plays after it lands
const CAROUSEL_DRAG_PX = 240; // px of horizontal drag per one carousel step
const indexOfId = (id: string | null) => INSTRUMENTS.findIndex((m) => m.manifest.id === id);

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
  transport?: InstrumentTransport;
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
  const { vm, handlers, transport } = module.useInstrument(enabled);
  const value = useMemo(
    () => ({ ...parent, [module.manifest.id]: { module, vm, handlers, transport } }),
    [parent, module, vm, handlers, transport],
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

// Parse the route into a mode: the shelf ('/'), a single instrument ('/<id>'), or a rig
// ('/rig/<uuid>'). Anything else is invalid (redirected to the shelf).
function parsePath(pathname: string): { kind: 'shelf' | 'single' | 'rig' | 'bad'; id?: string; uuid?: string } {
  if (pathname === '/' || pathname === '') return { kind: 'shelf' };
  const rig = pathname.match(/^\/rig\/([A-Za-z0-9]+)\/?$/);
  if (rig) return { kind: 'rig', uuid: rig[1] };
  const id = pathname.replace(/^\//, '');
  if (instrumentById(id)) return { kind: 'single', id };
  return { kind: 'bad' };
}

// The whole experience: ONE persistent 3D stage hosting every instrument, plus the HTML chrome.
// The route sets which instrument is on the desk: '/<id>' plays one; '/rig/<uuid>' plays a rig
// (several instruments sharing a transport, switched via a dock). The active device floats
// continuously to the desk - no remount.
export function Experience() {
  const navigate = useNavigate();
  const location = useLocation();
  const parsed = parsePath(location.pathname);

  // Resolve the rig config for a rig route (falling back to all instruments if none was stored).
  const rig: RigConfig | null =
    parsed.kind === 'rig' ? loadRig(parsed.uuid!) ?? { instruments: INSTRUMENTS.map((m) => m.manifest.id), desk: INSTRUMENTS[0].manifest.id } : null;

  useEffect(() => {
    if (parsed.kind === 'bad') navigate('/', { replace: true });
  }, [parsed.kind, navigate]);

  // In a rig, which instrument is on the desk (switched by the dock); otherwise the single id.
  const [desk, setDesk] = useState(rig ? rig.desk : '');
  useEffect(() => {
    if (rig && !rig.instruments.includes(desk)) setDesk(rig.desk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.uuid]);

  const activeId = parsed.kind === 'single' ? parsed.id! : parsed.kind === 'rig' ? desk : null;

  // Build the provider stack (one hook per instrument) around the StageHost. Only the instrument
  // on the desk is `enabled` (responds to the desktop keyboard); the rest are mounted + audio-live.
  const tree = INSTRUMENTS.reduceRight<ReactNode>(
    (children, module) => (
      <InstrumentProvider key={module.manifest.id} module={module} enabled={module.manifest.id === activeId}>
        {children}
      </InstrumentProvider>
    ),
    <StageHost
      activeId={activeId}
      rig={rig}
      rigUuid={parsed.kind === 'rig' ? parsed.uuid! : null}
      onSwitchDesk={(id) => {
        setDesk(id);
        if (parsed.kind === 'rig') saveDesk(parsed.uuid!, id);
      }}
      onNavigate={navigate}
    />,
  );

  return <div className="experience">{tree}</div>;
}

function StageHost({
  activeId,
  rig,
  rigUuid,
  onSwitchDesk,
  onNavigate,
}: {
  activeId: string | null;
  rig: RigConfig | null;
  rigUuid: string | null;
  onSwitchDesk: (id: string) => void;
  onNavigate: (to: string) => void;
}) {
  const entries = useContext(InstrumentsCtx);
  const [manualOpen, setManualOpen] = useState(false);
  const [inspect, setInspect] = useState(false);
  const spin = useRef<Spin>({ x: 0, y: 0, vx: 0, vy: 0, dragging: false });

  // Rig transport: a shared BPM pushed to every tempo instrument, plus a global play/stop.
  const rigTransportIds = rig ? rig.instruments.filter((id) => entries[id]?.transport) : [];
  const [rigBpm, setRigBpm] = useState(120);
  useEffect(() => {
    if (!rig) return;
    const first = rig.instruments.find((id) => entries[id]?.transport);
    if (first) setRigBpm(entries[first].transport!.getBpm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rigUuid]);
  const pushBpm = (next: number) => {
    const bpm = Math.max(40, Math.min(240, Math.round(next)));
    setRigBpm(bpm);
    for (const id of rigTransportIds) entries[id].transport!.setBpm(bpm);
  };
  const anyPlaying = rigTransportIds.some((id) => entries[id].transport!.isPlaying());
  const toggleTransport = () => {
    const play = !anyPlaying;
    for (const id of rigTransportIds) {
      const t = entries[id].transport!;
      if (play) t.play();
      else t.stop();
    }
  };

  // Rig-build mode (in the 3D room): the camera pulls back to the shelf + a board; tapping an
  // instrument flies it onto/off the board. `building` is the mode; `boardIds` are the placed ones.
  const [building, setBuilding] = useState(false);
  const [boardIds, setBoardIds] = useState<string[]>([]);

  // The carousel: `carouselIndex` is the settled centered instrument (React state, drives the
  // label + dots); `carousel` is the live fractional position the Stage animates (so a swipe
  // slides smoothly + snaps).
  const startIndex = Math.max(0, indexOfId(activeId));
  const [carouselIndex, setCarouselIndex] = useState(startIndex);
  const carousel = useRef<Carousel>({ pos: startIndex, target: startIndex, dragging: false });

  // The active device only becomes interactive once it has landed on the desk (after the float).
  const [interactive, setInteractive] = useState(activeId !== null);
  useEffect(() => {
    if (activeId !== null) {
      // center the carousel on the opened instrument so returning to the shelf shows it centered
      const i = indexOfId(activeId);
      if (i >= 0) {
        setCarouselIndex(i);
        carousel.current.target = i;
        carousel.current.pos = i;
      }
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

  // Swipe-to-browse the carousel (shelf mode). A window-level drag moves the live position; the
  // per-device tap catcher (in the Stage) still fires its tap only if the pointer barely moved, so
  // a swipe never opens a device. On release we snap to the nearest instrument (clamped to range).
  const swipe = useRef<{ x: number; startPos: number } | null>(null);
  useEffect(() => {
    if (activeId !== null || building) return; // only browse on the shelf (not while building a rig)
    const n = INSTRUMENTS.length;
    const down = (e: PointerEvent) => {
      swipe.current = { x: e.clientX, startPos: carousel.current.pos };
      carousel.current.dragging = true;
    };
    const move = (e: PointerEvent) => {
      const s = swipe.current;
      if (!s) return;
      const next = s.startPos - (e.clientX - s.x) / CAROUSEL_DRAG_PX;
      carousel.current.pos = Math.max(-0.35, Math.min(n - 1 + 0.35, next)); // slight overscroll
    };
    const up = () => {
      if (!swipe.current) return;
      swipe.current = null;
      carousel.current.dragging = false;
      const snapped = Math.max(0, Math.min(n - 1, Math.round(carousel.current.pos)));
      carousel.current.target = snapped;
      setCarouselIndex(snapped);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [activeId, building]);

  const active = activeId ? entries[activeId] : null;

  // Build a device node per instrument. The active device gets real handlers only once it has
  // landed and is not being inspected; otherwise (mid-float, inspecting, or a shelf device) its
  // taps are no-ops. Shelf devices are shielded by the tap catcher anyway.
  const stageInstruments: StageInstrument[] = INSTRUMENTS.map((module) => {
    const mid = module.manifest.id;
    const entry = entries[mid];
    const isActive = mid === activeId;
    const live = isActive && interactive && !inspect;
    const handlers = live ? entry.handlers : noopLike(entry.handlers);
    const Device = module.Device;
    return { id: mid, label: module.manifest.name, node: <Device vm={entry.vm} handlers={handlers} /> };
  });

  // Tapping a device. In BUILD mode: toggle it on/off the board (fly it down/up). On the shelf: the
  // CENTERED one opens (floats to the desk); a side one just recenters the carousel onto it.
  const onDeviceTap = (i: number) => {
    const id = INSTRUMENTS[i].manifest.id;
    if (building) {
      entries[id]?.handlers.resume();
      setBoardIds((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
      return;
    }
    if (i === Math.round(carousel.current.pos)) {
      entries[id]?.handlers.resume(); // unlock + build that instrument's audio on the first gesture
      onNavigate(`/${id}`);
    } else {
      carousel.current.target = i;
      setCarouselIndex(i);
    }
  };

  const startJam = () => {
    if (boardIds.length < 1) return;
    const uuid = createRig(boardIds);
    setBuilding(false);
    boardIds.forEach((id) => entries[id]?.handlers.resume());
    onNavigate(`/rig/${uuid}`);
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
        centeredIndex={carouselIndex}
        inspect={inspect}
        build={building}
        board={boardIds}
        spinRef={spin}
        carouselRef={carousel}
        onDeviceTap={onDeviceTap}
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

      {/* shelf chrome (hidden while building a rig) */}
      <div className={'overlay shelf-chrome' + (activeId === null && !building ? ' is-on' : '')}>
        <header className="shelf-title">jam<span>shelf</span></header>
        <div className="carousel-dots">
          {INSTRUMENTS.map((m, i) => (
            <span key={m.manifest.id} className={'carousel-dot' + (i === carouselIndex ? ' is-on' : '')} />
          ))}
        </div>
        <footer className="shelf-foot">swipe to browse, tap to play</footer>
        <button className="new-rig-btn" onClick={() => { setBoardIds([]); setBuilding(true); }}>＋ new rig</button>
      </div>

      {/* rig-build chrome (in the 3D room): a hint + cancel + JAM */}
      {building && (
        <div className="overlay build-chrome is-on">
          <button className="back-to-shelf" onClick={() => setBuilding(false)} aria-label="Cancel">‹</button>
          <header className="build-title">Build a rig</header>
          <footer className="build-hint">
            {boardIds.length === 0 ? 'tap instruments to add them to the board' : 'tap an instrument to add or remove it'}
          </footer>
          <button className="jam-btn" disabled={boardIds.length < 1} onClick={startJam}>
            jam ›
          </button>
        </div>
      )}

      {/* play chrome (single instrument OR the desk instrument of a rig) */}
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

      {/* rig chrome: the shared transport bar + the instrument dock */}
      {rig && (
        <>
          <div className="transport-bar">
            <button className={'transport-play' + (anyPlaying ? ' is-playing' : '')} onClick={toggleTransport} aria-label={anyPlaying ? 'Stop' : 'Play'}>
              {anyPlaying ? '■' : '▶'}
            </button>
            <div className="transport-bpm">
              <button className="bpm-step" onClick={() => pushBpm(rigBpm - 1)} aria-label="Slower">–</button>
              <span className="bpm-val">{rigBpm}<small>BPM</small></span>
              <button className="bpm-step" onClick={() => pushBpm(rigBpm + 1)} aria-label="Faster">+</button>
            </div>
          </div>
          <div className="rig-dock">
            {rig.instruments.map((id) => {
              const m = instrumentById(id);
              if (!m) return null;
              return (
                <button
                  key={id}
                  className={'dock-tab' + (id === activeId ? ' is-active' : '')}
                  style={{ ['--accent' as string]: m.manifest.accent }}
                  onClick={() => {
                    entries[id]?.handlers.resume();
                    onSwitchDesk(id);
                  }}
                >
                  <span className="dock-dot" />
                  {m.manifest.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      {ActiveManual && <ActiveManual open={manualOpen} onClose={() => setManualOpen(false)} />}
    </>
  );
}
