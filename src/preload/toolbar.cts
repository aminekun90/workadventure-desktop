// Sandboxed preloads can only require "electron": channel names are inlined and checked by type.
import electron = require("electron");
import type { ToolbarApi, ToolbarChannel, ToolbarState } from "../shared/toolbar-api.js";
import type { UpdateApi, UpdateChannel, UpdateStatus } from "../shared/update-api.js";

const invoke = (channel: ToolbarChannel, ...args: unknown[]): Promise<void> => electron.ipcRenderer.invoke(channel, ...args);

// Same in both preloads: a sandboxed preload cannot import a local module.
const update: UpdateApi = {
  get: () => electron.ipcRenderer.invoke("update:get" satisfies UpdateChannel),
  apply: () => electron.ipcRenderer.invoke("update:apply" satisfies UpdateChannel),
  onChange: (listener) => {
    electron.ipcRenderer.on("update:changed" satisfies UpdateChannel, (_event, status: UpdateStatus) => listener(status));
  },
};

const api: ToolbarApi = {
  platform: process.platform,
  openLauncher: () => invoke("toolbar:open-launcher"),
  reload: () => invoke("toolbar:reload"),
  showMaps: (anchor) => invoke("toolbar:show-maps", anchor),
  onState: (listener) => {
    electron.ipcRenderer.on("toolbar:state" satisfies ToolbarChannel, (_event, state: ToolbarState) => listener(state));
  },
  update,
};

electron.contextBridge.exposeInMainWorld("toolbarBridge", api);
