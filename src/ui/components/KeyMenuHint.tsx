import type { ViewModel } from '../../application/state';
import './KeyMenuHint.css';

// A light 2D readout that appears while EITHER menu (gray KEY or red MODE) is open.
// It renders the open menu's fields (from the ViewModel, so it never re-derives
// state) with the active one highlighted, so the joystick edit is legible without
// leaning on the tiny OLED. Purely informational: pointer-events are off so it
// never blocks the device.
export interface KeyMenuHintProps {
  vm: ViewModel;
}

export function KeyMenuHint({ vm }: KeyMenuHintProps) {
  if (!vm.menuOpen) return null;

  return (
    <div className="keyhint" role="status" aria-live="polite">
      <p className="keyhint-kind">{vm.menuKind === 'KEY' ? 'KEY / SCALE / OCTAVE' : 'PLAY MODE'}</p>
      <div className="keyhint-fields">
        {vm.menuFields.map((f) => (
          <div key={f.label} className={'keyhint-field' + (f.active ? ' is-active' : '')}>
            <span className="keyhint-label">{f.label}</span>
            <span className="keyhint-value">{f.value}</span>
          </div>
        ))}
      </div>
      <p className="keyhint-tip">joystick: up / down picks a field, left / right changes it</p>
    </div>
  );
}
