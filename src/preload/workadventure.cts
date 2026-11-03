// Preload of the remote WorkAdventure page (see src/shared/content-api.ts for what may cross).
// Sandboxed preloads can only require "electron": channel and command names are inlined, checked by type.
import electron = require("electron");
import type { ContentChannel, ContentCommand, MediaState } from "../shared/content-api.js";

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
const toggles: Partial<Record<ContentCommand, () => void>> = {};

contextBridge.exposeInMainWorld("WAD", {
  desktop: true,
  onMuteToggle: (callback: () => void) => {
    toggles["toggle-microphone"] = callback;
    send("content:controls-ready");
  },
  onCameraToggle: (callback: () => void) => {
    toggles["toggle-camera"] = callback;
  },
});

ipcRenderer.on("content:command" satisfies ContentChannel, (_event, command: ContentCommand) => toggles[command]?.());

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
