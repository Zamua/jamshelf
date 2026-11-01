import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Stage, type StageInstrument } from '../stage/Stage';
import { FLOAT_DURATION, type Carousel } from '../stage/motion';
import { EyeIcon } from './EyeIcon';
import { INSTRUMENTS, instrumentById } from '../instruments/registry';
import type { AnyInstrumentModule, InstrumentHandlers } from '../shared/instrument';
import { Transport } from '../transport/transport';
import { IntervalTicker } from '../transport/intervalTicker';
import { RigAudio, type SharedAudio } from '../rig/rigAudio';
import type { RigConfig } from '../rig/rigStore';
import { RigsDrawer } from './RigsDrawer';
import { DeviceThumbForge } from './deviceThumbs';
import { parseRoute, rigUuidOf } from './route';
import { useGoLive, useRigConfig, useRigSession } from './rigSession';
import { useRigLibrary } from './rigLibrary';
import { useCarouselSwipe, useInspectSpin, useRigSwipe } from './useGestures';
import { useTransportView } from './useTransportView';
import { awayChrome, landedChrome, nextPlayChrome, playable } from './playChrome';
import './experience.css';

const FLOAT_MS = FLOAT_DURATION * 1000 + 50; // the device plays just after it lands
const indexOfId = (id: string | null) => INSTRUMENTS.findIndex((m) => m.manifest.id === id);

// One mounted instrument's live state, keyed by id in the context.
interface Entry {
  module: AnyInstrumentModule;
  vm: unknown;
  handlers: InstrumentHandlers;
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
  audio,
  children,
}: {
  module: AnyInstrumentModule;
  enabled: boolean;
  transport: Transport;
  audio: SharedAudio;
  children: ReactNode;
}) {
  const parent = useContext(InstrumentsCtx);
  const { vm, handlers } = module.useInstrument(enabled, transport, audio);
  const value = useMemo(
    () => ({ ...parent, [module.manifest.id]: { module, vm, handlers } }),
    [parent, module, vm, handlers],
  );
  return <InstrumentsCtx.Provider value={value}>{children}</InstrumentsCtx.Provider>;
}

// Replace every handler method with a no-op (generic across instruments), so a device that is
// mid-float or being inspected does not fire notes.
function noopLike<H extends object>(handlers: H): H {
  const out: Record<string, () => void> = {};
  for (const k of Object.keys(handlers)) out[k] = () => {};
  return out as H;
}

// The whole experience: ONE persistent 3D stage hosting every instrument, plus the HTML chrome.
// The route sets the mode: '/<id>' plays one instrument; '/rig/<uuid>' opens a rig - the
// instruments lie scattered flat on the desk and the camera flies between them (top-down all-view,
// tap to zoom into one, swipe to move to the next).
export function Experience() {
  const navigate = useNavigate();
  const location = useLocation();
  const route = parseRoute(location.pathname, (id) => instrumentById(id) !== undefined);
  const rigUuid = rigUuidOf(route);

  // ONE shared master clock for the whole app: every synced instrument slaves its timing to it, so
  // "solo is a rig of one" (a single instrument plays against the same Transport a rig shares). The
  // IntervalTicker drives it in real time. Created once, lives for the app's life.
  const transport = useMemo(() => new Transport(), []);
  useMemo(() => new IntervalTicker(transport), [transport]);
  // ONE shared audio graph for the whole app (like the Transport): every device runs on this one
  // AudioContext, so its output can be routed into the looper (Web Audio can't cross contexts).
  const rigAudio = useMemo(() => new RigAudio(), []);
  const rig = useRigConfig(route, navigate);

  // The FOCUSED instrument in a rig (null = the top-down all-view). Reset when the rig changes.
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => setFocused(null), [rigUuid, route.kind]);

  const activeId = route.kind === 'single' ? route.id : rigUuid ? focused : null;

  // Build the provider stack (one hook per instrument) around the StageHost. Only the focused/played
  // instrument is `enabled` (desktop keyboard); the rest are mounted + audio-live.
  const tree = INSTRUMENTS.reduceRight<ReactNode>(
    (children, module) => (
      <InstrumentProvider
        key={module.manifest.id}
        module={module}
        enabled={module.manifest.id === activeId}
        transport={transport}
        audio={rigAudio}
      >
        {children}
      </InstrumentProvider>
    ),
    <StageHost activeId={activeId} rig={rig} rigUuid={rigUuid} live={route.kind === 'jam'} audio={rigAudio} focused={focused} onFocus={setFocused} onNavigate={navigate} transport={transport} />,
  );

  return <div className="experience">{tree}</div>;
}

function StageHost({
  activeId,
  rig,
  rigUuid,
  live,
  audio,
  focused,
  onFocus,
  onNavigate,
  transport,
}: {
  activeId: string | null;
  rig: RigConfig | null;
  rigUuid: string | null;
  live: boolean;
  audio: RigAudio;
  focused: string | null;
  onFocus: (id: string | null) => void;
  onNavigate: (to: string) => void;
  transport: Transport;
}) {
  const entries = useContext(InstrumentsCtx);
  const resume = useCallback((ids: readonly string[]) => ids.forEach((id) => entries[id]?.handlers.resume()), [entries]);
  const [chrome, sendChrome] = useReducer(nextPlayChrome, activeId !== null ? landedChrome : awayChrome);
  const { inspect, manual: manualOpen } = chrome;
  const { spin, resetSpin, dragHandlers } = useInspectSpin();
  const toggleInspect = () => {
    if (!inspect) resetSpin();
    sendChrome({ type: 'toggleInspect' });
  };

  const session = useRigSession({ rig, rigUuid, live, audio, transport, focused, onFocus });
  const { wires, patchMode, setPatchMode, toggleWire, canTake, players } = session;
  const { goLive, goingLive, copyJamLink, linkCopied } = useGoLive(rig, wires, onNavigate);
  const tview = useTransportView(transport);

  // Free-run policy: while a SOLO instrument that has no transport bar (the HiClone) is active, keep
  // the shared clock free-running so its arp/looper still step on pad-hold. In a rig the bar owns
  // play/stop (free-run off); on entering a rig, rewind the idle clock so it starts at bar 1.
  useEffect(() => {
    const mod = activeId ? instrumentById(activeId) : undefined;
    const free = !rig && mod?.needsFreeClock === true;
    transport.setFreeRun(free);
    if (!free && !transport.isRunning()) transport.rewind();
  }, [activeId, rig, transport]);

  // Play/Pause holds the position; Stop returns to bar 1. Play unlocks every rig instrument's audio
  // on the first gesture. The loops follow the transport (each looper subscribes).
  const toggleTransport = () => {
    if (rig) resume(rig.instruments);
    transport.toggle();
  };

  const onShelf = activeId === null && !rig;
  const library = useRigLibrary({ onShelf, resume, onNavigate });
  const { building, placements, editingUuid } = library;

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
  useCarouselSwipe(onShelf && !building, INSTRUMENTS.length, carousel, setCarouselIndex);

  // The active device lands on the desk after its float; leaving it resets the play chrome.
  useEffect(() => {
    if (activeId !== null) {
      // center the carousel on the opened instrument so returning to the shelf shows it centered
      const i = indexOfId(activeId);
      if (i >= 0) {
        setCarouselIndex(i);
        carousel.current.target = i;
        carousel.current.pos = i;
      }
      const t = setTimeout(() => sendChrome({ type: 'land' }), FLOAT_MS);
      return () => clearTimeout(t);
    }
    sendChrome({ type: 'leave' });
  }, [activeId]);

  const onSwipe = useCallback(
    (id: string) => {
      resume([id]);
      onFocus(id);
    },
    [resume, onFocus],
  );
  useRigSwipe(rig ? rig.instruments : null, focused, canTake, onSwipe);

  const active = activeId ? entries[activeId] : null;

  // Build a device node per instrument. The active device gets real handlers only once it has
  // landed and is not being inspected; otherwise (mid-float, inspecting, or a shelf device) its
  // taps are no-ops. Shelf devices are shielded by the tap catcher anyway.
  const stageInstruments: StageInstrument[] = INSTRUMENTS.map((module) => {
    const mid = module.manifest.id;
    const entry = entries[mid];
    const isActive = mid === activeId;
    const handlers = isActive && playable(chrome) ? entry.handlers : noopLike(entry.handlers);
    const Device = module.Device;
    return { id: mid, label: module.manifest.name, node: <Device vm={entry.vm} handlers={handlers} /> };
  });

  // Tapping a device.
  //  - BUILD: add it to the desk (fly down to a scattered flat spot) or remove it (fly back up).
  //  - RIG all-view: focus + zoom the camera into it to play it; another player's device is
  //    hard-locked (the occupancy model, docs/MULTIPLAYER.md).
  //  - Shelf: the centered one opens; a side one just recenters the carousel.
  const onDeviceTap = (i: number) => {
    const id = INSTRUMENTS[i].manifest.id;
    if (building) return library.toggleOnDesk(id);
    if (rig) {
      if (!canTake(id)) return;
      resume([id]);
      return onFocus(id);
    }
    if (i === Math.round(carousel.current.pos)) {
      resume([id]); // unlock + build that instrument's audio on the first gesture
      onNavigate(`/${id}`);
    } else {
      carousel.current.target = i;
      setCarouselIndex(i);
    }
  };

  const onPointerMissed = () => {
    if (active) active.module.releaseOnMiss(active.handlers);
  };

  // Back: build -> shelf; a focused rig instrument -> the rig all-view; otherwise -> shelf.
  const onBack = () => {
    if (building) return library.cancelBuild();
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
        wires={rig && !building ? wires : null}
        patchMode={patchMode}
        onToggleWire={toggleWire}
        spinRef={spin}
        carouselRef={carousel}
        onDeviceTap={onDeviceTap}
        onPointerMissed={onPointerMissed}
      />

      {/* drag-to-spin surface, only while inspecting (sits under the chrome buttons) */}
      {inspect && (
        <div className="inspect-drag" {...dragHandlers} />
      )}

      {/* shelf chrome (plain shelf only - hidden while building or in a rig) */}
      <div className={'overlay shelf-chrome' + (onShelf && !building ? ' is-on' : '')}>
        <header className="shelf-title">jam<span>shelf</span></header>
        <div className="carousel-dots">
          {INSTRUMENTS.map((m, i) => (
            <span key={m.manifest.id} className={'carousel-dot' + (i === carouselIndex ? ' is-on' : '')} />
          ))}
        </div>
        <footer className="shelf-foot">swipe to browse, tap to play</footer>
        <button className="your-rigs-btn" onClick={library.openDrawer}>
          ▦ your rigs{library.rigs.length > 0 && <b> {library.rigs.length}</b>}
        </button>
      </div>

      {/* rig-build chrome (in the 3D room): a hint + cancel + JAM/SAVE */}
      {building && (
        <div className="overlay build-chrome is-on">
          <button className="back-to-shelf" onClick={library.cancelBuild} aria-label="Cancel">‹</button>
          <header className="build-title">{editingUuid ? 'Edit rig' : 'Build a rig'}</header>
          <footer className="build-hint">
            {Object.keys(placements).length === 0 ? 'tap an instrument to lay it on the desk' : 'tap to add or remove · ' + (editingUuid ? 'save when ready' : 'jam when ready')}
          </footer>
          <button className="jam-btn" disabled={Object.keys(placements).length < 1} onClick={library.saveBuild}>
            {editingUuid ? 'save ›' : 'jam ›'}
          </button>
        </div>
      )}

      {/* rig all-view chrome (top-down, nothing focused): back + wire + invite/link + a hint */}
      {rig && focused === null && (
        <div className="overlay build-chrome is-on">
          <button className="back-to-shelf" onClick={() => onNavigate('/')} aria-label="Back to the shelf">‹</button>
          <button className={'patch-toggle' + (patchMode ? ' is-active' : '')} onClick={() => setPatchMode((v) => !v)}>
            {patchMode ? 'done' : 'wire'}
          </button>
          <button className={'jam-live' + (linkCopied ? ' is-copied' : '')} onClick={live ? copyJamLink : goLive} disabled={goingLive}>
            {live ? (linkCopied ? 'copied ✓' : 'link') : goingLive ? '…' : 'invite'}
          </button>
          {live && players > 1 && (
            <div className="jam-members" aria-label={`${players} players here`}>
              ●&nbsp;{players} here
            </div>
          )}
          <footer className="build-hint">
            {patchMode
              ? 'tap a device jack to patch it into the looper'
              : live
                ? 'live jam - share the link to invite'
                : 'tap an instrument to play it'}
          </footer>
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
            onClick={() => sendChrome({ type: 'toggleManual' })}
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
          <button className="transport-stop" onClick={() => transport.stop()} aria-label="Stop">■</button>
          <span className="transport-pos" aria-label="Position">{tview.bar}<small>.</small>{tview.beat}</span>
          <div className="transport-bpm">
            <button className="bpm-step" onClick={() => transport.setBpm(tview.bpm - 1)} aria-label="Slower">–</button>
            <span className="bpm-val">{tview.bpm}<small>BPM</small></span>
            <button className="bpm-step" onClick={() => transport.setBpm(tview.bpm + 1)} aria-label="Faster">+</button>
          </div>
        </div>
      )}

      {ActiveManual && <ActiveManual open={manualOpen} onClose={() => sendChrome({ type: 'closeManual' })} />}

      <RigsDrawer
        open={library.drawerOpen && onShelf}
        rigs={library.rigs}
        thumbTick={thumbTick}
        onClose={library.closeDrawer}
        onNew={library.newRig}
        onOpen={library.openRig}
        onEdit={library.editRig}
        onDelete={library.removeRig}
      />
      {forgeReady && <DeviceThumbForge onProgress={() => setThumbTick((t) => t + 1)} />}
    </>
  );
}
