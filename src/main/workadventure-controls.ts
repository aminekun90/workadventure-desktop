import type { WebContents } from "electron";
import { z } from "zod";
import { CONTENT_CHANNELS, type ContentCommand, type MediaState } from "../shared/content-api.js";

/** Values sent by the remote page: validated before use. */
export const mediaSchema = z.object({ microphone: z.boolean(), camera: z.boolean() });
export const unreadSchema = z.number().int().min(0).max(9999);

export interface ControlsState {
  /** WorkAdventure registered its toggles (window.WAD): commands can be sent. */
  ready: boolean;
  media: MediaState;
  unread: number;
}

const INITIAL_STATE: ControlsState = { ready: false, media: { microphone: false, camera: false }, unread: 0 };

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

/** A new page load starts from scratch: WorkAdventure registers its toggles again. */
export function resetControls(content: WebContents): void {
  updateControls(content, INITIAL_STATE);
}

export function sendCommand(content: WebContents, command: ContentCommand): void {
  if (controlsOf(content).ready) content.send(CONTENT_CHANNELS.command, command);
}

/** Turns off whatever is on (screen locked, Mac asleep); never turns anything on. */
export function muteAll(content: WebContents): void {
  const { media } = controlsOf(content);
  if (media.microphone) sendCommand(content, "toggle-microphone");
  if (media.camera) sendCommand(content, "toggle-camera");
}
