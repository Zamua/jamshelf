import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The whole app is a direct-manipulation instrument: there is nothing to select,
// zoom, or long-press. Suppress the iOS selection loupe / magnifier (selectstart)
// and pinch / double-tap zoom (gesturestart) globally so a tap or hold on a pad can
// never get hijacked by an OS gesture (which also stranded the joystick mid-drag).
document.addEventListener('selectstart', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
