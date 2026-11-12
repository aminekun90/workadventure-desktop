import { execFile } from "node:child_process";
import { shell } from "electron";
import { SpotifyPlaybackCommand } from "../shared/content-api.js";
import type { ListenAlongEnvironment } from "./listen-along-install.js";
import { logger } from "./logger.js";
import { controlSpicetifyPlayback, onSpicetifyChange, spicetifyConnected } from "./spicetify-bridge.js";

/** Long enough for Spotify to start and its WorkAdventure extension to connect. */
const CONNECT_TIMEOUT_MS = 30_000;
const OSASCRIPT_TIMEOUT_MS = 10_000;

/**
 * The mini window's play button when Spotify is not connected: starts this computer's Spotify app and its playback.
 * Only on the user's click: Spotify is never opened otherwise (spotify-player.ts).
 */
export function startSpotify(env: Pick<ListenAlongEnvironment, "platform">): void {
  if (spicetifyConnected()) {
    controlSpicetifyPlayback({ command: SpotifyPlaybackCommand.Play });
    return;
  }
  if (env.platform === "darwin") {
    // Opens Spotify if needed and resumes its last track, in one step.
    execFile("osascript", ["-e", 'tell application "Spotify" to play'], { timeout: OSASCRIPT_TIMEOUT_MS }, (error) => {
      if (error) logger.warn({ err: error }, "Could not start Spotify");
    });
    return;
  }
  shell.openExternal("spotify:").catch((error: unknown) => logger.warn({ err: error }, "Could not open Spotify"));
  playOnceConnected();
}

function playOnceConnected(): void {
  const stop = onSpicetifyChange(() => {
    if (!spicetifyConnected()) return;
    finish();
    controlSpicetifyPlayback({ command: SpotifyPlaybackCommand.Play });
  });
  const timer = setTimeout(() => finish(), CONNECT_TIMEOUT_MS);
  function finish(): void {
    clearTimeout(timer);
    stop();
  }
}
