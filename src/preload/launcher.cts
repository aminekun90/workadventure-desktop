// Sandboxed preloads can only require "electron": channel names are inlined and checked by type.
import electron = require("electron");
import type { Appearance, AppearanceApi, AppearanceChannel } from "../shared/appearance-api.js";
import type { LauncherApi, LauncherChannel } from "../shared/launcher-api.js";
import type { UpdateApi, UpdateChannel, UpdateStatus } from "../shared/update-api.js";

const invoke = <T,>(channel: LauncherChannel, ...args: unknown[]): Promise<T> => electron.ipcRenderer.invoke(channel, ...args);

// Same in every local-page preload: the look chosen in WorkAdventure.
const appearance: AppearanceApi = {
  get: () => electron.ipcRenderer.invoke("appearance:get" satisfies AppearanceChannel),
  onChange: (listener) => {
    electron.ipcRenderer.on("appearance:changed" satisfies AppearanceChannel, (_event, value: Appearance) => listener(value));
  },
};

// Same in every local-page preload: a sandboxed preload cannot import a local module.
const update: UpdateApi = {
  get: () => electron.ipcRenderer.invoke("update:get" satisfies UpdateChannel),
  apply: () => electron.ipcRenderer.invoke("update:apply" satisfies UpdateChannel),
  onChange: (listener) => {
    electron.ipcRenderer.on("update:changed" satisfies UpdateChannel, (_event, status: UpdateStatus) => listener(status));
  },
};

const api: LauncherApi = {
  platform: process.platform,
  getState: () => invoke("launcher:get-state"),
  probe: (choice) => invoke("launcher:probe", choice),
  launch: (request) => invoke("launcher:launch", request),
  installListenAlong: () => invoke("launcher:install-listen-along"),
  dismissListenAlong: () => invoke("launcher:dismiss-listen-along"),
  addSpace: (request) => invoke("launcher:add-space", request),
  removeSpace: (ref) => invoke("launcher:remove-space", ref),
  restoreSpaces: () => invoke("launcher:restore-spaces"),
  update,
  appearance,
};

electron.contextBridge.exposeInMainWorld("launcherBridge", api);
