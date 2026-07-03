import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Stage, type StageInstrument, type Carousel } from '../stage/Stage';
import { EyeIcon } from './EyeIcon';
import { INSTRUMENTS, instrumentById } from '../instruments/registry';
import type { AnyInstrumentModule } from '../shared/instrument';
import { Transport } from '../transport/transport';
import { IntervalTicker } from '../transport/intervalTicker';
import { createRig, loadRig, listRigs, deleteRig, updateRig, scatterFor, type Placement, type RigConfig, type RigSummary } from '../rig/rigStore';
import { RigsDrawer } from './RigsDrawer';
import { DeviceThumbForge } from './deviceThumbs';
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
  transport,
  children,
}: {
  module: AnyInstrumentModule;
  enabled: boolean;
  transport: Transport;
  children: ReactNode;
}) {
  const parent = useContext(InstrumentsCtx);
  const { vm, handlers } = module.useInstrument(enabled, transport);
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
// The route sets the mode: '/<id>' plays one instrument; '/rig/<uuid>' opens a rig - the
// instruments lie scattered flat on the desk and the camera flies between them (top-down all-view,
// tap to zoom into one, swipe to move to the next).
export function Experience() {
  const navigate = useNavigate();
  const location = useLocation();
  const parsed = parsePath(location.pathname);

  // ONE shared master clock for the whole app: every synced instrument slaves its timing to it, so
  // "solo is a rig of one" (a single instrument plays against the same Transport a rig shares). The
  // IntervalTicker drives it in real time. Created once, lives for the app's life.
  const transport = useMemo(() => new Transport(), []);
  useMemo(() => new IntervalTicker(transport), [transport]);

  const rig: RigConfig | null = parsed.kind === 'rig' ? loadRig(parsed.uuid!) : null;

  useEffect(() => {
    // a rig route with no stored config is invalid (rigs are made via the build flow)
    if (parsed.kind === 'bad' || (parsed.kind === 'rig' && !rig)) navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.kind, parsed.uuid]);

  // The FOCUSED instrument in a rig (null = the top-down all-view). Reset when the rig changes.
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    setFocused(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.uuid, parsed.kind]);

  const activeId = parsed.kind === 'single' ? parsed.id! : parsed.kind === 'rig' ? focused : null;

  // Build the provider stack (one hook per instrument) around the StageHost. Only the focused/played
  // instrument is `enabled` (desktop keyboard); the rest are mounted + audio-live.
  const tree = INSTRUMENTS.reduceRight<ReactNode>(
    (children, module) => (
      <InstrumentProvider
        key={module.manifest.id}
        module={module}
        enabled={module.manifest.id === activeId}
        transport={transport}
      >
        {children}
      </InstrumentProvider>
    ),
    <StageHost activeId={activeId} rig={rig} focused={focused} onFocus={setFocused} onNavigate={navigate} transport={transport} />,
  );

  return <div className="experience">{tree}</div>;
}

function StageHost({
  activeId,
  rig,
  focused,
  onFocus,
  onNavigate,
  transport,
}: {
  activeId: string | null;
  rig: RigConfig | null;
  focused: string | null;
  onFocus: (id: string | null) => void;
  onNavigate: (to: string) => void;
  transport: Transport;
}) {
  const entries = useContext(InstrumentsCtx);
  const [manualOpen, setManualOpen] = useState(false);
  const [inspect, setInspect] = useState(false);
  const spin = useRef<Spin>({ x: 0, y: 0, vx: 0, vy: 0, dragging: false });

  // A minimal view of the shared Transport for the transport bar: running + tempo + the bar.beat
  // position. Re-renders only when a displayed value actually changes (onPosition fires every pulse,
  // but the beat only ticks a few times a second, so React bails between beats).
  const [tview, setTview] = useState(() => ({ running: transport.isRunning(), bpm: transport.getBpm(), bar: 1, beat: 1 }));
  useEffect(() => {
    const update = () => {
      const p = transport.position();
      setTview((prev) => {
        const running = transport.isRunning();
        const bpm = transport.getBpm();
        if (prev.running === running && prev.bpm === bpm && prev.bar === p.bar && prev.beat === p.beat) return prev;
        return { running, bpm, bar: p.bar, beat: p.beat };
      });
    };
    const offChange = transport.onChange(update);
    const offPos = transport.onPosition(update);
    update();
    return () => {
      offChange();
      offPos();
    };
  }, [transport]);

  // Free-run policy: while a SOLO instrument that has no transport bar (the HiClone) is active, keep
  // the shared clock free-running so its arp/looper still step on pad-hold. In a rig the bar owns
  // play/stop (free-run off); on entering a rig, rewind the idle clock so it starts at bar 1.
  useEffect(() => {
    const mod = activeId ? instrumentById(activeId) : undefined;
    const free = !rig && mod?.needsFreeClock === true;
    transport.setFreeRun(free);
    if (!free && !transport.isRunning()) transport.rewind();
  }, [activeId, rig, transport]);

  // Play/stop the whole rig (unlock every rig instrument's audio on the first gesture) + set the
  // one shared tempo.
  // Play/Pause: HOLD position (resume from here). Stop: return to bar 1. Both unlock every rig
  // instrument's audio on the first gesture. The loops follow the transport (each looper subscribes).
  const toggleTransport = () => {
    if (rig) for (const id of rig.instruments) entries[id]?.handlers?.resume?.();
    transport.toggle();
  };
  const stopTransport = () => transport.stop();
  const setBpm = (next: number) => transport.setBpm(Math.max(40, Math.min(240, Math.round(next))));

  // Rig-BUILD mode (in the 3D room): the camera frames the shelf + desk; tapping a shelf instrument
  // flies it down to lie flat on the desk (a scattered placement); tapping it there flies it back.
  const [building, setBuilding] = useState(false);
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  // Rig library: the "your rigs" drawer + which rig (if any) the build overlay is editing.
  const [rigsOpen, setRigsOpen] = useState(false);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [rigList, setRigList] = useState<RigSummary[]>([]);
  // Device-thumbnail generation: kick it off on IDLE (after the shelf settles, before the drawer is
  // ever opened) so the chip thumbnails are ready with no flash. thumbTick re-renders the chips as
  // each device is captured.
  const [forgeReady, setForgeReady] = useState(false);
  const [thumbTick, setThumbTick] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ric = (window as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
    const id = ric ? ric(() => setForgeReady(true)) : window.setTimeout(() => setForgeReady(true), 1200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (ric ? (window as any).cancelIdleCallback?.(id) : clearTimeout(id));
  }, []);

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
    if (activeId !== null || building || rig) return; // carousel browse: only on the plain shelf
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
  }, [activeId, building, rig]);

  // Swipe to move to the next/prev instrument while FOCUSED in a rig. The swipe must START in the
  // empty vertical margins (a landscape device leaves top/bottom bands clear on a portrait screen),
  // so a horizontal drag ON the instrument body still plays it and never cycles.
  useEffect(() => {
    if (!rig || focused === null) return;
    const order = rig.instruments;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      const marginY = window.innerHeight * 0.24;
      const inMargin = e.clientY < marginY || e.clientY > window.innerHeight - marginY;
      start = inMargin ? { x: e.clientX, y: e.clientY } : null;
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy)) return; // needs a clear horizontal swipe
      const cur = order.indexOf(focused);
      const next = order[(cur + (dx < 0 ? 1 : -1) + order.length) % order.length]; // swipe left = next
      entries[next]?.handlers?.resume?.();
      onFocus(next);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', () => (start = null));
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [rig, focused, entries, onFocus]);

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

  // Tapping a device.
  //  - BUILD: add it to the desk (fly down to a scattered flat spot) or remove it (fly back up).
  //  - RIG all-view: focus + zoom the camera into it to play it.
  //  - Shelf: the centered one opens; a side one just recenters the carousel.
  const onDeviceTap = (i: number) => {
    const id = INSTRUMENTS[i].manifest.id;
    if (building) {
      entries[id]?.handlers.resume();
      setPlacements((p) => {
        if (id in p) {
          const { [id]: _drop, ...rest } = p;
          return rest;
        }
        return { ...p, [id]: scatterFor(p) };
      });
      return;
    }
    if (rig) {
      // all-view -> focus this instrument (zoom in to play it)
      entries[id]?.handlers.resume();
      onFocus(id);
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
    const ids = Object.keys(placements);
    if (ids.length < 1) return;
    let uuid: string;
    if (editingUuid) {
      updateRig(editingUuid, ids, placements); // an edit: keep the same uuid (+ its URL / room)
      uuid = editingUuid;
    } else {
      uuid = createRig(ids, placements);
    }
    setBuilding(false);
    setEditingUuid(null);
    ids.forEach((id) => entries[id]?.handlers.resume());
    onNavigate(`/rig/${uuid}`);
  };
  const cancelBuild = () => {
    setBuilding(false);
    setEditingUuid(null);
  };

  // --- rig library (the "your rigs" drawer) ---
  const openRigs = () => {
    setRigList(listRigs());
    setRigsOpen(true);
  };
  const newRig = () => {
    setRigsOpen(false);
    setEditingUuid(null);
    setPlacements({});
    setBuilding(true);
  };
  const editRig = (uuid: string) => {
    const c = loadRig(uuid);
    if (!c) return;
    setRigsOpen(false);
    setEditingUuid(uuid);
    setPlacements(c.placements);
    setBuilding(true);
  };
  const openSavedRig = (uuid: string) => {
    const c = loadRig(uuid);
    setRigsOpen(false);
    if (c) c.instruments.forEach((id) => entries[id]?.handlers.resume());
    onNavigate(`/rig/${uuid}`);
  };
  const removeRig = (uuid: string) => {
    if (!window.confirm('Delete this rig? This cannot be undone.')) return;
    deleteRig(uuid);
    setRigList(listRigs());
  };
  // Keep the "your rigs" count/list fresh whenever we're on the plain shelf (e.g. back from a rig).
  const onShelf = activeId === null && !building && !rig;
  useEffect(() => {
    if (onShelf) setRigList(listRigs());
    else setRigsOpen(false); // the drawer belongs to the shelf; close it if we navigate away
  }, [onShelf]);

  const onPointerMissed = () => {
    if (active) active.module.releaseOnMiss(active.handlers);
  };

  // Back: build -> shelf; a focused rig instrument -> the rig all-view; otherwise -> shelf.
  const onBack = () => {
    if (building) return cancelBuild();
    if (rig && focused) return onFocus(null);
    onNavigate('/');
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
        rigPlay={!!rig}
        placements={building ? placements : rig ? rig.placements : null}
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

      {/* shelf chrome (plain shelf only - hidden while building or in a rig) */}
      <div className={'overlay shelf-chrome' + (activeId === null && !building && !rig ? ' is-on' : '')}>
        <header className="shelf-title">jam<span>shelf</span></header>
        <div className="carousel-dots">
          {INSTRUMENTS.map((m, i) => (
            <span key={m.manifest.id} className={'carousel-dot' + (i === carouselIndex ? ' is-on' : '')} />
          ))}
        </div>
        <footer className="shelf-foot">swipe to browse, tap to play</footer>
        <button className="your-rigs-btn" onClick={openRigs}>
          ▦ your rigs{rigList.length > 0 && <b> {rigList.length}</b>}
        </button>
      </div>

      {/* rig-build chrome (in the 3D room): a hint + cancel + JAM/SAVE */}
      {building && (
        <div className="overlay build-chrome is-on">
          <button className="back-to-shelf" onClick={cancelBuild} aria-label="Cancel">‹</button>
          <header className="build-title">{editingUuid ? 'Edit rig' : 'Build a rig'}</header>
          <footer className="build-hint">
            {Object.keys(placements).length === 0 ? 'tap an instrument to lay it on the desk' : 'tap to add or remove · ' + (editingUuid ? 'save when ready' : 'jam when ready')}
          </footer>
          <button className="jam-btn" disabled={Object.keys(placements).length < 1} onClick={startJam}>
            {editingUuid ? 'save ›' : 'jam ›'}
          </button>
        </div>
      )}

      {/* rig all-view chrome (top-down, nothing focused): back + a hint */}
      {rig && focused === null && (
        <div className="overlay build-chrome is-on">
          <button className="back-to-shelf" onClick={() => onNavigate('/')} aria-label="Back to the shelf">‹</button>
          <footer className="build-hint">tap an instrument to play it</footer>
        </div>
      )}

      {/* play chrome (a single instrument OR a focused rig instrument) */}
      <div className={'overlay play-chrome' + (activeId !== null && !building ? ' is-on' : '')}>
        <button className="back-to-shelf" onClick={onBack} aria-label={rig ? 'Back to the rig' : 'Back to the shelf'}>
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
          {!rig && (
            <button
              className={'tool-btn' + (inspect ? ' is-active' : '')}
              onClick={toggleInspect}
              aria-label="Inspect the device in 3D"
              aria-pressed={inspect}
            >
              <EyeIcon />
            </button>
          )}
        </div>
      </div>

      {/* rig transport bar: the shared master clock - one play/stop, one tempo, and the bar.beat
          position so the lock is visible. Shown throughout a rig. */}
      {rig && (
        <div className="transport-bar">
          <button className={'transport-play' + (tview.running ? ' is-playing' : '')} onClick={toggleTransport} aria-label={tview.running ? 'Pause' : 'Play'}>
            {tview.running ? '❚❚' : '▶'}
          </button>
          <button className="transport-stop" onClick={stopTransport} aria-label="Stop">■</button>
          <span className="transport-pos" aria-label="Position">{tview.bar}<small>.</small>{tview.beat}</span>
          <div className="transport-bpm">
            <button className="bpm-step" onClick={() => setBpm(tview.bpm - 1)} aria-label="Slower">–</button>
            <span className="bpm-val">{tview.bpm}<small>BPM</small></span>
            <button className="bpm-step" onClick={() => setBpm(tview.bpm + 1)} aria-label="Faster">+</button>
          </div>
        </div>
      )}

      {ActiveManual && <ActiveManual open={manualOpen} onClose={() => setManualOpen(false)} />}

      <RigsDrawer
        open={rigsOpen && onShelf}
        rigs={rigList}
        thumbTick={thumbTick}
        onClose={() => setRigsOpen(false)}
        onNew={newRig}
        onOpen={openSavedRig}
        onEdit={editRig}
        onDelete={removeRig}
      />
      {forgeReady && <DeviceThumbForge onProgress={() => setThumbTick((t) => t + 1)} />}
    </>
  );
}
