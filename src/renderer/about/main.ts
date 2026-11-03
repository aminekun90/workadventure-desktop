import type { AboutApi } from "../../shared/about-api.js";
import { byId } from "../dom.js";
import { mountUpdateStatus } from "../update-status.js";

declare global {
  interface Window {
    /** Exposed by src/preload/about.cts. */
    aboutBridge: AboutApi;
  }
}

const COPIED_FEEDBACK_MS = 1500;

const api = window.aboutBridge;
const info = await api.getInfo();

byId("version", HTMLSpanElement).textContent = `v${info.version}`;
const channel = byId("channel", HTMLSpanElement);
channel.textContent = info.channel === "beta" ? "Beta" : "Stable";
channel.dataset["channel"] = info.channel;
byId("electron", HTMLElement).textContent = info.electron;
byId("chromium", HTMLElement).textContent = info.chromium;
byId("node", HTMLElement).textContent = info.node;
byId("system", HTMLElement).textContent = `${info.system} · ${info.arch}`;
byId("copyright", HTMLElement).textContent = info.copyright;

mountUpdateStatus(api.update);
byId("check", HTMLButtonElement).addEventListener("click", () => void api.checkForUpdates());
byId("release-notes", HTMLButtonElement).addEventListener("click", () => void api.open("release-notes"));
byId("repository", HTMLButtonElement).addEventListener("click", () => void api.open("repository"));

const copyButton = byId("copy", HTMLButtonElement);
copyButton.addEventListener("click", () => {
  void api.copyDiagnostics().then(() => {
    copyButton.textContent = "Copié ✓";
    copyButton.dataset["done"] = "true";
    setTimeout(() => {
      copyButton.textContent = "Copier les infos";
      copyButton.dataset["done"] = "false";
    }, COPIED_FEEDBACK_MS);
  });
});
