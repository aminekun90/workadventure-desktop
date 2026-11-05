// Preload of the remote WorkAdventure page (see src/shared/content-api.ts for what may cross).
// Sandboxed preloads can only require "electron": channel and command names are inlined, checked by type.
import electron = require("electron");
import type {
  AvailabilityStatus,
  ContentChannel,
  ContentCommand,
  MediaState,
  QueueState,
  SpotifyTrack,
  StatusRequest,
} from "../shared/content-api.js";

const { contextBridge, ipcRenderer, webFrame } = electron;
const send = (channel: ContentChannel, payload?: unknown): void => ipcRenderer.send(channel, payload);

/** WorkAdventure stores the microphone/camera the user asked for under these keys (LocalUserStore.ts). */
const MEDIA_KEYS = { microphone: "requestedMicrophoneStateKey", camera: "requestedCameraStateKey" } as const;
/** The badge of WorkAdventure's chat button (ChatMenuItem.svelte). */
const UNREAD_BADGE = '[data-testid="unreadMessagesCount"]';
const UNREAD_CHECK_DELAY_MS = 500;

// --- WorkAdventure's desktop API -----------------------------------------------------------------------
// WorkAdventure looks for `window.WAD` at startup (Api/Desktop/index.ts) and registers its own microphone
// and camera toggles: the main process triggers them, so WorkAdventure stays the only one touching media.
// Only the members WorkAdventure actually calls are provided.
const toggles: Partial<Record<"toggle-microphone" | "toggle-camera", () => void>> = {};
let requestStatus: ((request: StatusRequest) => void) | undefined;
let onSpotifyTrack: ((track: SpotifyTrack | null) => void) | undefined;
let onListenAlongAvailable: ((available: boolean) => void) | undefined;
let onQueueRequest: ((uris: string[]) => void) | undefined;
let onSpotifyQueue: ((state: QueueState) => void) | undefined;

contextBridge.exposeInMainWorld("WAD", {
  desktop: true,
  onMuteToggle: (callback: () => void) => {
    toggles["toggle-microphone"] = callback;
    send("content:controls-ready");
  },
  onCameraToggle: (callback: () => void) => {
    toggles["toggle-camera"] = callback;
  },
  // Status members only exist in WorkAdventure builds carrying goyan/workadventure#62.
  onStatusRequest: (callback: (request: StatusRequest) => void) => {
    requestStatus = callback;
    send("content:status-ready");
  },
  // The look chosen in WorkAdventure's settings: the local pages follow it (fork, Api/Desktop/index.ts).
  reportAppearance: (appearance: unknown) => send("content:appearance", appearance),
  reportStatus: (name: string, label: string) => {
    const status: AvailabilityStatus = { name, label };
    send("content:status", status);
  },
  // What the user shares about their listening, whatever its source (fork, Api/Desktop/index.ts). Validated in main.
  reportListening: (listening: unknown) => send("content:listening", listening),
  // Listening along, through the WorkAdventure Spicetify extension (fork, Spotify/ListeningFollower.ts).
  followListening: (target: unknown) => send("content:follow", target),
  onListenAlongAvailable: (callback: (available: boolean) => void) => {
    onListenAlongAvailable = callback;
    send("content:listen-along-ready");
  },
  // Home Jam (fork, Spotify/HomeJam.ts): guests add tracks from Spotify to the host's queue. Validated in main.
  setHomeJam: (jam: unknown) => send("content:home-jam", jam),
  onQueueRequest: (callback: (uris: string[]) => void) => {
    onQueueRequest = callback;
  },
  enqueueOnSpotify: (request: unknown) => send("content:enqueue", request),
  // The Jukebox's queue (fork, Spotify/HomeJam.ts): the host's page shows it and removes tracks from it.
  watchSpotifyQueue: (callback: (state: QueueState) => void) => {
    onSpotifyQueue = callback;
    send("content:queue-watch", true);
    return () => {
      if (onSpotifyQueue !== callback) return;
      onSpotifyQueue = undefined;
      send("content:queue-watch", false);
    };
  },
  dequeueOnSpotify: (track: unknown) => send("content:dequeue", track),
  moveInSpotifyQueue: (move: unknown) => send("content:move", move),
  // Heart on a card or a Jukebox track: saved to the Liked Songs of this Spotify.
  likeOnSpotify: (track: unknown) => send("content:like", track),
  // Spotify sharing without an account: WorkAdventure calls it while sharing is on (fork, LocalSpotifyPlayer.ts).
  watchSpotifyTrack: (callback: (track: SpotifyTrack | null) => void) => {
    onSpotifyTrack = callback;
    send("content:spotify-watch", true);
    return () => {
      if (onSpotifyTrack !== callback) return;
      onSpotifyTrack = undefined;
      send("content:spotify-watch", false);
    };
  },
});

ipcRenderer.on("content:spotify-track" satisfies ContentChannel, (_event, track: SpotifyTrack | null) => {
  onSpotifyTrack?.(track);
});

ipcRenderer.on("content:spotify-queue" satisfies ContentChannel, (_event, state: QueueState) => {
  onSpotifyQueue?.(state);
});

ipcRenderer.on("content:queue-request" satisfies ContentChannel, (_event, uris: string[]) => {
  onQueueRequest?.(uris);
});

ipcRenderer.on("content:listen-along-available" satisfies ContentChannel, (_event, available: boolean) => {
  onListenAlongAvailable?.(available);
});

ipcRenderer.on("content:command" satisfies ContentChannel, (_event, command: ContentCommand) => {
  if (command.type === "set-status") requestStatus?.(command.status);
  else toggles[command.type]?.();
});

// --- Signals and state ------------------------------------------------------------------------------------
contextBridge.exposeInMainWorld("workadventureDesktop", {
  requestAttention: () => send("content:attention"),
  focusWindow: () => send("content:focus"),
  mediaChanged: reportMedia,
});

function reportMedia(): void {
  // Read here rather than trusted from the page: WorkAdventure defaults both to true when unset.
  const read = (key: string): boolean => (localStorage.getItem(key) ?? "true") === "true";
  const media: MediaState = { microphone: read(MEDIA_KEYS.microphone), camera: read(MEDIA_KEYS.camera) };
  send("content:media", media);
}

function watchUnreadBadge(): void {
  let last = -1;
  let scheduled = false;
  const check = (): void => {
    scheduled = false;
    const count = Number.parseInt(document.querySelector(UNREAD_BADGE)?.textContent ?? "", 10) || 0;
    if (count === last) return;
    last = count;
    send("content:unread", count);
  };
  // The page changes constantly (game canvas, video): batch checks instead of reading on every mutation.
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(check, UNREAD_CHECK_DELAY_MS);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  check();
}

window.addEventListener("DOMContentLoaded", () => {
  reportMedia();
  watchUnreadBadge();
});

/**
 * Runs in the page's own world, before WorkAdventure's scripts:
 * - WorkAdventure's notification switch is off by default in browsers; here it is on, unless the user chose.
 * - Every notification asks for attention, and a click brings the window to the front.
 * - Electron never displays service-worker notifications (`showNotification` hangs), which WorkAdventure
 *   uses for chat messages: they become regular notifications, and a click opens the chat on that room
 *   with the same message WorkAdventure's service worker would send.
 * - Writes of the microphone/camera keys are reported, so the menu bar shows the current state.
 */
const PAGE_SHIM = `(() => {
  const desktop = window.workadventureDesktop;
  if (localStorage.getItem("notificationPermission") === null) localStorage.setItem("notificationPermission", "true");

  const NativeNotification = window.Notification;
  window.Notification = class extends NativeNotification {
    constructor(title, options) {
      super(title, options);
      desktop.requestAttention();
      this.addEventListener("click", () => desktop.focusWindow());
    }
  };

  ServiceWorkerRegistration.prototype.showNotification = async function (title, options = {}) {
    const notification = new window.Notification(title, options);
    const chatRoomId = options.data?.chatRoomId;
    if (!chatRoomId) return;
    notification.addEventListener("click", () => {
      new BroadcastChannel("message").postMessage({ type: "openChat", data: { chatRoomId } });
    });
  };

  const mediaKeys = new Set(${JSON.stringify(Object.values(MEDIA_KEYS))});
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (mediaKeys.has(key)) desktop.mediaChanged();
  };
})();`;

void webFrame.executeJavaScript(PAGE_SHIM);
