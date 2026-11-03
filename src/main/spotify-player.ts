import { execFile } from "node:child_process";
import type { WebContents } from "electron";
import { CONTENT_CHANNELS, type SpotifyTrack } from "../shared/content-api.js";
import { logger } from "./logger.js";

/**
 * Tells a WorkAdventure page what the Spotify app of this Mac plays, for WorkAdventure's Spotify sharing: no
 * account to link, no developer app, no Premium. Read only while the page asks (sharing is on), and only from a
 * Spotify app already running: it is never launched.
 */
export function watchSpotify(content: WebContents, { watching }: { watching: boolean }): void {
  if (!watching) {
    stopWatching(content);
    return;
  }
  if (watchers.has(content) || process.platform !== "darwin") return;
  const watcher: Watcher = { last: undefined, timer: setInterval(() => void read(content, watcher), POLL_INTERVAL_MS) };
  watchers.set(content, watcher);
  content.once("destroyed", () => stopWatching(content));
  void read(content, watcher);
}

/**
 * `spotify<TAB>title<TAB>artist<TAB>album<TAB>spotify:track:<id><TAB>cover` or `apple-music<TAB>title<TAB>artist<TAB>album`
 * from the script. Ads, podcasts and local files are not shared: only tracks of a catalog are.
 */
export function parsePlayerOutput(output: string): SpotifyTrack | null {
  const [source, title = "", artist = "", album = "", uri = "", cover = ""] = output.replace(/\r?\n$/, "").split("\t");
  if (!title) return null;
  if (source === "apple-music") return { title, artist, url: "", ...(album && { album }), source: "apple-music" };
  if (source !== "spotify") return null;
  const id = /^spotify:track:([A-Za-z0-9]+)$/.exec(uri)?.[1];
  if (!id) return null;
  return {
    title,
    artist,
    url: `https://open.spotify.com/track/${id}`,
    ...(album && { album }),
    ...(cover.startsWith("https://i.scdn.co/image/") && { artworkUrl: cover }),
    source: "spotify",
  };
}

/** Close enough to the player for a track change to show quickly; one osascript run costs a few milliseconds. */
const POLL_INTERVAL_MS = 5000;
const OSASCRIPT_TIMEOUT_MS = 3000;
/**
 * Spotify first, then Apple Music: each scripting dictionary is only compiled once its app is known to run, otherwise
 * macOS would ask where it is. Fields are separated by tabs; the first one names the player.
 */
const READ_PLAYER_SCRIPT = `
if application id "com.spotify.client" is running then
  set playing to run script "tell application id \\"com.spotify.client\\"
    if player state is playing then return \\"spotify\\" & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (spotify url of current track) & tab & (artwork url of current track)
    return \\"\\"
  end tell"
  if playing is not "" then return playing
end if
if application id "com.apple.Music" is running then
  return run script "tell application id \\"com.apple.Music\\"
    if player state is playing then return \\"apple-music\\" & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track)
    return \\"\\"
  end tell"
end if
return ""`;

interface Watcher {
  /** What the page was last told, as JSON: a track is only sent when it changes. */
  last: string | undefined;
  timer: NodeJS.Timeout;
}

const watchers = new Map<WebContents, Watcher>();

function stopWatching(content: WebContents): void {
  const watcher = watchers.get(content);
  if (!watcher) return;
  clearInterval(watcher.timer);
  watchers.delete(content);
}

async function read(content: WebContents, watcher: Watcher): Promise<void> {
  const track = parsePlayerOutput(await runPlayerScript());
  const serialized = JSON.stringify(track);
  if (serialized === watcher.last || content.isDestroyed() || watchers.get(content) !== watcher) return;
  watcher.last = serialized;
  content.send(CONTENT_CHANNELS.spotifyTrack, track);
}

/** A failed read (Automation permission refused, Spotify quitting) means nothing to share, not an error to surface. */
function runPlayerScript(): Promise<string> {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", READ_PLAYER_SCRIPT], { timeout: OSASCRIPT_TIMEOUT_MS }, (error, stdout) => {
      if (error) {
        logger.debug({ err: error }, "Spotify player not readable");
        resolve("");
        return;
      }
      resolve(stdout);
    });
  });
}
