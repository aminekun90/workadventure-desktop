import type { Choice, InstanceId, Settings } from "./config.js";
import type { UpdateApi } from "./update-api.js";

export const LAUNCHER_CHANNELS = {
  getState: "launcher:get-state",
  probe: "launcher:probe",
  launch: "launcher:launch",
  installListenAlong: "launcher:install-listen-along",
  dismissListenAlong: "launcher:dismiss-listen-along",
} as const;
export type LauncherChannel = (typeof LAUNCHER_CHANNELS)[keyof typeof LAUNCHER_CHANNELS];

export interface LauncherInstance {
  id: InstanceId;
  label: string;
  url: string;
  host: string;
}

export interface LauncherState {
  instances: LauncherInstance[];
  settings: Settings;
  version: string;
  notice?: string;
  /** The user's woka: sprite sheets as data URLs, bottom layer first. */
  avatar?: string[];
  /** Offer, once, to install Spicetify and the WorkAdventure extension (Spotify found on this computer). */
  offerListenAlong: boolean;
}

export interface ProbeResult {
  online: boolean;
  latencyMs?: number;
}

export type LaunchResult = { ok: true } | { ok: false; message: string };

export interface LauncherApi {
  platform: string;
  getState(): Promise<LauncherState>;
  probe(choice: Choice): Promise<ProbeResult>;
  launch(request: Settings): Promise<LaunchResult>;
  /** Installs Spicetify and the extension, then patches Spotify; the offer is not shown again once it worked. */
  installListenAlong(): Promise<LaunchResult>;
  /** "Non merci": the offer is not shown again. */
  dismissListenAlong(): Promise<void>;
  update: UpdateApi;
}
