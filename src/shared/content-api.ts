/**
 * What the WorkAdventure page and the main process exchange, through src/preload/workadventure.cts.
 * Page → main: payload-free signals, plus small state values read by the preload (validated in main).
 * Main → page: a fixed set of commands, run through WorkAdventure's own desktop API (`window.WAD`).
 */
export const CONTENT_CHANNELS = {
  /** A notification was shown: bounce the Dock icon if the window is in the background. */
  attention: "content:attention",
  /** A notification was clicked: bring the window to the front. */
  focus: "content:focus",
  /** WorkAdventure registered its microphone/camera toggles: commands can be sent. */
  controlsReady: "content:controls-ready",
  /** Requested microphone/camera state, as WorkAdventure stores it. */
  media: "content:media",
  /** Unread chat messages, as shown on WorkAdventure's chat button. */
  unread: "content:unread",
  /** Main → page. */
  command: "content:command",
} as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[keyof typeof CONTENT_CHANNELS];

export const CONTENT_COMMANDS = ["toggle-microphone", "toggle-camera"] as const;
export type ContentCommand = (typeof CONTENT_COMMANDS)[number];

export interface MediaState {
  microphone: boolean;
  camera: boolean;
}
