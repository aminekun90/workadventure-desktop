/** Wire values match the existing WorkAdventure settings. */
export enum EnvironmentSetting { Weather = "weather", Night = "night", Seasonal = "seasonal", Ground = "ground", Christmas = "christmas", Effects = "effects" }
export enum Weather { Automatic = "automatic", Clear = "clear", Rain = "rain", Snow = "snow", Storm = "storm" }
export enum Night { Server = "server", Computer = "computer", Disabled = "disabled" }
export enum Ground { Seasonal = "seasonal", Green = "green" }
export enum Christmas { Auto = "auto", Always = "always", Never = "never" }
export enum Seasonal { Auto = "auto", Autumn = "autumn", Christmas = "christmas", None = "none" }

export type EnvironmentRequest =
  | { setting: EnvironmentSetting.Weather; value: Weather }
  | { setting: EnvironmentSetting.Night; value: Night }
  | { setting: EnvironmentSetting.Seasonal; value: Seasonal }
  | { setting: EnvironmentSetting.Ground; value: Ground }
  | { setting: EnvironmentSetting.Christmas; value: Christmas }
  | { setting: EnvironmentSetting.Effects; value: boolean };

export interface EnvironmentState {
  weather: Weather;
  displayWeather: Weather;
  night: Night;
  isNight: boolean;
  seasonal?: Seasonal | undefined;
  /** Older WA fronts expose separate ground and Christmas controls. */
  ground?: Ground | undefined;
  christmas?: Christmas | undefined;
  effects: boolean;
  canEditWeather: boolean;
  busy: boolean;
  error: string;
}
