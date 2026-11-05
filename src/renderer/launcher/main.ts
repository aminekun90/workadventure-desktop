import { showAvatar } from "./avatar.js";
import { api } from "./bridge.js";
import { setupDeviceCheck } from "./devices.js";
import { byId } from "../dom.js";
import { drawSkyline } from "../skyline.js";
import { createInstancePicker } from "./instances.js";
import { mountAppearance } from "../appearance.js";
import { mountUpdateStatus } from "../update-status.js";

const enterButton = byId("enter", HTMLButtonElement);
const skipToggle = byId("skip", HTMLInputElement);
const errorBox = byId("error", HTMLParagraphElement);

const state = await api.getState();
const picker = createInstancePicker(state.instances);
const devices = setupDeviceCheck({ onError: showError });

picker.select(state.settings.choice);
skipToggle.checked = state.settings.skipLauncher;
byId("version", HTMLSpanElement).textContent = `v${state.version}`;
byId("shortcut", HTMLElement).textContent = api.platform === "darwin" ? "⌘ ⇧ L" : "Ctrl ⇧ L";
drawSkyline(byId("skyline", SVGSVGElement));
mountUpdateStatus(api.update);
mountAppearance(api.appearance);
if (state.avatar) showAvatar(state.avatar);
if (state.notice) showError(state.notice);
if (state.offerListenAlong) setupListenAlongOffer();

enterButton.addEventListener("click", () => void enter());
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !enterButton.disabled) void enter();
});

async function enter(): Promise<void> {
  hideError();
  setBusy(true);
  devices.stop();
  const result = await api.launch({ choice: picker.selectedChoice(), skipLauncher: skipToggle.checked });
  // On success this window is replaced; only failures come back here.
  if (!result.ok) {
    showError(result.message);
    setBusy(false);
  }
}

function setupListenAlongOffer(): void {
  const section = byId("listen-along", HTMLElement);
  const install = byId("listen-along-install", HTMLButtonElement);
  const dismiss = byId("listen-along-dismiss", HTMLButtonElement);
  const status = byId("listen-along-status", HTMLParagraphElement);
  section.hidden = false;
  dismiss.addEventListener("click", () => {
    section.hidden = true;
    void api.dismissListenAlong();
  });
  install.addEventListener("click", () => void installListenAlong());

  async function installListenAlong(): Promise<void> {
    install.disabled = true;
    dismiss.disabled = true;
    status.hidden = false;
    status.textContent = "Installation en cours… Spotify va redémarrer.";
    const result = await api.installListenAlong();
    if (result.ok) {
      status.textContent = "C'est prêt : « Écouter en même temps » apparaît sur la carte d'un collègue qui écoute Spotify.";
      dismiss.hidden = true;
      install.hidden = true;
      return;
    }
    status.textContent = `${result.message}. Réessaie, ou installe Spicetify à la main (spicetify.app).`;
    install.disabled = false;
    dismiss.disabled = false;
  }
}

function setBusy(busy: boolean): void {
  enterButton.disabled = busy;
  enterButton.setAttribute("aria-busy", String(busy));
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError(): void {
  errorBox.hidden = true;
}
