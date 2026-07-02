import './Manual.css';

export interface ManualProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  title: string;
  body: string;
}

const ITEMS: readonly Item[] = [
  {
    title: 'Program a beat',
    body:
      'Pick a drum voice from the top row, then tap the 16 step buttons along the bottom to place hits. The buttons are colored in groups of 4 (the classic look); a lit LED means that step will fire.',
  },
  {
    title: 'Switch voices',
    body:
      'Each voice keeps its own 16-step pattern. Tap another voice to program it; a dot marks voices that already have hits. Layer kick, snare, hats and more into a groove.',
  },
  {
    title: 'Play / stop',
    body: 'Hit START to run the sequencer; the playhead LED sweeps across the steps. Hit STOP to halt. On a keyboard, the space bar toggles play.',
  },
  {
    title: 'Tempo',
    body: 'Drag the TEMPO knob to set the BPM. When this joins a rig, it will lock to the shared tempo so it stays in time with the other instruments.',
  },
  {
    title: 'Power',
    body: 'The power state mutes every voice and stops playback.',
  },
  {
    title: 'Desktop keys',
    body: 'Space plays/stops; number keys 1 to 8 select a voice.',
  },
];

export function Manual({ open, onClose }: ManualProps) {
  if (!open) return null;

  return (
    <div className="manual-backdrop" onPointerDown={onClose} role="presentation">
      <div className="manual-card" role="dialog" aria-modal="true" aria-label="How to play" onPointerDown={(e) => e.stopPropagation()}>
        <button className="manual-close" onClick={onClose} aria-label="Close guide">
          &times;
        </button>
        <p className="manual-eyebrow">Quick guide</p>
        <h2 className="manual-title">How to play</h2>
        <p className="manual-lede">Sixteen steps, eight voices, one groove.</p>
        <ul className="manual-list">
          {ITEMS.map((item) => (
            <li className="manual-item" key={item.title}>
              <div className="manual-item-head">
                <h3 className="manual-item-title">{item.title}</h3>
              </div>
              <p className="manual-item-body">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="manual-foot">Tap anywhere outside this card to close.</p>
      </div>
    </div>
  );
}
