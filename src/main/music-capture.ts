import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import { z } from "zod";
import { MUSIC_CAPTURE_CHANNELS, type MusicCaptureFrame } from "../shared/music-capture-api.js";
import { logger } from "./logger.js";
import { routeNavigation } from "./window-common.js";

const CAPTURE_HTML = fileURLToPath(new URL("../renderer/music-capture/index.html", import.meta.url));
const CAPTURE_URL = pathToFileURL(CAPTURE_HTML).href;
const CAPTURE_PRELOAD = fileURLToPath(new URL("../preload/music-capture.cjs", import.meta.url));
/** Its own session: WorkAdventure's screen share keeps the system picker, this one takes the system audio silently. */
const CAPTURE_PARTITION = "music-capture";

const unit = z.number().min(0).max(1);
const frameSchema = z.object({ level: unit, attack: unit, brightness: unit, beat: z.boolean() });

/**
 * The sound this computer plays, measured for the lights: Spotify no longer gives the analysis of its tracks (its
 * audio-analysis answers 404), so the lights of a Jukebox follow the music actually heard. A hidden page captures the
 * system audio (getDisplayMedia, loopback) and sends only its measures; it runs while someone listens to them.
 */
const listeners = new Set<(frame: MusicCaptureFrame) => void>();
let capture: BrowserWindow | undefined;

export function onCapturedMusic(listener: (frame: MusicCaptureFrame) => void): () => void {
  listeners.add(listener);
  capture ??= openCapture();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      capture?.close();
      capture = undefined;
    }
  };
}

let ipcRegistered = false;

function openCapture(): BrowserWindow {
  const captureSession = session.fromPartition(CAPTURE_PARTITION);
  captureSession.setDisplayMediaRequestHandler((_request, callback) => {
    // Electron needs a video source to grant the audio; the page stops it at once.
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then(([screen]) => callback(screen ? { video: screen, audio: "loopback" } : {}))
      .catch((error: unknown) => {
        logger.warn({ err: error }, "System audio unavailable for the lights");
        callback({});
      });
  });
  if (!ipcRegistered) {
    ipcRegistered = true;
    ipcMain.on(MUSIC_CAPTURE_CHANNELS.frame, (event, payload: unknown) => {
      if (event.senderFrame?.url !== CAPTURE_URL) return;
      const frame = frameSchema.safeParse(payload);
      if (!frame.success) return;
      for (const listener of listeners) listener(frame.data);
    });
  }
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: CAPTURE_PRELOAD,
      partition: CAPTURE_PARTITION,
      sandbox: true,
      contextIsolation: true,
    },
  });
  routeNavigation(window.webContents, (url) => url === CAPTURE_URL);
  window
    .loadURL(CAPTURE_URL)
    // getDisplayMedia needs a user activation: main gives it (the user asked for the lights by joining the Jukebox).
    .then(() => window.webContents.executeJavaScript("window.startMusicCapture()", true))
    .then((started: unknown) => {
      if (started !== true) logger.warn("No system audio track for the lights");
      else logger.info("Listening to the music for the lights");
    })
    .catch((error: unknown) => logger.warn({ err: error }, "Music capture for the lights failed"));
  window.on("closed", () => {
    if (capture === window) capture = undefined;
  });
  return window;
}
