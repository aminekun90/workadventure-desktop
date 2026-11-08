import type { AppearanceApi } from "./appearance-api.js";
import type { EnvironmentSetting, EnvironmentState } from "./environment-api.js";
import type { UpdateApi } from "./update-api.js";

export const TOOLBAR_CHANNELS = {
  openLauncher: "toolbar:open-launcher",
  reload: "toolbar:reload",
  showMaps: "toolbar:show-maps",
  state: "toolbar:state",
  showEnvironment: "toolbar:show-environment",
  environment: "toolbar:environment",
} as const;
export type ToolbarChannel = (typeof TOOLBAR_CHANNELS)[keyof typeof TOOLBAR_CHANNELS];

export interface ToolbarState {
  /** Name of the space, e.g. "Beta". */
  label: string;
  /** Host currently displayed, e.g. "auth.goyan.fr" during login. */
  host: string;
  loading: boolean;
}

export interface ToolbarApi {
  platform: string;
  openLauncher(): Promise<void>;
  reload(): Promise<void>;
  /** Opens the map menu at the given point of the window (CSS pixels). */
  showMaps(anchor: { x: number; y: number }): Promise<void>;
  onState(listener: (state: ToolbarState) => void): void;
  showEnvironment(setting: EnvironmentSetting, anchor: { x: number; y: number }): Promise<void>;
  onEnvironment(listener: (state: EnvironmentState | null) => void): void;
  update: UpdateApi;
  appearance: AppearanceApi;
}
