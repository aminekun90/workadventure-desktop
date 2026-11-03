import type { ToolbarApi } from "../../shared/toolbar-api.js";
import { byId } from "../dom.js";
import { mountUpdateStatus } from "../update-status.js";

declare global {
  interface Window {
    /** Exposed by src/preload/toolbar.cts. */
    toolbarBridge: ToolbarApi;
  }
}

const api = window.toolbarBridge;
const homeButton = byId("home", HTMLButtonElement);
const mapsButton = byId("maps", HTMLButtonElement);

document.body.dataset["platform"] = api.platform;
mountUpdateStatus(api.update);
homeButton.title = `Revenir au launcher (${api.platform === "darwin" ? "⌘⇧L" : "Ctrl+Shift+L"})`;

homeButton.addEventListener("click", () => void api.openLauncher());
byId("reload", HTMLButtonElement).addEventListener("click", () => void api.reload());
mapsButton.addEventListener("click", () => {
  const { left, bottom } = mapsButton.getBoundingClientRect();
  void api.showMaps({ x: Math.round(left), y: Math.round(bottom) });
});

api.onState(({ label, host, loading }) => {
  byId("label", HTMLSpanElement).textContent = label;
  byId("host", HTMLSpanElement).textContent = host;
  document.body.dataset["loading"] = String(loading);
});
