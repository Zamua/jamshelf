import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { RigSummary } from '../rig/rigStore';
import { instrumentById } from '../instruments/registry';

// The sheet is SHEET_VH tall; its two open detents show DEFAULT_VH (the resting height) or the
// whole thing (full). translateY slides it: 0 = full, (SHEET-DEFAULT) = default, SHEET = dismissed.
const SHEET_VH = 0.93;
const DEFAULT_VH = 0.72;
const FLICK = 0.5; // px/ms - past this, a flick wins over nearest-snap

// "3 min ago" / "yesterday" / "2 wk ago" - a compact relative time for the rig list.
function timeAgo(ms: number): string {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = s / 60;
  if (m < 45) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 22) return `${Math.round(h)} h ago`;
  const d = h / 24;
  if (d < 1.5) return 'yesterday';
  if (d < 7) return `${Math.round(d)} days ago`;
  const w = d / 7;
  if (w < 5) return `${Math.round(w)} wk ago`;
  return `${Math.round(d / 30)} mo ago`;
}

// Phosphor (regular) pencil-simple + trash, inlined (the app's icon convention: SVG, never emoji).
function PencilIcon() {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152a15.86,15.86,0,0,0-4.69,11.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
    </svg>
  );
}

interface Props {
  open: boolean;
  rigs: RigSummary[];
  onClose: () => void;
  onNew: () => void;
  onOpen: (uuid: string) => void;
  onEdit: (uuid: string) => void;
  onDelete: (uuid: string) => void;
}

// The "your rigs" bottom sheet: draggable by its handle (follows the finger, snaps to full /
// default / dismissed), with an independently-scrolling rig list. All state is localStorage.
export function RigsDrawer({ open, rigs, onClose, onNew, onOpen, onEdit, onDelete }: Props) {
  const vh = () => (typeof window !== 'undefined' ? window.innerHeight : 900);
  const detents = () => {
    const h = vh();
    return { full: 0, half: (SHEET_VH - DEFAULT_VH) * h, dismissed: SHEET_VH * h };
  };
  const [ty, setTyState] = useState(() => vh()); // start dismissed (off-screen)
  const tyRef = useRef(ty);
  const setTy = (v: number) => {
    tyRef.current = v;
    setTyState(v);
  };
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startTy: number; lastY: number; lastT: number; v: number } | null>(null);

  // Slide to the default detent when opened, off-screen when closed (the transition animates it).
  useEffect(() => {
    const d = detents();
    setTy(open ? d.half : d.dismissed);
  }, [open]);

  const onDragStart = (e: ReactPointerEvent) => {
    drag.current = { startY: e.clientY, startTy: tyRef.current, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    setDragging(true);
  };
  // Move/up live on the WINDOW (not the handle) so the drag survives the finger leaving the handle
  // as the sheet slides up under it - the app's canonical pointer pattern (see the joystick/pads).
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const { dismissed } = detents();
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.v = (e.clientY - d.lastY) / dt; // px/ms, positive = downward
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      setTy(Math.max(0, Math.min(dismissed, d.startTy + (e.clientY - d.startY))));
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d) return;
      const { full, half, dismissed } = detents();
      const y = tyRef.current;
      let target: number;
      if (d.v > FLICK) target = y < half - 10 ? half : dismissed; // flick down: full->default->dismiss
      else if (d.v < -FLICK) target = full; // flick up: expand to full
      else target = [full, half, dismissed].reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
      setTy(target);
      if (target === dismissed) onClose();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className={'rigs-scrim' + (open ? ' is-open' : '')} onClick={onClose} />
      <div
        className={'rigs-sheet' + (dragging ? ' is-dragging' : '')}
        style={{ transform: `translateY(${ty}px)` }}
        role="dialog"
        aria-label="Your rigs"
        aria-hidden={!open}
      >
        <div className="rigs-handle" onPointerDown={onDragStart}>
          <div className="rigs-grab" />
          <h2 className="rigs-h">Your rigs</h2>
        </div>
        <div className="rigs-list">
          <button className="rig-add" onClick={onNew}>
            <span className="rig-add-plus">＋</span> new rig
          </button>
          {rigs.length === 0 && <p className="rigs-empty">No rigs yet. Build one to jam several instruments in sync.</p>}
          {rigs.map((r) => {
            const names = r.instruments.map((id) => instrumentById(id)?.manifest.name ?? id);
            // Cap the chips so the column stays a FIXED width (names never shift): show up to CHIP_MAX,
            // and if a rig has more instruments, the last slot becomes a "+N" count.
            const CHIP_MAX = 3;
            const shownIds = r.instruments.length > CHIP_MAX ? r.instruments.slice(0, CHIP_MAX - 1) : r.instruments;
            const more = r.instruments.length - shownIds.length;
            return (
              <div key={r.uuid} className="rig-card" onClick={() => onOpen(r.uuid)}>
                <div className="rig-chips">
                  {shownIds.map((id) => {
                    const m = instrumentById(id)?.manifest;
                    return (
                      <span key={id} className="rig-chip" style={{ background: m?.accent ?? '#8a7256' }}>
                        {(m?.name ?? id).charAt(0).toUpperCase()}
                      </span>
                    );
                  })}
                  {more > 0 && <span className="rig-chip rig-chip-more">+{more}</span>}
                </div>
                <div className="rig-meta">
                  <div className="rig-names">{names.join(' · ')}</div>
                  <div className="rig-when">{timeAgo(r.updatedAt)}</div>
                </div>
                <div className="rig-acts">
                  <button className="rig-icon" aria-label="Edit rig" onClick={(e) => { e.stopPropagation(); onEdit(r.uuid); }}>
                    <PencilIcon />
                  </button>
                  <button className="rig-icon rig-del" aria-label="Delete rig" onClick={(e) => { e.stopPropagation(); onDelete(r.uuid); }}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
