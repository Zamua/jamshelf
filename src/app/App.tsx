import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams } from 'react-router-dom';
import { Shelf } from '../shelf/Shelf';
import { instrumentById } from '../instruments/registry';
import './App.css';

// Mounts the instrument named in the URL (/<id>). Unknown ids fall back to the shelf.
// A single-segment route, so the future /rig/<uuid> (two segments) slots in alongside
// it with no collision. The back-to-shelf link is shared chrome (every instrument gets
// it - essential in a standalone PWA, which has no browser back button).
function InstrumentRoute() {
  const { instrumentId } = useParams();
  const manifest = instrumentId ? instrumentById(instrumentId) : undefined;
  if (!manifest) return <Navigate to="/" replace />;
  const Play = manifest.Play;
  return (
    <Suspense fallback={<div className="route-loading">loading {manifest.name}…</div>}>
      <Link to="/" className="back-to-shelf" aria-label="Back to the shelf">
        ‹
      </Link>
      <Play />
    </Suspense>
  );
}

// jamshelf: a shelf of playable instruments. `/` is the shelf, `/<id>` plays one.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shelf />} />
        <Route path="/:instrumentId" element={<InstrumentRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
