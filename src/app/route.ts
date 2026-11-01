// The URL picks the mode: the shelf, one instrument, a local rig, or a live jam (a hostthis room).
export type Route =
  | { kind: 'shelf' }
  | { kind: 'single'; id: string }
  | { kind: 'rig'; uuid: string }
  | { kind: 'jam'; uuid: string }
  | { kind: 'bad' };

export function parseRoute(pathname: string, isInstrument: (id: string) => boolean): Route {
  if (pathname === '/' || pathname === '') return { kind: 'shelf' };
  const rig = pathname.match(/^\/rig\/([A-Za-z0-9]+)\/?$/);
  if (rig) return { kind: 'rig', uuid: rig[1] };
  const jam = pathname.match(/^\/jam\/([0-9a-fA-F-]{36})\/?$/); // a hostthis room id (a UUID)
  if (jam) return { kind: 'jam', uuid: jam[1] };
  const id = pathname.replace(/^\//, '');
  return isInstrument(id) ? { kind: 'single', id } : { kind: 'bad' };
}

// The rig a route plays (a jam plays the rig stored under its room id).
export function rigUuidOf(route: Route): string | null {
  return route.kind === 'rig' || route.kind === 'jam' ? route.uuid : null;
}
