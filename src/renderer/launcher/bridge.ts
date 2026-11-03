import type { LauncherApi } from "../../shared/launcher-api.js";

declare global {
  interface Window {
    /** Exposed by src/preload/preload.cts. */
    launcherBridge: LauncherApi;
  }
}

export const api = window.launcherBridge;
