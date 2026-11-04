import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import type { FollowTarget, SpotifyTrack } from "../shared/content-api.js";
import { logger } from "./logger.js";

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
});

let extension: WebSocket | undefined;
let track: SpotifyTrack | null = null;
const listeners = new Set<() => void>();

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
    notify();
    socket.on("message", (data) => receive(socket, data.toString()));
    socket.on("close", () => {
      if (extension !== socket) return;
      extension = undefined;
      track = null;
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

function receive(socket: WebSocket, raw: string): void {
  if (extension !== socket) return;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return;
  }
  const state = stateSchema.safeParse(json);
  if (!state.success) return;
  const { track: playing, positionMs, positionAt } = state.data;
  track = playing && {
    title: playing.title,
    artist: playing.artist,
    url: `https://open.spotify.com/track/${playing.uri.slice("spotify:track:".length)}`,
    ...(playing.album && { album: playing.album }),
    ...(playing.artworkUrl && { artworkUrl: playing.artworkUrl }),
    source: "spotify",
    positionMs,
    positionAt,
  };
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}
