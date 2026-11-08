import type { ToolbarApi } from "../../shared/toolbar-api.js";
import type { EnvironmentSetting, EnvironmentState } from "../../shared/environment-api.js";
import { byId } from "../dom.js";
import { mountAppearance } from "../appearance.js";
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
mountAppearance(api.appearance);
homeButton.title = `Revenir au launcher (${api.platform === "darwin" ? "⌘⇧L" : "Ctrl+Shift+L"})`;

homeButton.addEventListener("click", () => void api.openLauncher());
byId("reload", HTMLButtonElement).addEventListener("click", () => void api.reload());
mapsButton.addEventListener("click", () => {
  const { left, bottom } = mapsButton.getBoundingClientRect();
  void api.showMaps({ x: Math.round(left), y: Math.round(bottom) });
});

const environmentButtons = Array.from(byId("environment", HTMLDivElement).querySelectorAll("button"));
for (const button of environmentButtons) {
  button.addEventListener("click", () => {
    const { left, bottom } = button.getBoundingClientRect();
    void api.showEnvironment(button.id as EnvironmentSetting, { x: Math.round(left), y: Math.round(bottom) });
  });
}
const labels: Record<string, string> = {
  automatic: "Auto", clear: "Beau temps", rain: "Pluie", snow: "Neige", storm: "Orage",
  server: "Serveur", computer: "Mon heure", disabled: "Jour", seasonal: "Saisonnier", green: "Vert",
  auto: "Noël auto", always: "Noël actif", never: "Noël off",
};
const weatherIcons: Record<EnvironmentState["weather"], string> = {
  automatic: "M7 16a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 16H7M10 19l2-2 2 2m0 2-2 2-2-2",
  clear: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  rain: "M7 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 15H7M8 18l-1 3m6-3-1 3m6-3-1 3",
  snow: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1",
  storm: "M7 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 15h-3M12 13l-4 6h4l-2 4 7-7h-5l2-3",
};
function renderEnvironment(state: EnvironmentState | null): void {
  for (const button of environmentButtons) {
    const setting = button.id as EnvironmentSetting;
    button.disabled = !state || state.busy || (setting === "weather" && !state.canEditWeather);
    const label = button.querySelector("span");
    if (state && label) label.textContent = labels[String(state[setting])] ?? String(state[setting]);
    if (setting === "weather") {
      button.querySelector("svg path")?.setAttribute("d", weatherIcons[state?.displayWeather ?? "automatic"]);
      button.title = `Météo : ${labels[state?.displayWeather ?? "automatic"]} (réglage : ${labels[state?.weather ?? "automatic"]}) — changer la météo pour tout le salon`;
      button.setAttribute("aria-label", button.title);
    }
    if (setting === "night") {
      button.querySelector("svg path")?.setAttribute("d", state?.isNight
        ? "M19.5 14.5A8.5 8.5 0 0 1 9.5 4.5a8.5 8.5 0 1 0 10 10ZM17 3v4m-2-2h4"
        : weatherIcons.clear);
      button.title = `${state?.isNight ? "Nuit" : "Jour"} — cycle : ${labels[state?.night ?? "server"]}. Pour moi uniquement.`;
      button.setAttribute("aria-label", button.title);
    }
    if (setting === "effects") {
      button.setAttribute("aria-pressed", String(state?.effects ?? false));
      button.title = `Effets météo (pluie et neige) : ${state?.effects ? "actifs — cliquer pour les masquer" : "masqués — cliquer pour les afficher"}. Pour moi uniquement.`;
      button.setAttribute("aria-label", button.title);
    }
  }
  document.body.dataset["environmentReady"] = String(state !== null);
  const error = byId("environment-error", HTMLSpanElement);
  error.hidden = !state?.error;
  error.textContent = state?.error ?? "";
  error.title = state?.error ?? "";
}
api.onEnvironment(renderEnvironment);

api.onState(({ label, host, loading }) => {
  byId("label", HTMLSpanElement).textContent = label;
  byId("host", HTMLSpanElement).textContent = host;
  document.body.dataset["loading"] = String(loading);
});
