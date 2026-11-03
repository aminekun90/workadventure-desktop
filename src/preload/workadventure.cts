// Preload of the remote WorkAdventure page, deliberately tiny: two signals without payload (see
// src/shared/content-api.ts) and a notification shim. Nothing from the main process reaches the page.
import electron = require("electron");
import type { ContentChannel } from "../shared/content-api.js";

electron.contextBridge.exposeInMainWorld("workadventureDesktop", {
  requestAttention: () => electron.ipcRenderer.send("content:attention" satisfies ContentChannel),
  focusWindow: () => electron.ipcRenderer.send("content:focus" satisfies ContentChannel),
});

/**
 * Runs in the page's own world, before WorkAdventure's scripts:
 * - WorkAdventure's notification switch is off by default in browsers; here it is on, unless the user chose.
 * - Every notification asks for attention, and a click brings the window to the front.
 * - Electron never displays service-worker notifications (`showNotification` hangs), which WorkAdventure
 *   uses for chat messages: they become regular notifications, and a click opens the chat on that room
 *   with the same message WorkAdventure's service worker would send.
 */
const NOTIFICATION_SHIM = `(() => {
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
})();`;

void electron.webFrame.executeJavaScript(NOTIFICATION_SHIM);
