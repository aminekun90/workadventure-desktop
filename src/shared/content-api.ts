/** Signals the remote WorkAdventure page may send: no payload, nothing flows back to the page. */
export const CONTENT_CHANNELS = {
  /** A notification was shown: bounce the Dock icon / flash the taskbar if the window is in the background. */
  attention: "content:attention",
  /** A notification was clicked: bring the window to the front. */
  focus: "content:focus",
} as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[keyof typeof CONTENT_CHANNELS];
