import { showAvatar } from "./avatar.js";
import { api } from "./bridge.js";
import { setupDeviceCheck } from "./devices.js";
import { byId } from "../dom.js";
import { createInstancePicker } from "./instances.js";

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
if (state.avatar) showAvatar(state.avatar);
if (state.notice) showError(state.notice);

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
