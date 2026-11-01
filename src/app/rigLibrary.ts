import { useEffect, useState } from 'react';
import { createRig, deleteRig, listRigs, loadRig, scatterFor, updateRig, type Placement, type RigSummary } from '../rig/rigStore';

interface LibraryArgs {
  onShelf: boolean; // the plain shelf is showing (the drawer belongs to it)
  resume: (ids: readonly string[]) => void; // unlock these instruments' audio on this gesture
  onNavigate: (to: string) => void;
}

// The "your rigs" drawer and the in-room build overlay: lay instruments on the desk, save a new rig
// or an edit (same uuid, so its URL and room survive), open or delete saved ones.
export function useRigLibrary({ onShelf, resume, onNavigate }: LibraryArgs) {
  const [building, setBuilding] = useState(false);
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rigs, setRigs] = useState<RigSummary[]>([]);

  useEffect(() => {
    if (onShelf) setRigs(listRigs()); // fresh on every return to the shelf
    else setDrawerOpen(false);
  }, [onShelf]);

  const startBuild = (uuid: string | null, from: Record<string, Placement>) => {
    setDrawerOpen(false);
    setEditingUuid(uuid);
    setPlacements(from);
    setBuilding(true);
  };
  const stopBuild = () => {
    setBuilding(false);
    setEditingUuid(null);
  };

  return {
    building,
    placements,
    editingUuid,
    drawerOpen,
    rigs,
    // a tap in the build overlay: lay the instrument on the desk, or take it back off
    toggleOnDesk: (id: string) => {
      resume([id]);
      setPlacements((p) => {
        if (!(id in p)) return { ...p, [id]: scatterFor(p) };
        const { [id]: _drop, ...rest } = p;
        return rest;
      });
    },
    saveBuild: () => {
      const ids = Object.keys(placements);
      if (ids.length < 1) return;
      let uuid = editingUuid;
      if (uuid) updateRig(uuid, ids, placements);
      else uuid = createRig(ids, placements);
      stopBuild();
      resume(ids);
      onNavigate(`/rig/${uuid}`);
    },
    cancelBuild: stopBuild,
    openDrawer: () => {
      setRigs(listRigs());
      setDrawerOpen(true);
    },
    closeDrawer: () => setDrawerOpen(false),
    newRig: () => startBuild(null, {}),
    editRig: (uuid: string) => {
      const c = loadRig(uuid);
      if (c) startBuild(uuid, c.placements);
    },
    openRig: (uuid: string) => {
      setDrawerOpen(false);
      const c = loadRig(uuid);
      if (c) resume(c.instruments);
      onNavigate(`/rig/${uuid}`);
    },
    removeRig: (uuid: string) => {
      if (!window.confirm('Delete this rig? This cannot be undone.')) return;
      deleteRig(uuid);
      setRigs(listRigs());
    },
  };
}
