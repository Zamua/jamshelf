import type { RigSummary } from '../rig/rigStore';
import { instrumentById } from '../instruments/registry';

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

// The "your rigs" bottom sheet: a new-rig row + a card per saved rig (open on tap, edit / delete
// per card). All state lives in localStorage; this is a pure presentation of listRigs().
export function RigsDrawer({ open, rigs, onClose, onNew, onOpen, onEdit, onDelete }: Props) {
  return (
    <>
      <div className={'rigs-scrim' + (open ? ' is-open' : '')} onClick={onClose} />
      <div className={'rigs-sheet' + (open ? ' is-open' : '')} role="dialog" aria-label="Your rigs" aria-hidden={!open}>
        <div className="rigs-grab" />
        <h2 className="rigs-h">Your rigs</h2>
        <div className="rigs-list">
          <button className="rig-add" onClick={onNew}>
            <span className="rig-add-plus">＋</span> new rig
          </button>
          {rigs.length === 0 && <p className="rigs-empty">No rigs yet. Build one to jam several instruments in sync.</p>}
          {rigs.map((r) => {
            const names = r.instruments.map((id) => instrumentById(id)?.manifest.name ?? id);
            return (
              <div key={r.uuid} className="rig-card" onClick={() => onOpen(r.uuid)}>
                <div className="rig-chips">
                  {r.instruments.map((id) => {
                    const m = instrumentById(id)?.manifest;
                    return (
                      <span key={id} className="rig-chip" style={{ background: m?.accent ?? '#8a7256' }}>
                        {(m?.name ?? id).charAt(0).toUpperCase()}
                      </span>
                    );
                  })}
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
