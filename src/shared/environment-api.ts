import type { Appearance } from "./appearance-api.js";
/** Wire values match the existing WorkAdventure settings. */
export enum EnvironmentSetting { Jungle = "jungle", SoundPreview = "soundPreview", Appearance = "appearance", Weather = "weather", Night = "night", Seasonal = "seasonal", Ground = "ground", Christmas = "christmas", Effects = "effects", LampEffects = "lampEffects", LampDemo = "lampDemo", LampMusicSource = "lampMusicSource", Sounds = "sounds", Clouds = "clouds", CloudsHeight = "cloudsHeight", WeatherAuto = "weatherAuto" }
export enum LampMusicSource { Rooms = "rooms", Personal = "personal" }
export enum SoundSetting { Footsteps = "footstepVolume", Skateboard = "skateboardVolume", Weather = "weatherVolume", Doors = "doorVolume", Nerf = "nerfVolume", Jungle = "jungleVolume", Map = "mapSoundsVolume", Notifications = "notificationSoundVolume" }
export enum Weather { Automatic = "automatic", Clear = "clear", Rain = "rain", Snow = "snow", Storm = "storm", Cloudy = "cloudy", Fog = "fog", Real = "real" }
export enum WeatherFrequency { Calm = "calm", Normal = "normal", Stormy = "stormy" }
export interface AutoWeather { frequency: WeatherFrequency; include: Weather[]; clouds?: boolean | undefined }
export enum Night { Server = "server", Computer = "computer", Disabled = "disabled" }
export enum Ground { Seasonal = "seasonal", Green = "green" }
export enum Christmas { Auto = "auto", Always = "always", Never = "never" }
export enum Seasonal { Auto = "auto", Autumn = "autumn", Christmas = "christmas", None = "none" }

export type EnvironmentRequest =
  | { setting: EnvironmentSetting.SoundPreview; value: SoundSetting }
  | { setting: EnvironmentSetting.Appearance; value: Appearance }
  | { setting: EnvironmentSetting.Weather; value: Weather }
  | { setting: EnvironmentSetting.Night; value: Night }
  | { setting: EnvironmentSetting.Seasonal; value: Seasonal }
  | { setting: EnvironmentSetting.Ground; value: Ground }
  | { setting: EnvironmentSetting.Christmas; value: Christmas }
  | { setting: EnvironmentSetting.Effects | EnvironmentSetting.LampEffects | EnvironmentSetting.LampDemo | EnvironmentSetting.Clouds | EnvironmentSetting.Jungle; value: boolean }
  | { setting: EnvironmentSetting.LampMusicSource; value: LampMusicSource }
  | { setting: EnvironmentSetting.CloudsHeight; value: number }
  | { setting: EnvironmentSetting.WeatherAuto; value: AutoWeather }
  | { setting: EnvironmentSetting.Sounds; value: { sound: SoundSetting; volume: number } };

export interface EnvironmentState {
  appearance?: Appearance | undefined;
  weather: Weather;
  displayWeather: Weather;
  night: Night;
  isNight: boolean;
  seasonal?: Seasonal | undefined;
  /** Older WA fronts expose separate ground and Christmas controls. */
  ground?: Ground | undefined;
  christmas?: Christmas | undefined;
  effects: boolean;
  mapWeather?: Weather | undefined;
  mapDisplayWeather?: Weather | undefined;
  weatherAuto?: AutoWeather | undefined;
  clouds?: boolean | undefined;
  cloudsHeight?: number | undefined;
  lampEffects?: boolean | undefined;
  lampDemo?: boolean | undefined;
  lampMusicSource?: LampMusicSource | undefined;
  jungle?: boolean | undefined;
  sounds?: Partial<Record<SoundSetting, number>> | undefined;
  canEditWeather: boolean;
  busy: boolean;
  error: string;
}
