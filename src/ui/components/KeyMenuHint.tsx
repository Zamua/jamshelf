import type { MenuField, ViewModel } from '../../application/state';
import { NOTE_NAMES, SCALE_LABELS } from '../../domain/music';
import './KeyMenuHint.css';

// A light 2D readout that appears only while the gray key menu is open. It shows
// the three editable fields (key / scale / octave) with the active one
// highlighted, so the joystick edit is legible without leaning on the tiny OLED.
// Purely informational: pointer-events are off so it never blocks the device.
export interface KeyMenuHintProps {
  vm: ViewModel;
}

function octaveLabel(octave: number): string {
  return octave > 0 ? '+' + octave : String(octave);
}

interface Field {
  field: MenuField;
  label: string;
  value: string;
}

export function KeyMenuHint({ vm }: KeyMenuHintProps) {
  if (!vm.menuOpen) return null;

  const fields: Field[] = [
    { field: 'KEY', label: 'KEY', value: NOTE_NAMES[vm.root] },
    { field: 'SCL', label: 'SCALE', value: SCALE_LABELS[vm.scale] },
    { field: 'OCT', label: 'OCT', value: octaveLabel(vm.octave) },
  ];

  return (
    <div className="keyhint" role="status" aria-live="polite">
      <div className="keyhint-fields">
        {fields.map((f) => (
          <div
            key={f.field}
            className={'keyhint-field' + (f.field === vm.menuField ? ' is-active' : '')}
          >
            <span className="keyhint-label">{f.label}</span>
            <span className="keyhint-value">{f.value}</span>
          </div>
        ))}
      </div>
      <p className="keyhint-tip">joystick: up / down picks a field, left / right changes it</p>
    </div>
  );
}
