import './Manual.css';

// A dismissable guide to the StyloClone, written in the clone's own terms (no real brand name).
// Rendered as a dark card over the 3D stage.
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
    title: 'The keyboard',
    body:
      'Touch the silver plate to play. It is a faithful 20-key stylus keyboard spanning A2 to E4: naturals along the bottom row, sharps and flats tucked above, piano-style. On a phone, your finger IS the stylus.',
  },
  {
    title: 'One note at a time',
    body:
      'Like the original, it is strictly monophonic: only the key you touch sounds. Slide your finger across the plate and the note slurs from key to key in one continuous glide.',
  },
  {
    title: 'Vibrato',
    body: 'Flip the vibrato switch for the classic ~7 Hz wobble on the held note.',
  },
  {
    title: 'Sound',
    body: 'Tap the sound tile to cycle the voice: BUZZ is the faithful relaxation-oscillator buzz; ROUND is a mellower tone; REED is more nasal.',
  },
  {
    title: 'Tune + volume',
    body: 'Drag the tune knob to trim the pitch up or down a little, and the volume knob to set the level.',
  },
  {
    title: 'Power',
    body: 'The power switch toggles the device on and off. Powering off mutes it.',
  },
  {
    title: '3D inspect',
    body: 'Tap 3D to spin the device and look all around it. Tap play to go back to playing.',
  },
  {
    title: 'Desktop keys',
    body:
      'On a keyboard, the letter row (q, w, e, ...) plays the natural keys and the number row (1, 2, 3, ...) plays the sharps above them.',
  },
];

export function Manual({ open, onClose }: ManualProps) {
  if (!open) return null;

  return (
    <div className="manual-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="manual-card"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="manual-close" onClick={onClose} aria-label="Close guide">
          &times;
        </button>

        <p className="manual-eyebrow">Quick guide</p>
        <h2 className="manual-title">How to play</h2>
        <p className="manual-lede">One stylus, twenty keys, one dirty oscillator.</p>

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
