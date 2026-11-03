import { z } from "zod";

/** Public listing of WorkAdventure's map-storage (no authentication needed to read). */
const MAPS_ENDPOINT = "/map-storage/maps";
const ROOM_PREFIX = "/~/";
const FETCH_TIMEOUT_MS = 5000;

/** The subset of `fetch` used here, satisfied by both the global fetch and Electron's `net.fetch`. */
type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/**
 * Maps hidden from the picker: backups taken before a map change, and generated `.tmj` conversions.
 * A denylist on purpose: a map wrongly listed is harmless, a new map wrongly hidden is not.
 */
const HIDDEN_MAP_PATTERNS = [/-before-/, /^tmj-/];

const mapsResponseSchema = z.object({
  maps: z.record(z.string(), z.object({ metadata: z.object({ name: z.string().optional() }).optional() })),
});

export interface MapEntry {
  /** Path in map-storage, e.g. "goyan/office.wam". */
  path: string;
  /** Map name, suffixed with its folder when several maps share the same name. */
  label: string;
}

/** `fetch` is injected: the main process passes Electron's `net.fetch`, which honours the system proxy. */
export async function fetchMaps({ origin, fetch }: { origin: string; fetch: Fetch }): Promise<MapEntry[]> {
  const response = await fetch(new URL(MAPS_ENDPOINT, origin).href, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Map listing failed with HTTP ${response.status}`);
  return listedMaps(mapsResponseSchema.parse(await response.json()));
}

export function listedMaps({ maps }: z.infer<typeof mapsResponseSchema>): MapEntry[] {
  const named = Object.entries(maps)
    .filter(([path]) => !HIDDEN_MAP_PATTERNS.some((pattern) => pattern.test(path)))
    .map(([path, { metadata }]) => ({ path, name: metadata?.name ?? path }));
  const isShared = (name: string): boolean => named.filter((map) => map.name === name).length > 1;
  return named
    .map(({ path, name }) => ({ path, label: isShared(name) ? `${name} · ${path.split("/")[0]}` : name }))
    .toSorted((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function mapUrl(origin: string, path: string): string {
  return new URL(`${ROOM_PREFIX}${path}`, origin).href;
}

/** The map path of a room URL, or undefined outside a room (e.g. on the login page). */
export function currentMapPath(url: string): string | undefined {
  const pathname = URL.parse(url)?.pathname;
  return pathname?.startsWith(ROOM_PREFIX) ? decodeURIComponent(pathname.slice(ROOM_PREFIX.length)) : undefined;
}
