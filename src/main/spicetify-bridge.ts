import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import type { EnqueueRequest, FollowTarget, HomeJam, QueueMove, QueueState, SpotifyTrack } from "../shared/content-api.js";
import { logger } from "./logger.js";
import { queueRequestSchema, queueSchema } from "./workadventure-controls.js";

/**
 * Talks to the WorkAdventure extension for Spicetify (aminekun90/workadventure-spicetify), inside the Spotify app of
 * this computer: it reports the playing track with its position, and plays the track of a followed user, Spotify
 * Free included. Local only, and only for the Spotify app: a web page cannot open a socket with its origin.
 */
export const SPICETIFY_BRIDGE_PORT = 47613;
const SPOTIFY_APP_ORIGINS = new Set(["https://xpui.app.spotify.com"]);

const stateSchema = z.object({
  type: z.literal("state"),
  track: z
    .object({
      uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/),
      title: z.string().min(1).max(200),
      artist: z.string().max(200),
      album: z.string().max(200),
      artworkUrl: z.union([z.literal(""), z.string().startsWith("https://i.scdn.co/image/").max(200)]),
    })
    .nullable(),
  positionMs: z.number().int().nonnegative(),
  positionAt: z.number().positive(),
  // The playlist or album the track plays from (extension 1.1.0+). Anything else is dropped, not the whole state.
  context: z
    .object({
      uri: z.string().regex(/^spotify:(playlist|album):[A-Za-z0-9]+$/),
      name: z.string().max(200),
    })
    .nullable()
    .optional()
    .catch(null),
});

let extension: WebSocket | undefined;
let track: SpotifyTrack | null = null;
const listeners = new Set<() => void>();
/** Kept to tell an extension that connects later (Spotify started after joining). */
let homeJam: HomeJam | null = null;
const queueRequestListeners = new Set<(uris: string[]) => void>();
const EMPTY_QUEUE: QueueState = { tracks: [], upcoming: [], contextName: "" };
let queue: QueueState = EMPTY_QUEUE;
const queueListeners = new Set<(state: QueueState) => void>();

export function startSpicetifyBridge(port = SPICETIFY_BRIDGE_PORT): WebSocketServer {
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port,
    verifyClient: ({ origin }: { origin: string }) => {
      const allowed = SPOTIFY_APP_ORIGINS.has(origin);
      if (!allowed) logger.warn({ origin }, "Refused a Spicetify bridge connection");
      return allowed;
    },
  });
  server.on("error", (error) => logger.warn({ err: error }, "Spicetify bridge unavailable"));
  server.on("connection", (socket) => {
    // One Spotify app per computer: a new connection (Spotify restarted) replaces the previous one.
    extension?.close();
    extension = socket;
    logger.info("Spicetify extension connected");
    if (homeJam) socket.send(JSON.stringify({ type: "home-jam", hostName: homeJam.hostName }));
    notify();
    socket.on("message", (data) => receive(socket, data.toString()));
    socket.on("close", () => {
      if (extension !== socket) return;
      extension = undefined;
      track = null;
      setQueue(EMPTY_QUEUE);
      logger.info("Spicetify extension disconnected");
      notify();
    });
  });
  return server;
}

export function spicetifyConnected(): boolean {
  return extension !== undefined;
}

/** The track the Spotify app plays, with its position; null when nothing plays or the extension is absent. */
export function spicetifyTrack(): SpotifyTrack | null {
  return track;
}

/** Called when the extension connects, disconnects or reports another state. */
export function onSpicetifyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function followOnSpicetify(target: FollowTarget | null): void {
  extension?.send(JSON.stringify(target ? { type: "follow", ...target } : { type: "unfollow" }));
}

/** The home Jam the user takes part in as a guest (null: none): the extension offers "add to the home Jam". */
export function setHomeJamOnSpicetify(jam: HomeJam | null): void {
  homeJam = jam;
  extension?.send(JSON.stringify({ type: "home-jam", hostName: jam?.hostName ?? null }));
}

/** As the home Jam's host: adds a participant's tracks to the queue of this Spotify. */
export function enqueueOnSpicetify(request: EnqueueRequest): void {
  extension?.send(JSON.stringify({ type: "enqueue", ...request }));
}

/** As the Jukebox's host: removes a track from the queue of this Spotify. */
export function dequeueOnSpicetify(track: Pick<QueueState["tracks"][number], "uri" | "uid">): void {
  extension?.send(JSON.stringify({ type: "dequeue", uri: track.uri, uid: track.uid }));
}

/** As the Jukebox's host: moves a track of the queue before or after another one. */
export function moveInSpicetifyQueue(move: QueueMove): void {
  extension?.send(JSON.stringify({ type: "move", ...move }));
}

/** Saves a track to the Liked Songs of this Spotify. */
export function likeOnSpicetify(uri: string): void {
  extension?.send(JSON.stringify({ type: "like", uri }));
}

/** What this Spotify plays next, as last reported by the extension; empty without it. */
export function spicetifyQueue(): QueueState {
  return queue;
}

/** Re-read Spotify's live context instead of relying only on the last reported queue. */
export function refreshSpicetifyQueue(): void {
  extension?.send(JSON.stringify({ type: "refresh-queue" }));
}

/** Called with the queue on every change, and once it empties when the extension disconnects. */
export function onSpicetifyQueue(listener: (state: QueueState) => void): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

/** Called with the tracks the user asks, from Spotify, to add to the home Jam. */
export function onSpicetifyQueueRequest(listener: (uris: string[]) => void): () => void {
  queueRequestListeners.add(listener);
  return () => queueRequestListeners.delete(listener);
}

function receive(socket: WebSocket, raw: string): void {
  if (extension !== socket) return;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return;
  }
  const reportedQueue = queueSchema.safeParse(json);
  if (reportedQueue.success) {
    const { tracks, upcoming, contextName } = reportedQueue.data;
    setQueue({ tracks, upcoming, contextName });
    return;
  }
  const queueRequest = queueRequestSchema.safeParse(json);
  if (queueRequest.success) {
    for (const listener of queueRequestListeners) listener(queueRequest.data.uris);
    return;
  }
  const state = stateSchema.safeParse(json);
  if (!state.success) return;
  const { track: playing, positionMs, positionAt, context } = state.data;
  track = playing && {
    title: playing.title,
    artist: playing.artist,
    url: `https://open.spotify.com/track/${playing.uri.slice("spotify:track:".length)}`,
    ...(playing.album && { album: playing.album }),
    ...(playing.artworkUrl && { artworkUrl: playing.artworkUrl }),
    source: "spotify",
    positionMs,
    positionAt,
    ...(context && { contextUri: context.uri, contextName: context.name }),
  };
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

function setQueue(state: QueueState): void {
  queue = state;
  for (const listener of queueListeners) listener(state);
}
