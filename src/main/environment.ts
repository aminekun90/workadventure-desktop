import { Menu, type BrowserWindow, type WebContents } from "electron";
import { z } from "zod";
import { Christmas, EnvironmentSetting, Ground, Night, Seasonal, Weather, type EnvironmentRequest, type EnvironmentState } from "../shared/environment-api.js";
import { controlsOf, sendCommand } from "./workadventure-controls.js";

export const environmentSchema = z.object({
  weather: z.enum(Weather), displayWeather: z.enum(Weather), night: z.enum(Night), seasonal: z.enum(Seasonal).optional(), ground: z.enum(Ground).optional(), christmas: z.enum(Christmas).optional(),
  isNight: z.boolean(), effects: z.boolean(), canEditWeather: z.boolean(), busy: z.boolean(), error: z.string().max(200),
}).nullable() satisfies z.ZodType<EnvironmentState | null>;

const choices: readonly { label: string; request: EnvironmentRequest }[] = [
  { label: "Automatique", request: { setting: EnvironmentSetting.Weather, value: Weather.Automatic } },
  { label: "Beau temps", request: { setting: EnvironmentSetting.Weather, value: Weather.Clear } },
  { label: "Pluie", request: { setting: EnvironmentSetting.Weather, value: Weather.Rain } },
  { label: "Neige", request: { setting: EnvironmentSetting.Weather, value: Weather.Snow } },
  { label: "Orage", request: { setting: EnvironmentSetting.Weather, value: Weather.Storm } },
  { label: "Heure du serveur", request: { setting: EnvironmentSetting.Night, value: Night.Server } },
  { label: "Heure de l’ordinateur", request: { setting: EnvironmentSetting.Night, value: Night.Computer } },
  { label: "Toujours jour", request: { setting: EnvironmentSetting.Night, value: Night.Disabled } },
  { label: "Automatique (calendrier)", request: { setting: EnvironmentSetting.Seasonal, value: Seasonal.Auto } },
  { label: "Automne", request: { setting: EnvironmentSetting.Seasonal, value: Seasonal.Autumn } },
  { label: "Noël", request: { setting: EnvironmentSetting.Seasonal, value: Seasonal.Christmas } },
  { label: "Aucun thème", request: { setting: EnvironmentSetting.Seasonal, value: Seasonal.None } },
  { label: "Sol saisonnier", request: { setting: EnvironmentSetting.Ground, value: Ground.Seasonal } },
  { label: "Sol vert", request: { setting: EnvironmentSetting.Ground, value: Ground.Green } },
  { label: "Noël automatique (1er déc. – 6 janv.)", request: { setting: EnvironmentSetting.Christmas, value: Christmas.Auto } },
  { label: "Noël toujours actif", request: { setting: EnvironmentSetting.Christmas, value: Christmas.Always } },
  { label: "Noël désactivé", request: { setting: EnvironmentSetting.Christmas, value: Christmas.Never } },
];

/** A native menu stays above the remote game view; selecting a value applies it immediately. */
export function showEnvironmentMenu(window: BrowserWindow, content: WebContents, setting: EnvironmentSetting, anchor: { x: number; y: number }): void {
  const state = controlsOf(content).environment;
  if (!state || state.busy) return;
  if (state[setting] === undefined) return;
  if (state.seasonal !== undefined && (setting === EnvironmentSetting.Ground || setting === EnvironmentSetting.Christmas)) return;
  if (setting === EnvironmentSetting.Effects) {
    sendCommand(content, { type: "set-environment", request: { setting, value: !state.effects } });
    return;
  }
  const items = choices.filter(({ request }) => request.setting === setting).map(({ label, request }) => ({
    label,
    type: "radio" as const,
    checked: state[request.setting] === request.value,
    enabled: setting !== EnvironmentSetting.Weather || state.canEditWeather,
    click: (): void => sendCommand(content, { type: "set-environment", request }),
  }));
  Menu.buildFromTemplate(items).popup({ window, ...anchor });
}
