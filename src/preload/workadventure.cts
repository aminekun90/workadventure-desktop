// Preload of the remote WorkAdventure page (see src/shared/content-api.ts for what may cross).
// Sandboxed preloads can only require "electron": channel and command names are inlined, checked by type.
import electron = require("electron");
import type { EnvironmentRequest } from "../shared/environment-api.js";
import type {
  AvailabilityStatus,
  ContentChannel,
  ContentCommand,
  MediaState,
  MINI_WINDOW_NAME,
  QueueState,
  SpotifyTrack,
  SpotifyMusicFrame,
  SpotifyPlaybackRequest,
  SpotifyPlaybackState,
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
let requestEnvironment: ((request: EnvironmentRequest) => void) | undefined;
let onSpotifyMusic: ((frame: SpotifyMusicFrame | null) => void) | undefined;
let onSpotifyTrack: ((track: SpotifyTrack | null) => void) | undefined;
let onListenAlongAvailable: ((available: boolean) => void) | undefined;
let onQueueRequest: ((uris: string[]) => void) | undefined;
let onSpotifyQueue: ((state: QueueState) => void) | undefined;
let onSpotifyPlayback: ((state: SpotifyPlaybackState | null) => void) | undefined;

contextBridge.exposeInMainWorld("WAD", {
  desktop: true,
  watchSpotifyMusic: (callback: (frame: SpotifyMusicFrame | null) => void): (() => void) => {
    onSpotifyMusic = callback;
    send("content:spotify-music-watch", true);
    return () => {
      if (onSpotifyMusic !== callback) return;
      onSpotifyMusic = undefined;
      send("content:spotify-music-watch", false);
    };
  },
  onEnvironmentRequest: (callback: (request: EnvironmentRequest) => void) => {
    requestEnvironment = callback;
  },
  reportEnvironment: (state: unknown) => send("content:environment", state),
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
  reportAppearance: (appearance: unknown) => {
    send("content:appearance", appearance);
    rememberAppearance(appearance);
  },
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
  controlSpotifyPlayback: (request: SpotifyPlaybackRequest): void => send("content:spotify-playback", request),
  watchSpotifyPlayback: (callback: (state: SpotifyPlaybackState | null) => void): (() => void) => {
    onSpotifyPlayback = callback;
    send("content:spotify-playback-watch", true);
    return () => {
      if (onSpotifyPlayback !== callback) return;
      onSpotifyPlayback = undefined;
      send("content:spotify-playback-watch", false);
    };
  },
  refreshSpotifyQueue: () => send("content:queue-refresh"),
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

ipcRenderer.on("content:spotify-music" satisfies ContentChannel, (_event, frame: SpotifyMusicFrame | null) => {
  onSpotifyMusic?.(frame);
});
ipcRenderer.on("content:spotify-playback-state" satisfies ContentChannel, (_event, state: SpotifyPlaybackState | null) => {
  onSpotifyPlayback?.(state);
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
  if (command.type === "set-environment") requestEnvironment?.(command.request);
  else if (command.type === "set-status") requestStatus?.(command.status);
  else toggles[command.type]?.();
});

// --- Signals and state ------------------------------------------------------------------------------------
contextBridge.exposeInMainWorld("workadventureDesktop", {
  requestAttention: () => send("content:attention"),
  focusWindow: () => send("content:focus"),
  mediaChanged: reportMedia,
  // Read by the page shim: while true, WorkAdventure sees its page as shown (see the mini window below).
  keepVisible: () => keepVisible,
});

function reportMedia(): void {
  send("content:media", readMedia());
}

/** Read here rather than trusted from the page: WorkAdventure defaults both to true when unset. */
function readMedia(): MediaState {
  const read = (key: string): boolean => (localStorage.getItem(key) ?? "true") === "true";
  return { microphone: read(MEDIA_KEYS.microphone), camera: read(MEDIA_KEYS.camera) };
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

// --- Mini window --------------------------------------------------------------------------------------------
// While the user is in a conversation and WorkAdventure is not shown (minimized, hidden or covered), a floating
// window shows it: the videos of WorkAdventure's tiles (the same streams, muted: the page plays the sound), the
// names, the microphone and camera toggles, and the way back. Main allows this window only (navigation.ts) and
// gives it its options and the app's styles (mini-window.ts).
const MINI_WINDOW = "wa-desktop-mini-window" satisfies typeof MINI_WINDOW_NAME;
/** A participant's tile in WorkAdventure's camera strip (VideoMediaBox.svelte), the user's own included. */
const TILE = ".camera-box";
const CONVERSATION_CHECK_DELAY_MS = 300;
/** Streams and mute states change without DOM mutations: re-read while the mini window shows them. */
const MINI_WINDOW_REFRESH_MS = 1000;

const icon = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  microphone: icon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>'),
  microphoneOff: icon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M3 3l18 18"/>'),
  camera: icon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>'),
  cameraOff: icon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3zM3 3l18 18"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
};
const MINI_WINDOW_HTML = `
  <header class="mini-header">
    <span class="mini-title">En réunion</span><span class="mini-count"></span>
    <button class="mini-close" type="button" aria-label="Fermer la mini-fenêtre">${ICONS.close}</button>
  </header>
  <main class="mini-grid"></main>
  <footer class="mini-controls">
    <button class="mini-toggle" type="button" data-action="toggle-microphone"></button>
    <button class="mini-toggle" type="button" data-action="toggle-camera"></button>
    <button class="button primary" type="button" data-action="back">Revenir</button>
  </footer>`;

interface Participant {
  name: string;
  muted: boolean;
  stream: MediaStream | null;
}

let keepVisible = false;
let miniWindow: Window | null = null;
/** Closed by hand: stays closed until the user comes back to WorkAdventure. */
let dismissed = false;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let appearance: { palette: string; font: string } | undefined;

// Registered before the page shim's listener, which hides the real changes from WorkAdventure: the preload sees them.
window.addEventListener(
  "visibilitychange",
  (event) => {
    if (event.isTrusted) syncMiniWindow();
  },
  true,
);

function watchConversation(): void {
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      syncMiniWindow();
    }, CONVERSATION_CHECK_DELAY_MS);
  }).observe(document.body, { childList: true, subtree: true });
}

function syncMiniWindow(): void {
  const participants = readParticipants();
  const inConversation = participants.length > 1;
  setKeepVisible(inConversation);
  // The preload's world reads the real state: the page shim only changes what WorkAdventure's world reads.
  const away = document.visibilityState === "hidden";
  if (!away) dismissed = false;
  if (miniWindow?.closed) {
    dismissed = true;
    forgetMiniWindow();
  }
  if (inConversation && away && !dismissed) showMiniWindow(participants);
  else closeMiniWindow();
}

function readParticipants(): Participant[] {
  return [...document.querySelectorAll<HTMLElement>(TILE)].map((tile) => {
    const name = tile.innerText.trim().split("\n")[0]?.trim() ?? "";
    const video = tile.querySelector("video");
    const stream = video?.srcObject instanceof MediaStream ? video.srcObject : null;
    // WorkAdventure labels the muted icon "<name> est en sourdine." (video.user_is_muted).
    const muted = [...tile.querySelectorAll("[aria-label]")].some((element) => element.getAttribute("aria-label")?.startsWith(name));
    return { name, muted, stream };
  });
}

/** WorkAdventure re-reads its visibility: shown while kept visible, the real state afterwards. */
function setKeepVisible(value: boolean): void {
  if (value === keepVisible) return;
  keepVisible = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

function showMiniWindow(participants: Participant[]): void {
  if (!miniWindow) {
    miniWindow = window.open("about:blank", MINI_WINDOW);
    if (!miniWindow) return;
    buildMiniWindow(miniWindow.document);
    refreshTimer = setInterval(syncMiniWindow, MINI_WINDOW_REFRESH_MS);
  }
  renderMiniWindow(miniWindow.document, participants);
}

function closeMiniWindow(): void {
  const closing = miniWindow;
  forgetMiniWindow();
  closing?.close();
}

function forgetMiniWindow(): void {
  clearInterval(refreshTimer);
  refreshTimer = undefined;
  miniWindow = null;
}

function buildMiniWindow(doc: Document): void {
  doc.title = "WorkAdventure";
  doc.body.innerHTML = MINI_WINDOW_HTML;
  doc.querySelector(".mini-close")?.addEventListener("click", () => {
    dismissed = true;
    closeMiniWindow();
  });
  doc.querySelector('[data-action="back"]')?.addEventListener("click", () => send("content:focus"));
  for (const type of ["toggle-microphone", "toggle-camera"] as const) {
    doc.querySelector(`[data-action="${type}"]`)?.addEventListener("click", () => toggles[type]?.());
  }
}

function renderMiniWindow(doc: Document, participants: Participant[]): void {
  if (appearance) {
    doc.documentElement.dataset["palette"] = appearance.palette;
    doc.documentElement.dataset["font"] = appearance.font;
  }
  const count = doc.querySelector(".mini-count");
  if (count) count.textContent = `${participants.length} personnes`;
  const grid = doc.querySelector(".mini-grid");
  if (!grid) return;
  while (grid.children.length > participants.length) grid.lastElementChild?.remove();
  participants.forEach((participant, index) => {
    renderTile(grid.children[index] ?? grid.appendChild(createTile(doc)), participant);
  });
  const media = readMedia();
  renderToggle(doc, "toggle-microphone", media.microphone, ICONS.microphone, ICONS.microphoneOff, "micro");
  renderToggle(doc, "toggle-camera", media.camera, ICONS.camera, ICONS.cameraOff, "caméra");
}

function createTile(doc: Document): HTMLElement {
  const tile = doc.createElement("div");
  tile.className = "mini-tile";
  const video = doc.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  const initial = doc.createElement("div");
  initial.className = "mini-initial";
  const label = doc.createElement("div");
  label.className = "mini-name";
  label.innerHTML = ICONS.microphoneOff;
  label.append(doc.createElement("span"));
  tile.append(video, initial, label);
  return tile;
}

function renderTile(tile: Element, { name, muted, stream }: Participant): void {
  const video = tile.querySelector("video");
  if (video && video.srcObject !== stream) video.srcObject = stream;
  if (video) video.hidden = stream === null;
  const initial = tile.querySelector<HTMLElement>(".mini-initial");
  if (initial) {
    initial.hidden = stream !== null;
    initial.textContent = name.charAt(0).toUpperCase();
  }
  const label = tile.querySelector(".mini-name span");
  if (label) label.textContent = name;
  tile.querySelector(".mini-name svg")?.toggleAttribute("hidden", !muted);
}

function renderToggle(doc: Document, action: string, on: boolean, iconOn: string, iconOff: string, device: string): void {
  const button = doc.querySelector(`[data-action="${action}"]`);
  if (!button) return;
  const state = on ? "on" : "off";
  if (button.getAttribute("data-state") === state) return;
  button.setAttribute("data-state", state);
  button.classList.toggle("is-off", !on);
  button.innerHTML = on ? iconOn : iconOff;
  button.setAttribute("aria-label", on ? `Couper le ${device}` : `Activer le ${device}`);
}

function rememberAppearance(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  const { palette, font } = value as Record<string, unknown>;
  if (typeof palette === "string" && typeof font === "string") appearance = { palette, font };
}

window.addEventListener("DOMContentLoaded", () => {
  reportMedia();
  watchUnreadBadge();
  watchConversation();
});

/**
 * Runs in the page's own world, before WorkAdventure's scripts:
 * - WorkAdventure's notification switch is off by default in browsers; here it is on, unless the user chose.
 * - Every notification asks for attention, and a click brings the window to the front.
 * - Electron never displays service-worker notifications (`showNotification` hangs), which WorkAdventure
 *   uses for chat messages: they become regular notifications, and a click opens the chat on that room
 *   with the same message WorkAdventure's service worker would send.
 * - Writes of the microphone/camera keys are reported, so the menu bar shows the current state.
 * - During a conversation, the page reads as shown even when the app is minimized, hidden or covered: WorkAdventure
 *   would otherwise remove its videos, and the mini window would have nothing to show. Chromium still slows the
 *   hidden page down (no game frames drawn), only what WorkAdventure reads changes. Events dispatched by the
 *   preload (untrusted) go through, so WorkAdventure re-reads the state when it changes.
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

  const visibilityState = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState").get;
  const hidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden").get;
  Object.defineProperty(Document.prototype, "visibilityState", {
    configurable: true,
    get() { return desktop.keepVisible() ? "visible" : visibilityState.call(this); },
  });
  Object.defineProperty(Document.prototype, "hidden", {
    configurable: true,
    get() { return desktop.keepVisible() ? false : hidden.call(this); },
  });
  window.addEventListener("visibilitychange", (event) => {
    if (event.isTrusted && desktop.keepVisible()) event.stopImmediatePropagation();
  }, true);
})();`;

void webFrame.executeJavaScript(PAGE_SHIM);
