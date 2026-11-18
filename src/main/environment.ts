import { Menu, type BrowserWindow, type WebContents, type MenuItemConstructorOptions } from "electron";
import { z } from "zod";
import { Christmas, EnvironmentSetting, Ground, LampMusicSource, Night, Seasonal, SoundSetting, Weather, WeatherFrequency, type EnvironmentRequest, type EnvironmentState } from "../shared/environment-api.js";
import { appearanceSchema } from "../shared/appearance-api.js";
import { controlsOf, sendCommand } from "./workadventure-controls.js";

export const environmentSchema = z.object({
  appearance: appearanceSchema.optional(),
  weather: z.enum(Weather), displayWeather: z.enum(Weather), night: z.enum(Night), seasonal: z.enum(Seasonal).optional(), ground: z.enum(Ground).optional(), christmas: z.enum(Christmas).optional(),
  isNight: z.boolean(), effects: z.boolean(), canEditWeather: z.boolean(), busy: z.boolean(), error: z.string().max(200),
  mapWeather: z.enum(Weather).optional(), mapDisplayWeather: z.enum(Weather).optional(),
  clouds: z.boolean().optional(), cloudsHeight: z.number().min(0).max(1).optional(),
  weatherAuto: z.object({ frequency: z.enum(WeatherFrequency), include: z.array(z.enum(Weather)), clouds: z.boolean().optional() }).optional(),
  jungle: z.boolean().optional(),
  lampEffects: z.boolean().optional(), lampDemo: z.boolean().optional(),
  lampMusicSource: z.enum(LampMusicSource).optional(),
  sounds: z.object(Object.fromEntries(Object.values(SoundSetting).map((sound) => [sound, z.number().min(0).max(1).optional()]))).optional(),
  // Texts shown in the panel with textContent only; a malformed list drops the light controls, not the whole state.
  lightControls: z.array(z.object({
    name: z.string().min(1).max(100),
    group: z.enum(["night", "sky", "shadows", "other"]),
    label: z.string().max(200),
    kind: z.enum(["number", "switch", "choice"]),
    value: z.union([z.number().finite(), z.boolean(), z.string().max(100)]),
    min: z.number().finite().optional(), max: z.number().finite().optional(), step: z.number().positive().optional(),
    choices: z.array(z.object({ value: z.string().max(100), label: z.string().max(200) })).max(20).optional(),
    dependsOn: z.string().max(100).optional(),
  })).max(100).optional().catch(undefined),
}).nullable() satisfies z.ZodType<EnvironmentState | null>;

export const environmentRequestSchema = z.discriminatedUnion("setting", [
  z.object({ setting: z.literal(EnvironmentSetting.SoundPreview), value: z.enum(SoundSetting) }),
  z.object({ setting: z.literal(EnvironmentSetting.Appearance), value: appearanceSchema }),
  z.object({ setting: z.literal(EnvironmentSetting.Weather), value: z.enum(Weather) }),
  z.object({ setting: z.literal(EnvironmentSetting.Night), value: z.enum(Night) }),
  z.object({ setting: z.literal(EnvironmentSetting.Seasonal), value: z.enum(Seasonal) }),
  z.object({ setting: z.literal(EnvironmentSetting.Ground), value: z.enum(Ground) }),
  z.object({ setting: z.literal(EnvironmentSetting.Christmas), value: z.enum(Christmas) }),
  ...([EnvironmentSetting.Effects, EnvironmentSetting.LampEffects, EnvironmentSetting.LampDemo, EnvironmentSetting.Clouds, EnvironmentSetting.Jungle] as const).map((setting) => z.object({ setting: z.literal(setting), value: z.boolean() })),
  z.object({ setting: z.literal(EnvironmentSetting.LampMusicSource), value: z.enum(LampMusicSource) }),
  z.object({ setting: z.literal(EnvironmentSetting.CloudsHeight), value: z.number().min(0).max(1) }),
  z.object({ setting: z.literal(EnvironmentSetting.WeatherAuto), value: z.object({ frequency: z.enum(WeatherFrequency), include: z.array(z.enum(Weather)), clouds: z.boolean().optional() }) }),
  z.object({ setting: z.literal(EnvironmentSetting.Sounds), value: z.object({ sound: z.enum(SoundSetting), volume: z.number().min(0).max(1) }) }),
  z.object({ setting: z.literal(EnvironmentSetting.Light), value: z.object({ name: z.string().min(1).max(100), value: z.union([z.number().finite(), z.boolean(), z.string().max(100)]) }) }),
]) satisfies z.ZodType<EnvironmentRequest>;

const choices: readonly { label: string; request: Exclude<EnvironmentRequest, { setting: EnvironmentSetting.SoundPreview | EnvironmentSetting.Light }> }[] = [
  { label: "Automatique", request: { setting: EnvironmentSetting.Weather, value: Weather.Automatic } },
  { label: "Beau temps", request: { setting: EnvironmentSetting.Weather, value: Weather.Clear } },
  { label: "Nuageux", request: { setting: EnvironmentSetting.Weather, value: Weather.Cloudy } },
  { label: "Brouillard", request: { setting: EnvironmentSetting.Weather, value: Weather.Fog } },
  { label: "Météo réelle (lieu de la carte)", request: { setting: EnvironmentSetting.Weather, value: Weather.Real } },
  { label: "Pluie", request: { setting: EnvironmentSetting.Weather, value: Weather.Rain } },
  { label: "Neige", request: { setting: EnvironmentSetting.Weather, value: Weather.Snow } },
  { label: "Orage", request: { setting: EnvironmentSetting.Weather, value: Weather.Storm } },
  { label: "Heure du serveur", request: { setting: EnvironmentSetting.Night, value: Night.Server } },
  { label: "Heure de l’ordinateur", request: { setting: EnvironmentSetting.Night, value: Night.Computer } },
  { label: "Toujours jour", request: { setting: EnvironmentSetting.Night, value: Night.Disabled } },
  { label: "Toujours nuit", request: { setting: EnvironmentSetting.Night, value: Night.Always } },
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

const soundLabels: Record<SoundSetting, string> = {
  [SoundSetting.Footsteps]: "Pas", [SoundSetting.Skateboard]: "Skateboard", [SoundSetting.Weather]: "Météo",
  [SoundSetting.Jungle]: "Animaux de la jungle", [SoundSetting.Doors]: "Portes", [SoundSetting.Nerf]: "Nerf", [SoundSetting.Map]: "Sons de la carte", [SoundSetting.Notifications]: "Notifications",
};

/** A native menu stays above the remote game view; selecting a value applies it immediately. */
export function showEnvironmentMenu(window: BrowserWindow, content: WebContents, setting: EnvironmentSetting, anchor: { x: number; y: number }): void {
  const state = controlsOf(content).environment;
  if (!state || state.busy || setting === EnvironmentSetting.SoundPreview || setting === EnvironmentSetting.Light) return;
  if (state[setting] === undefined) return;
  if (state.seasonal !== undefined && (setting === EnvironmentSetting.Ground || setting === EnvironmentSetting.Christmas)) return;
  if (setting === EnvironmentSetting.Effects) {
    sendCommand(content, { type: "set-environment", request: { setting, value: !state.effects } });
    return;
  }
  if (setting === EnvironmentSetting.Clouds) {
    const items: MenuItemConstructorOptions[] = [{
      label: "Afficher les nuages et leurs ombres", type: "checkbox", checked: state.clouds === true,
      click: (): void => {
        const current = controlsOf(content).environment?.clouds;
        if (current !== undefined) sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.Clouds, value: !current } });
      },
    }];
    const heightItems: MenuItemConstructorOptions[] = state.cloudsHeight === undefined ? [] : [{ label: "Hauteur des nuages", submenu: [0, 0.25, 0.5, 0.75, 1].map((height) => ({
      label: height === 1 ? "Toujours visibles" : `${Math.round(height * 100)} %`, type: "radio" as const, checked: state.cloudsHeight === height,
      click: (): void => sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.CloudsHeight, value: height } }),
    })) }];
    Menu.buildFromTemplate([...items, ...heightItems]).popup({ window, ...anchor });
    return;
  }
  if (setting === EnvironmentSetting.LampEffects) {
    const items: MenuItemConstructorOptions[] = ([EnvironmentSetting.LampEffects, EnvironmentSetting.LampDemo] as const)
      .filter((key) => state[key] !== undefined)
      .map((key) => ({
        label: key === EnvironmentSetting.LampEffects ? "Suivre la musique" : "Lampes de démonstration près de mon avatar",
        type: "checkbox", checked: state[key] === true,
        click: (): void => {
          const current = controlsOf(content).environment?.[key];
          if (typeof current === "boolean") sendCommand(content, { type: "set-environment", request: { setting: key, value: !current } });
        },
      }));
    const sources: MenuItemConstructorOptions[] = state.lampMusicSource === undefined ? [] : [
      { type: "separator" },
      ...Object.values(LampMusicSource).map((source) => ({
        label: source === LampMusicSource.Personal ? "Ma musique (Spotify sur cet ordinateur)" : "Musique des salons (selon la zone de chaque lampe)",
        type: "radio" as const, checked: state.lampMusicSource === source,
        click: (): void => sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.LampMusicSource, value: source } }),
      })),
    ];
    Menu.buildFromTemplate([...items, ...sources]).popup({ window, ...anchor });
    return;
  }
  if (setting === EnvironmentSetting.Sounds) {
    const items: MenuItemConstructorOptions[] = Object.values(SoundSetting).flatMap((sound) => {
      const volume = state.sounds?.[sound];
      if (volume === undefined) return [];
      // Include the current value so a volume chosen in WA always has a checked item.
      const levels = [...new Set([0, 0.15, 0.25, 0.5, 0.75, 1, volume])];
      return [{ label: `${soundLabels[sound]} : ${Math.round(volume * 100)} %`, submenu: levels.map((level) => ({
        label: level === 0 ? "Muet" : `${Math.round(level * 100)} %`, type: "radio" as const, checked: level === volume,
        click: (): void => sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.Sounds, value: { sound, volume: level } } }),
      })) }];
    });
    Menu.buildFromTemplate(items).popup({ window, ...anchor });
    return;
  }
  let items: MenuItemConstructorOptions[] = choices.filter(({ request }) => request.setting === setting &&
    (request.setting !== EnvironmentSetting.Weather || state.mapWeather !== undefined || ![Weather.Real, Weather.Cloudy, Weather.Fog].includes(request.value))).map(({ label, request }) => ({
    label,
    type: "radio" as const,
    checked: (request.setting === EnvironmentSetting.Weather ? state.mapWeather ?? state.weather : state[request.setting]) === request.value,
    enabled: setting !== EnvironmentSetting.Weather || state.canEditWeather,
    click: (): void => sendCommand(content, { type: "set-environment", request }),
  }));
  if (setting === EnvironmentSetting.Weather && state.weatherAuto) {
    const auto = state.weatherAuto;
    const changeAuto = (value: typeof auto): void => sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.WeatherAuto, value } });
    items = [...items, { type: "separator" }, { label: "Fréquence du mode automatique", enabled: state.canEditWeather, submenu: Object.values(WeatherFrequency).map((frequency) => ({
      label: frequency === WeatherFrequency.Calm ? "Calme" : frequency === WeatherFrequency.Stormy ? "Agitée" : "Normale", type: "radio" as const, checked: auto.frequency === frequency,
      click: (): void => { const current = controlsOf(content).environment?.weatherAuto; if (current) changeAuto({ ...current, frequency }); },
    })) }, { label: "Temps possibles en automatique", enabled: state.canEditWeather, submenu: [Weather.Rain, Weather.Snow, Weather.Storm, Weather.Fog].map((weather) => ({
      label: choices.find((choice) => choice.request.value === weather)?.label ?? weather, type: "checkbox" as const, checked: auto.include.includes(weather),
      click: (): void => { const current = controlsOf(content).environment?.weatherAuto; if (current) changeAuto({ ...current, include: current.include.includes(weather) ? current.include.filter((value) => value !== weather) : [...current.include, weather] }); },
    })) }, { label: "Nuages en automatique", type: "checkbox", checked: auto.clouds !== false, enabled: state.canEditWeather,
      click: (): void => { const current = controlsOf(content).environment?.weatherAuto; if (current) changeAuto({ ...current, clouds: current.clouds === false }); },
    }];
  }
  Menu.buildFromTemplate(items).popup({ window, ...anchor });
}
