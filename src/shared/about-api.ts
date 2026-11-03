import type { UpdateApi } from "./update-api.js";

export const ABOUT_CHANNELS = {
  getInfo: "about:get-info",
  open: "about:open",
  checkForUpdates: "about:check-for-updates",
  copyDiagnostics: "about:copy-diagnostics",
} as const;
export type AboutChannel = (typeof ABOUT_CHANNELS)[keyof typeof ABOUT_CHANNELS];

export const ABOUT_LINKS = ["release-notes", "repository", "logs"] as const;
export type AboutLink = (typeof ABOUT_LINKS)[number];

export interface AboutInfo {
  version: string;
  /** "beta" for x.y.z-beta.n versions. */
  channel: "beta" | "stable";
  electron: string;
  chromium: string;
  node: string;
  /** e.g. "macOS 15.4" */
  system: string;
  arch: string;
  copyright: string;
}

export interface AboutApi {
  platform: string;
  getInfo(): Promise<AboutInfo>;
  open(link: AboutLink): Promise<void>;
  checkForUpdates(): Promise<void>;
  /** Copies app, engine and OS versions, ready to paste in a bug report. */
  copyDiagnostics(): Promise<void>;
  update: UpdateApi;
}
