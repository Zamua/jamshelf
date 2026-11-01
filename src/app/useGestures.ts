import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { restingSpin, type Carousel, type Spin } from '../stage/motion';
import { carouselDragPos, dragSpin, inSwipeMargin, rigSwipeTarget, snapCarousel, type PointerSample } from './gestures';

const sample = (e: { clientX: number; clientY: number; timeStamp: number }): PointerSample => ({ x: e.clientX, y: e.clientY, t: e.timeStamp });

// Inspect mode: a flag plus the spin the Stage reads every frame, driven by a full-screen drag surface.
export function useInspectSpin() {
  const [inspect, setInspect] = useState(false);
  const spin = useRef<Spin>(restingSpin());
  const last = useRef<PointerSample | null>(null);

  const toggleInspect = () =>
    setInspect((on) => {
      if (!on) spin.current = restingSpin(); // each open starts square-on
      return !on;
    });
  const end = () => {
    last.current = null;
    spin.current.dragging = false;
  };
  const dragHandlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      last.current = sample(e);
      spin.current = { ...spin.current, dragging: true, vx: 0, vy: 0 };
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (!last.current) return;
      const to = sample(e);
      spin.current = dragSpin(spin.current, last.current, to);
      last.current = to;
    },
    onPointerUp: end,
    onPointerLeave: end,
    onPointerCancel: end,
  };
  return { inspect, setInspect, toggleInspect, spin, dragHandlers };
}

// Swipe-to-browse the shelf carousel. A window-level drag moves the live position (the Stage's tap
// catcher only fires on a near-still pointer, so a swipe never opens a device); release snaps.
export function useCarouselSwipe(enabled: boolean, count: number, carousel: RefObject<Carousel>, onSettle: (index: number) => void) {
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; pos: number } | null = null;
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, pos: carousel.current.pos };
      carousel.current.dragging = true;
    };
    const move = (e: PointerEvent) => {
      if (start) carousel.current.pos = carouselDragPos(start.pos, e.clientX - start.x, count);
    };
    const up = () => {
      if (!start) return;
      start = null;
      carousel.current.dragging = false;
      const snapped = snapCarousel(carousel.current.pos, count);
      carousel.current.target = snapped;
      onSettle(snapped);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled, count, carousel, onSettle]);
}

// Swipe between the devices of a rig while one is focused (see rigSwipeTarget).
export function useRigSwipe(order: readonly string[] | null, focused: string | null, canTake: (id: string) => boolean, onSwipe: (id: string) => void) {
  useEffect(() => {
    if (!order || focused === null) return;
    let start: PointerSample | null = null;
    const down = (e: PointerEvent) => {
      start = inSwipeMargin(e.clientY, window.innerHeight) ? sample(e) : null;
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const target = rigSwipeTarget(order, focused, e.clientX - start.x, e.clientY - start.y, canTake);
      start = null;
      if (target) onSwipe(target);
    };
    const cancel = () => (start = null);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [order, focused, canTake, onSwipe]);
}
