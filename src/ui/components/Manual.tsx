import './Manual.css';

// A dismissable guide to the instrument, written entirely in the clone's own
// terms (no real brand name). Rendered as a dark card over the 3D stage.
export interface ManualProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  // Optional colored chip for the three menu buttons; plain label otherwise.
  chip?: { label: string; tone: 'gray' | 'yellow' | 'red' };
  title: string;
  body: string;
}

const ITEMS: readonly Item[] = [
  {
    title: 'The 7 pads',
    body:
      'Tap a pad to play one of seven chords that always fit the chosen key and scale, so there are no wrong notes. The bottom row is degrees 1, 3, 5, 7; the top row tucks 2, 4, 6 in between, piano-style.',
  },
  {
    title: 'Joystick morph',
    body:
      'Hold a pad, then push the joystick to morph the held chord live: 7th, 9th, sus4, sus2, open, add9, 6th, jazz. Let go and the chord springs back to a plain triad.',
  },
  {
    chip: { label: 'GRAY', tone: 'gray' },
    title: 'Key menu',
    body:
      'The gray button opens the key / scale / octave menu. Push the joystick up or down to pick a field, left or right to change its value. Press gray again to close.',
  },
  {
    chip: { label: 'YELLOW', tone: 'yellow' },
    title: 'Sound',
    body: 'The yellow button cycles through the synth voices.',
  },
  {
    chip: { label: 'RED', tone: 'red' },
    title: 'Play modes',
    body:
      'The red button opens the mode menu on the screen. Joystick up or down picks a field, left or right changes it. Cycle the mode through Play, Strum, Arpeggio, Drone, Repeat and Lead, set the arp pattern or strum speed, and dial the BPM (which now drives strum, arp and repeat).',
  },
  {
    title: 'Drone (hands-free)',
    body:
      'In Drone mode a chord latches on: tap a pad and it keeps playing on its own, so you can shape it with the joystick using your other hand. Tap the same pad to stop it, or another pad to switch chords.',
  },
  {
    title: 'Power',
    body: 'The power button toggles the device on and off. Powering off mutes every voice.',
  },
  {
    title: '3D inspect',
    body: 'Tap 3D to spin the device and look all around it. Tap play to go back to playing.',
  },
  {
    title: 'Multi-touch',
    body:
      'Hold several pads at once to stack chords. Slide a finger across the pads to glide from one chord to the next.',
  },
  {
    title: 'Desktop keys',
    body: 'On a keyboard, the number keys 1 to 7 play the seven pads.',
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
        <p className="manual-lede">Seven pads, one key, no wrong notes.</p>

        <ul className="manual-list">
          {ITEMS.map((item) => (
            <li className="manual-item" key={item.title}>
              <div className="manual-item-head">
                {item.chip ? (
                  <span className={'manual-chip manual-chip-' + item.chip.tone}>
                    {item.chip.label}
                  </span>
                ) : null}
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
