// Locally-bundled fonts for the StyloClone's drei <Text> (wordmark + labels). Bundled so
// troika-three-text never fetches a fallback from a CDN at runtime (which stalls on iOS).
import brandUrl from './Poppins-SemiBold.ttf';
import labelUrl from './ShareTechMono-Regular.ttf';

export const BRAND_FONT: string = brandUrl;
export const LABEL_FONT: string = labelUrl;
