// Sandboxed preloads can only require "electron": channel names are inlined and checked by type.
import electron = require("electron");
import type { LauncherApi, LauncherChannel } from "../shared/launcher-api.js";

const invoke = <T,>(channel: LauncherChannel, ...args: unknown[]): Promise<T> => electron.ipcRenderer.invoke(channel, ...args);

const api: LauncherApi = {
  platform: process.platform,
  getState: () => invoke("launcher:get-state"),
  probe: (choice) => invoke("launcher:probe", choice),
  launch: (request) => invoke("launcher:launch", request),
};

electron.contextBridge.exposeInMainWorld("launcherBridge", api);
