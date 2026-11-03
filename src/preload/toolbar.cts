// Sandboxed preloads can only require "electron": channel names are inlined and checked by type.
import electron = require("electron");
import type { ToolbarApi, ToolbarChannel, ToolbarState } from "../shared/toolbar-api.js";

const invoke = (channel: ToolbarChannel, ...args: unknown[]): Promise<void> => electron.ipcRenderer.invoke(channel, ...args);

const api: ToolbarApi = {
  platform: process.platform,
  openLauncher: () => invoke("toolbar:open-launcher"),
  reload: () => invoke("toolbar:reload"),
  showMaps: (anchor) => invoke("toolbar:show-maps", anchor),
  onState: (listener) => {
    electron.ipcRenderer.on("toolbar:state" satisfies ToolbarChannel, (_event, state: ToolbarState) => listener(state));
  },
};

electron.contextBridge.exposeInMainWorld("toolbarBridge", api);
