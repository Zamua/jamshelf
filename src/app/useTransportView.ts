import { useEffect, useState } from 'react';
import type { Transport } from '../transport/transport';

// What the transport bar shows: running, tempo and bar.beat. onPosition fires every pulse, but the
// state only changes a few times a second, so React bails out between beats.
export function useTransportView(transport: Transport) {
  const [view, setView] = useState(() => ({ running: transport.isRunning(), bpm: transport.getBpm(), bar: 1, beat: 1 }));
  useEffect(() => {
    const update = () => {
      const p = transport.position();
      const running = transport.isRunning();
      const bpm = transport.getBpm();
      setView((prev) => (prev.running === running && prev.bpm === bpm && prev.bar === p.bar && prev.beat === p.beat ? prev : { running, bpm, bar: p.bar, beat: p.beat }));
    };
    const offChange = transport.onChange(update);
    const offPos = transport.onPosition(update);
    update();
    return () => {
      offChange();
      offPos();
    };
  }, [transport]);
  return view;
}
