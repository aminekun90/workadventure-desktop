import type { ToolbarApi } from "../../shared/toolbar-api.js";
import type { EnvironmentSetting, EnvironmentState } from "../../shared/environment-api.js";
import { byId } from "../dom.js";
import { mountAppearance } from "../appearance.js";
import { mountUpdateStatus } from "../update-status.js";
import { mountSettingsPanel } from "./settings-panel.js";

declare global { interface Window { toolbarBridge: ToolbarApi } }
const api = window.toolbarBridge;
const homeButton = byId("home", HTMLButtonElement);
const mapsButton = byId("maps", HTMLButtonElement);
const fpsLabel = byId("fps", HTMLSpanElement);
const weatherButton = byId("weather", HTMLButtonElement);
document.body.dataset["platform"] = api.platform;
mountUpdateStatus(api.update);
mountAppearance(api.appearance);
mountSettingsPanel(api);
homeButton.title = `Revenir au launcher (${api.platform === "darwin" ? "⌘⇧L" : "Ctrl+Shift+L"})`;
homeButton.addEventListener("click", () => void api.openLauncher());
byId("reload", HTMLButtonElement).addEventListener("click", () => void api.reload());
mapsButton.addEventListener("click", () => {
  const { left, bottom } = mapsButton.getBoundingClientRect();
  void api.showMaps({ x: Math.round(left), y: Math.round(bottom) });
});
weatherButton.addEventListener("click", () => {
  const { left, bottom } = weatherButton.getBoundingClientRect();
  void api.showEnvironment(weatherButton.id as EnvironmentSetting, { x: Math.round(left), y: Math.round(bottom) });
});
const labels: Record<EnvironmentState["weather"], string> = { cloudy: "Nuageux", fog: "Brouillard", real: "Réel", automatic: "Auto", clear: "Beau temps", rain: "Pluie", snow: "Neige", storm: "Orage" };
const weatherIcons: Record<EnvironmentState["weather"], string> = {
  cloudy: "M7 18a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 18H7",
  fog: "M3 9h18M5 13h14M3 17h18",
  real: "M12 22s7-8 7-13A7 7 0 0 0 5 9c0 5 7 13 7 13Zm0-16a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  automatic: "M7 16a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 16H7M10 19l2-2 2 2m0 2-2 2-2-2",
  clear: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  rain: "M7 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 15H7M8 18l-1 3m6-3-1 3m6-3-1 3",
  snow: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1",
  storm: "M7 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 18 15h-3M12 13l-4 6h4l-2 4 7-7h-5l2-3",
};

api.onEnvironment((state) => {
  const fps = state?.graphicsStats?.fps;
  fpsLabel.textContent = fps === undefined ? "— FPS" : `${Math.round(fps)} FPS`;
  fpsLabel.title = fps === undefined ? "Images par seconde mesurées par le jeu — mesure indisponible" : "Images par seconde mesurées par le jeu";
  weatherButton.disabled = !state || state.busy || !state.canEditWeather;
  weatherButton.querySelector("svg path")?.setAttribute("d", weatherIcons[state?.mapDisplayWeather ?? state?.displayWeather ?? "automatic"]);
  weatherButton.title = `Météo : ${labels[state?.mapDisplayWeather ?? state?.displayWeather ?? "automatic"]} (réglage : ${labels[state?.mapWeather ?? state?.weather ?? "automatic"]}) — changer la météo pour tout le salon`;
  weatherButton.setAttribute("aria-label", weatherButton.title);
  const error = byId("environment-error", HTMLSpanElement);
  error.hidden = !state?.error;
  error.textContent = state?.error ?? "";
  error.title = state?.error ?? "";
});
api.onState(({ label, host, loading }) => {
  byId("label", HTMLSpanElement).textContent = label;
  byId("host", HTMLSpanElement).textContent = host;
  document.body.dataset["loading"] = String(loading);
});
