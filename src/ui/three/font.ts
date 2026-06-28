// A locally-bundled font for every drei <Text> in the scene. Without this,
// troika-three-text fetches a default font from cdn.jsdelivr.net at runtime,
// which is an external request that can stall (and on iOS leaves the tab's
// loading bar spinning). Bundling the font keeps the app fully self-contained.
import oledFontUrl from './ShareTechMono-Regular.ttf';

export const OLED_FONT: string = oledFontUrl;
