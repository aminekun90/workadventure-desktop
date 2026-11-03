import { app, globalShortcut, powerMonitor } from "electron";
import { logger } from "./logger.js";

/** Work everywhere on the Mac, even when another app has the focus (same keys as Teams). */
export const SHORTCUTS = { microphone: "CommandOrControl+Shift+M", camera: "CommandOrControl+Shift+O" } as const;

export function registerGlobalShortcuts({ toggleMicrophone, toggleCamera }: { toggleMicrophone: () => void; toggleCamera: () => void }): void {
  for (const [accelerator, action] of [
    [SHORTCUTS.microphone, toggleMicrophone],
    [SHORTCUTS.camera, toggleCamera],
  ] as const) {
    // Another app may own the keys: the menu bar item still offers the action.
    if (!globalShortcut.register(accelerator, action)) logger.warn({ accelerator }, "Global shortcut already taken");
  }
  app.on("will-quit", () => globalShortcut.unregisterAll());
}

/** Locking the screen or putting the Mac to sleep means stepping away: microphone and camera go off. */
export function onStepAway(callback: () => void): void {
  powerMonitor.on("lock-screen", callback);
  powerMonitor.on("suspend", callback);
}

/** Unread chat messages on the Dock icon; 0 hides the badge. */
export function setUnreadBadge(count: number): void {
  app.setBadgeCount(count);
}

export function isOpenAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function setOpenAtLogin(openAtLogin: boolean): void {
  app.setLoginItemSettings({ openAtLogin });
}
