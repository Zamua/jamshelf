import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Transport, TransportState } from '../transport/transport';
import type { RigAudio } from '../rig/rigAudio';
import { BroadcastChannelSync, NullRigSync, type RigSync } from '../rig/rigSync';
import { importRig, loadRig, saveWires, type RigConfig } from '../rig/rigStore';
import { HostthisRelaySync, fetchRoomRig, mintRoom, putRoomRig } from '../jam/infrastructure/hostthisRelay';
import { JamService } from '../jam/application/jamService';
import type { Jam } from '../jam/domain/jam';
import { rigUuidOf, type Route } from './route';

// Bring the local transport to a peer's play / pause / stop (a stop also rewinds to bar 1).
function followRemote(transport: Transport, state: TransportState): void {
  if (state === transport.state()) return;
  if (state === 'playing') transport.play();
  else if (state === 'paused') transport.pause();
  else transport.stop();
}

// The rig a route plays. A jam joined by link has no local copy yet: fetch it from the room, store
// it under the room id, re-render. A route with no rig to play goes back to the shelf.
export function useRigConfig(route: Route, navigate: NavigateFunction): RigConfig | null {
  const uuid = rigUuidOf(route);
  const [joined, setJoined] = useState(0);
  const rig = uuid ? loadRig(uuid) : null; // re-read every render: an edit keeps the same uuid
  const missing = route.kind === 'jam' && !rig;
  useEffect(() => {
    if (!missing || !uuid) return;
    let dead = false;
    fetchRoomRig(uuid).then(
      (config) => {
        if (dead) return;
        importRig(uuid, config);
        setJoined((n) => n + 1);
      },
      () => {
        if (!dead) navigate('/', { replace: true }); // no such jam (or no rooms backend)
      },
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, uuid, joined]);
  useEffect(() => {
    if (route.kind === 'bad' || (route.kind === 'rig' && !rig)) navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.kind, uuid]);
  return rig;
}

interface SessionArgs {
  rig: RigConfig | null;
  rigUuid: string | null;
  live: boolean; // a /jam route: synced over the hostthis room relay (else BroadcastChannel)
  audio: RigAudio;
  transport: Transport;
  focused: string | null;
  onFocus: (id: string | null) => void;
  connect?: Connect;
}

// Opens a rig's sync channel: a live jam over the hostthis room relay (cross-device), a local rig
// over BroadcastChannel (two tabs).
export type Connect = (rigUuid: string, live: boolean) => RigSync;
const connectRoom: Connect = (rigUuid, live) => (live ? new HostthisRelaySync(rigUuid) : new BroadcastChannelSync(rigUuid));
const NULL_SYNC: RigSync = new NullRigSync(); // no rig, or before the channel opens

// A rig's shared session: the patch cables (persisted, mirrored into the audio graph, synced), the
// shared transport over the sync channel, and the jam's presence + hard-lock occupancy.
export function useRigSession({ rig, rigUuid, live, audio, transport, focused, onFocus, connect = connectRoom }: SessionArgs) {
  const [wires, setWires] = useState<string[]>(() => rig?.wires ?? []);
  const [patchMode, setPatchMode] = useState(false);
  useEffect(() => {
    setWires(rig?.wires ?? []);
    setPatchMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rigUuid]);
  useEffect(() => {
    const on = new Set(wires);
    for (const id of rig?.instruments ?? []) {
      if (on.has(id)) audio.wire(id);
      else audio.unwire(id);
    }
  }, [wires, rig, audio]);

  // Made and disposed in one effect, never in render: StrictMode's mount-cleanup-mount then leaves a
  // live channel behind instead of reusing the one it just disposed.
  const [sync, setSync] = useState<RigSync>(NULL_SYNC);
  useEffect(() => {
    if (!rigUuid) return setSync(NULL_SYNC);
    const s = connect(rigUuid, live);
    setSync(s);
    return () => s.dispose();
  }, [rigUuid, live, connect]);
  const applyingRemote = useRef(false);
  const wiresRef = useRef(wires); // live wires, so a snapshot reply isn't a stale closure
  wiresRef.current = wires;
  const applyWires = useCallback(
    (next: string[]) => {
      if (rigUuid) saveWires(rigUuid, next);
      setWires(next);
    },
    [rigUuid],
  );
  // Broadcast local transport changes; apply remote ones (guarded so applying doesn't re-broadcast).
  // On join a peer says hello and the others reply with a snapshot (the hostthis relay answers from
  // its KV instead).
  useEffect(() => {
    const offLocal = transport.onChange(() => {
      if (applyingRemote.current) return;
      sync.send({ type: 'transport', state: transport.state(), bpm: transport.getBpm() });
    });
    const offRemote = sync.onEvent((ev) => {
      if (ev.type === 'hello') {
        sync.send({ type: 'snapshot', state: transport.state(), bpm: transport.getBpm(), wires: wiresRef.current });
        return;
      }
      applyingRemote.current = true;
      try {
        if (ev.type === 'transport' || ev.type === 'snapshot') {
          transport.setBpm(ev.bpm);
          followRemote(transport, ev.state);
          if (ev.type === 'snapshot') applyWires(ev.wires);
        } else if (ev.type === 'wire') {
          if (wiresRef.current.includes(ev.device) !== ev.on) {
            applyWires(ev.on ? [...wiresRef.current, ev.device] : wiresRef.current.filter((x) => x !== ev.device));
          }
        }
      } finally {
        applyingRemote.current = false; // a throwing listener must not silence our own broadcasts
      }
    });
    sync.send({ type: 'hello' });
    return () => {
      offLocal();
      offRemote();
    };
  }, [sync, transport, applyWires]);

  const toggleWire = useCallback(
    (id: string) => {
      setWires((prev) => {
        const on = !prev.includes(id);
        const next = on ? [...prev, id] : prev.filter((x) => x !== id);
        if (rigUuid) saveWires(rigUuid, next);
        if (!applyingRemote.current) sync.send({ type: 'wire', device: id, on });
        return next;
      });
    },
    [rigUuid, sync],
  );

  // Occupancy: claim the focused device, release on unfocus; losing it (a claim race or idling out)
  // drops back to the all-view; input on the held device holds off the idle release.
  const [jamSvc, setJamSvc] = useState<JamService | null>(null);
  useEffect(() => {
    if (!rigUuid || sync === NULL_SYNC) return setJamSvc(null);
    const svc = new JamService(rigUuid, sync);
    setJamSvc(svc);
    return () => svc.dispose();
  }, [rigUuid, sync]);
  const [jamView, setJamView] = useState<Jam | null>(null);
  useEffect(() => (jamSvc ? jamSvc.subscribe(setJamView) : setJamView(null)), [jamSvc]);
  useEffect(() => {
    if (!jamSvc) return;
    if (focused) jamSvc.claim(focused);
    else jamSvc.release();
  }, [jamSvc, focused]);
  useEffect(() => jamSvc?.onLost(() => onFocus(null)), [jamSvc, onFocus]);
  useEffect(() => {
    if (!jamSvc || !focused) return;
    const touch = () => jamSvc.touch();
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [jamSvc, focused]);
  const canTake = useCallback((id: string) => !jamSvc || jamSvc.canClaim(id), [jamSvc]);
  const players = jamView ? Object.keys(jamView.members).length : 1;

  return { wires, patchMode, setPatchMode, toggleWire, canTake, players };
}

// Go live: mint a hostthis room, stash the rig in its KV (joiners fetch it), and move to the /jam
// URL, which is the invite link. A rig touches the network only here.
export function useGoLive(rig: RigConfig | null, wires: string[], onNavigate: (to: string) => void) {
  const [goingLive, setGoingLive] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const goLive = () => {
    if (!rig || goingLive) return;
    setGoingLive(true);
    void (async () => {
      try {
        const roomId = await mintRoom();
        const config: RigConfig = { ...rig, wires };
        await putRoomRig(roomId, config);
        importRig(roomId, config); // the host's local copy
        onNavigate(`/jam/${roomId}`);
      } catch {
        alert('Could not go live - the rooms backend is unreachable from this deploy.');
      } finally {
        setGoingLive(false);
      }
    })();
  };
  const copyJamLink = () => {
    void navigator.clipboard?.writeText(location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    });
  };
  return { goLive, goingLive, copyJamLink, linkCopied };
}
