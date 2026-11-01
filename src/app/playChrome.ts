// The play view's chrome around the active device: whether it has landed (taps are live only then),
// the inspect spin, and the how-to-play manual. Leaving the device resets all three, so the next one
// floats in unlanded; moving focus between rig devices keeps them.

export interface PlayChrome {
  readonly landed: boolean;
  readonly inspect: boolean;
  readonly manual: boolean;
}

export type PlayChromeEvent =
  | { readonly type: 'land' } // the active device is down: playable
  | { readonly type: 'leave' } // back to the shelf or the rig all-view
  | { readonly type: 'toggleInspect' }
  | { readonly type: 'toggleManual' }
  | { readonly type: 'closeManual' };

export const awayChrome: PlayChrome = { landed: false, inspect: false, manual: false };
export const landedChrome: PlayChrome = { ...awayChrome, landed: true }; // a cold deep link starts on the desk

export function nextPlayChrome(c: PlayChrome, e: PlayChromeEvent): PlayChrome {
  switch (e.type) {
    case 'leave':
      return awayChrome;
    case 'land':
      return c.landed ? c : { ...c, landed: true };
    case 'toggleInspect':
      return { ...c, inspect: !c.inspect };
    case 'toggleManual':
      return { ...c, manual: !c.manual };
    case 'closeManual':
      return c.manual ? { ...c, manual: false } : c;
  }
}

// The device takes taps only once it is down and not being turned over in inspect.
export const playable = (c: PlayChrome): boolean => c.landed && !c.inspect;
