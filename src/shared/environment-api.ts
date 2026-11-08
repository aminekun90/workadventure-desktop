/** Wire values match the existing WorkAdventure settings. */
export enum EnvironmentSetting { Weather = "weather", Night = "night", Ground = "ground", Christmas = "christmas", Effects = "effects" }
export enum Weather { Automatic = "automatic", Clear = "clear", Rain = "rain", Snow = "snow", Storm = "storm" }
export enum Night { Server = "server", Computer = "computer", Disabled = "disabled" }
export enum Ground { Seasonal = "seasonal", Green = "green" }
export enum Christmas { Auto = "auto", Always = "always", Never = "never" }

export type EnvironmentRequest =
  | { setting: EnvironmentSetting.Weather; value: Weather }
  | { setting: EnvironmentSetting.Night; value: Night }
  | { setting: EnvironmentSetting.Ground; value: Ground }
  | { setting: EnvironmentSetting.Christmas; value: Christmas }
  | { setting: EnvironmentSetting.Effects; value: boolean };

export interface EnvironmentState {
  weather: Weather;
  displayWeather: Weather;
  night: Night;
  isNight: boolean;
  ground: Ground;
  christmas: Christmas;
  effects: boolean;
  canEditWeather: boolean;
  busy: boolean;
  error: string;
}
