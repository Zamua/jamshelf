import { describe, it, expect } from 'vitest';
import { carouselDragPos, dragSpin, inSwipeMargin, rigSwipeTarget, snapCarousel } from '../gestures';
import { SPIN_TILT_MAX, restingSpin } from '../../stage/motion';

describe('dragSpin', () => {
  it('turns with a horizontal drag and keeps the flick speed for the coast', () => {
    const s = dragSpin(restingSpin(), { x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 100 });
    expect(s.y).toBeGreaterThan(0);
    expect(s.vy).toBeGreaterThan(0);
    expect(s.x).toBe(0);
  });

  it('clamps the tilt and stops tilt velocity at the limit', () => {
    let s = { ...restingSpin(), x: SPIN_TILT_MAX };
    s = dragSpin(s, { x: 0, y: 0, t: 0 }, { x: 0, y: 500, t: 50 });
    expect(s.x).toBe(SPIN_TILT_MAX);
    expect(s.vx).toBe(0);
  });

  it('a zero-time move changes the pose but not the velocity', () => {
    const s = dragSpin({ ...restingSpin(), vy: 2 }, { x: 0, y: 0, t: 5 }, { x: 50, y: 0, t: 5 });
    expect(s.vy).toBe(2);
  });
});

describe('carousel drag', () => {
  it('a leftward drag moves toward the next instrument, with limited overscroll', () => {
    expect(carouselDragPos(0, -240, 4)).toBeCloseTo(1);
    expect(carouselDragPos(3, -2400, 4)).toBeCloseTo(3.35);
    expect(carouselDragPos(0, 2400, 4)).toBeCloseTo(-0.35);
  });

  it('snaps to the nearest instrument in range', () => {
    expect(snapCarousel(1.4, 4)).toBe(1);
    expect(snapCarousel(3.35, 4)).toBe(3);
    expect(snapCarousel(-0.35, 4)).toBe(0);
  });
});

describe('rig swipe', () => {
  const order = ['a', 'b', 'c'];
  const any = () => true;

  it('starts only in the top and bottom bands', () => {
    expect(inSwipeMargin(10, 1000)).toBe(true);
    expect(inSwipeMargin(990, 1000)).toBe(true);
    expect(inSwipeMargin(500, 1000)).toBe(false);
  });

  it('swipe left focuses the next device, right the previous, wrapping', () => {
    expect(rigSwipeTarget(order, 'a', -100, 0, any)).toBe('b');
    expect(rigSwipeTarget(order, 'a', 100, 0, any)).toBe('c');
    expect(rigSwipeTarget(order, 'c', -100, 0, any)).toBe('a');
  });

  it('ignores short or mostly vertical drags', () => {
    expect(rigSwipeTarget(order, 'a', -40, 0, any)).toBeNull();
    expect(rigSwipeTarget(order, 'a', -100, 150, any)).toBeNull();
  });

  it('skips devices it cannot take, and finds none when all are held', () => {
    expect(rigSwipeTarget(order, 'a', -100, 0, (id) => id !== 'b')).toBe('c');
    expect(rigSwipeTarget(order, 'a', -100, 0, () => false)).toBeNull();
  });
});
