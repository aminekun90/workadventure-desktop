import type { WebContents } from "electron";
import { z } from "zod";
import { CONTENT_CHANNELS, type AvailabilityStatus, type ContentCommand, type MediaState } from "../shared/content-api.js";

/** Values sent by the remote page: validated before use. */
export const mediaSchema = z.object({ microphone: z.boolean(), camera: z.boolean() });
export const unreadSchema = z.number().int().min(0).max(9999);
export const statusSchema = z.object({ name: z.string().regex(/^[A-Z_]{1,40}$/), label: z.string().min(1).max(60) });

export interface ControlsState {
  /** WorkAdventure registered its microphone/camera toggles (window.WAD): toggles can be sent. */
  ready: boolean;
  /** WorkAdventure accepts status requests (only builds carrying goyan/workadventure#62). */
  statusReady: boolean;
  media: MediaState;
  unread: number;
  status: AvailabilityStatus | undefined;
}

const INITIAL_STATE: ControlsState = {
  ready: false,
  statusReady: false,
  media: { microphone: false, camera: false },
  unread: 0,
  status: undefined,
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
