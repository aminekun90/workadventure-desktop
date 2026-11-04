import type { WebContents } from "electron";
import { z } from "zod";
import {
  CONTENT_CHANNELS,
  type AvailabilityStatus,
  type ContentCommand,
  type EnqueueRequest,
  type FollowTarget,
  type HomeJam,
  type QueueMove,
  type QueuedTrack,
  type Listening,
  type MediaState,
} from "../shared/content-api.js";

/** Values sent by the remote page: validated before use. */
export const mediaSchema = z.object({ microphone: z.boolean(), camera: z.boolean() });
export const unreadSchema = z.number().int().min(0).max(9999);
export const statusSchema = z.object({ name: z.string().regex(/^[A-Z_]{1,40}$/), label: z.string().min(1).max(60) });
/** Links are opened from the menu bar: only a Spotify track and a Spotify cover are accepted. */
export const followSchema = z
  .object({ uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/), positionMs: z.number().int().nonnegative() })
  .nullable() satisfies z.ZodType<FollowTarget | null>;
const trackUris = z.array(z.string().regex(/^spotify:track:[A-Za-z0-9]+$/)).min(1).max(5);
export const homeJamSchema = z.object({ hostName: z.string().max(100) }).nullable() satisfies z.ZodType<HomeJam | null>;
export const enqueueSchema = z.object({
  uris: trackUris,
  from: z.string().max(100),
  fromUuid: z.string().max(256).optional(),
}) satisfies z.ZodType<EnqueueRequest>;
const trackUri = z.string().regex(/^spotify:track:[A-Za-z0-9]+$/);
const queueUid = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const dequeueSchema = z.object({ uri: trackUri, uid: queueUid });
const queueEntry = z.object({ uri: trackUri, uid: queueUid });
export const moveSchema = z.union([
  queueEntry.extend({ before: queueEntry }),
  queueEntry.extend({ after: queueEntry }),
]) satisfies z.ZodType<QueueMove>;
export const likeSchema = z.object({ uri: trackUri });
/** The queue the extension reports; a track it cannot describe safely is dropped, not the whole queue. */
export const queueSchema = z.object({
  type: z.literal("queue"),
  tracks: z
    .array(
      z.object({
        uri: trackUri,
        uid: queueUid,
        title: z.string().max(200),
        artist: z.string().max(200),
        artworkUrl: z.union([z.literal(""), z.string().startsWith("https://i.scdn.co/image/").max(200)]).catch(""),
        addedBy: z.string().max(100),
        addedByUuid: z.string().max(256).catch(""),
      }) satisfies z.ZodType<QueuedTrack>,
    )
    .max(30),
});
/** What the extension sends when the user adds tracks to the home Jam from Spotify's context menu. */
export const queueRequestSchema = z.object({ type: z.literal("queue-request"), uris: trackUris });
export const listeningSchema = z.object({
  title: z.string().max(200),
  artist: z.string().max(200),
  album: z.string().max(200),
  url: z.union([z.literal(""), z.string().regex(/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/)]),
  artworkUrl: z.union([z.literal(""), z.string().startsWith("https://i.scdn.co/image/").max(200)]),
  source: z.enum(["spotify", "apple-music", ""]),
  jamAreaName: z.string().max(100),
}) satisfies z.ZodType<Listening>;

export interface ControlsState {
  /** WorkAdventure registered its microphone/camera toggles (window.WAD): toggles can be sent. */
  ready: boolean;
  /** WorkAdventure accepts status requests (only builds carrying goyan/workadventure#62). */
  statusReady: boolean;
  media: MediaState;
  unread: number;
  status: AvailabilityStatus | undefined;
  /** What the user shares about their listening (WorkAdventure builds carrying window.WAD.reportListening). */
  listening: Listening | undefined;
}

const INITIAL_STATE: ControlsState = {
  ready: false,
  statusReady: false,
  media: { microphone: false, camera: false },
  unread: 0,
  status: undefined,
  listening: undefined,
};

const states = new WeakMap<WebContents, ControlsState>();
let notify: (content: WebContents, state: ControlsState) => void = () => undefined;

/** One listener: the main process refreshes the menu bar item and the Dock badge from it. */
export function onControlsChange(listener: (content: WebContents, state: ControlsState) => void): void {
  notify = listener;
}

export function controlsOf(content: WebContents): ControlsState {
  return states.get(content) ?? INITIAL_STATE;
}

export function updateControls(content: WebContents, patch: Partial<ControlsState>): void {
  const next = { ...controlsOf(content), ...patch };
  states.set(content, next);
  notify(content, next);
}

/** A new page load starts from scratch: WorkAdventure registers its callbacks again. */
export function resetControls(content: WebContents): void {
  updateControls(content, INITIAL_STATE);
}

/** Dropped when WorkAdventure has not registered the matching callback yet. */
export function sendCommand(content: WebContents, command: ContentCommand): void {
  const state = controlsOf(content);
  const available = command.type === "set-status" ? state.statusReady : state.ready;
  if (available) content.send(CONTENT_CHANNELS.command, command);
}

/** Turns off whatever is on (screen locked, Mac asleep); never turns anything on. */
export function muteAll(content: WebContents): void {
  const { media } = controlsOf(content);
  if (media.microphone) sendCommand(content, { type: "toggle-microphone" });
  if (media.camera) sendCommand(content, { type: "toggle-camera" });
}
