import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import type { EnqueueRequest, FollowTarget, HomeJam, QueueMove, QueueState, SpotifyTrack, SpotifyMusicFrame } from "../shared/content-api.js";
import type { SpotifyPlaybackRequest, SpotifyPlaybackState } from "../shared/content-api.js";
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

const musicSchema = z.object({
  type: z.literal("music"),
  frame: z.object({
    uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/),
    beatStartMs: z.number().int().nonnegative(),
    intensity: z.number().min(0).max(1),
  }).nullable(),
});
const playbackSchema = z.object({
  type: z.literal("playback-state"),
  state: z.object({
    track: stateSchema.shape.track,
    playing: z.boolean(),
    positionMs: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().max(86_400_000),
    volume: z.number().min(0).max(1),
    shuffle: z.boolean(),
    repeat: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
});
let playback: SpotifyPlaybackState | null = null;
const playbackListeners = new Set<(state: SpotifyPlaybackState | null) => void>();

export function spicetifyPlayback(): SpotifyPlaybackState | null {
  return playback;
}

export function onSpicetifyPlayback(listener: (state: SpotifyPlaybackState | null) => void): () => void {
  playbackListeners.add(listener);
  if (playbackListeners.size === 1) extension?.send(JSON.stringify({ type: "playback-watch", watching: true }));
  return () => {
    playbackListeners.delete(listener);
    if (playbackListeners.size === 0) {
      playback = null;
      extension?.send(JSON.stringify({ type: "playback-watch", watching: false }));
    }
  };
}

function setPlayback(state: SpotifyPlaybackState | null): void {
  playback = state;
  for (const listener of playbackListeners) listener(state);
}
let music: SpotifyMusicFrame | null = null;
const musicListeners = new Set<(frame: SpotifyMusicFrame | null) => void>();

export function spicetifyMusic(): SpotifyMusicFrame | null {
  return music;
}

export function onSpicetifyMusic(listener: (frame: SpotifyMusicFrame | null) => void): () => void {
  musicListeners.add(listener);
  if (musicListeners.size === 1) extension?.send(JSON.stringify({ type: "music-watch", watching: true }));
  return () => {
    musicListeners.delete(listener);
    if (musicListeners.size === 0) {
      music = null;
      extension?.send(JSON.stringify({ type: "music-watch", watching: false }));
    }
  };
}

function setMusic(frame: SpotifyMusicFrame | null): void {
  music = frame;
  for (const listener of musicListeners) listener(frame);
}

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
  const transport = createServer((_request, response) => {
    response.writeHead(426);
    response.end();
  });
  const server = new WebSocketServer({
    server: transport,
    verifyClient: ({ origin }: { origin: string }) => {
      const allowed = SPOTIFY_APP_ORIGINS.has(origin);
      if (!allowed) logger.warn({ origin }, "Refused a Spicetify bridge connection");
      return allowed;
    },
  });
  server.on("error", () => undefined); // The HTTP transport below handles listen failures.
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  transport.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && !stopped) {
      // Another desktop client can release the port later: keep detection alive.
      retry = setTimeout(() => transport.listen(port, "127.0.0.1"), 1000);
      retry.unref();
    } else logger.warn({ err: error }, "Spicetify bridge unavailable");
  });
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const socket of server.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, 15_000);
  heartbeat.unref();
  server.on("close", () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(heartbeat);
    transport.close();
  });
  transport.listen(port, "127.0.0.1");
  server.on("connection", (socket) => {
    // One Spotify app per computer: a new connection (Spotify restarted) replaces the previous one.
    extension?.close();
    extension = socket;
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("error", (error) => logger.warn({ err: error }, "Spicetify connection failed"));
    if (musicListeners.size > 0) socket.send(JSON.stringify({ type: "music-watch", watching: true }));
    if (playbackListeners.size > 0) socket.send(JSON.stringify({ type: "playback-watch", watching: true }));
    logger.info("Spicetify extension connected");
    if (homeJam) socket.send(JSON.stringify({ type: "home-jam", hostName: homeJam.hostName }));
    notify();
    socket.on("message", (data) => receive(socket, data.toString()));
    socket.on("close", () => {
      if (extension !== socket) return;
      extension = undefined;
      track = null;
      setMusic(null);
      setPlayback(null);
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

/** Controls this computer's Spotify, without sending commands to other users. */
export function controlSpicetifyPlayback(request: SpotifyPlaybackRequest): void {
  extension?.send(JSON.stringify({ type: "playback", ...request }));
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
  const reportedMusic = musicSchema.safeParse(json);
  if (reportedMusic.success) {
    if (musicListeners.size > 0) setMusic(reportedMusic.data.frame);
    return;
  }
  const reportedPlayback = playbackSchema.safeParse(json);
  if (reportedPlayback.success) {
    if (playbackListeners.size > 0) setPlayback(reportedPlayback.data.state);
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
