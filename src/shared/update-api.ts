export const UPDATE_CHANNELS = {
  get: "update:get",
  apply: "update:apply",
  changed: "update:changed",
} as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[keyof typeof UPDATE_CHANNELS];

/** "restart" installs an update already downloaded; "download" opens the release page (macOS without Developer ID). */
export type UpdateAction = "restart" | "download";

export type UpdateStatus =
  /** Running from sources: updates come from git. */
  | { state: "disabled" }
  | { state: "checking" }
  | { state: "up-to-date" }
  /** Offline, proxy, GitHub down…: `reason` is shown to the user; retried after `retryInMinutes`. */
  | { state: "failed"; reason: string; retryInMinutes: number }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string; action: UpdateAction };

/** Shared by the launcher and the toolbar bridges. */
export interface UpdateApi {
  get(): Promise<UpdateStatus>;
  apply(): Promise<void>;
  onChange(listener: (status: UpdateStatus) => void): void;
}
