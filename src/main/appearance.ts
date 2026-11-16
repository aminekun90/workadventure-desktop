import { BrowserWindow } from "electron";
import { APPEARANCE_CHANNELS, DEFAULT_APPEARANCE, appearanceSchema, type Appearance } from "../shared/appearance-api.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";

let filePath: string | undefined;
let current: Appearance = DEFAULT_APPEARANCE;
let pending: Appearance | undefined;

/** Reads the appearance remembered from the last WorkAdventure session: the launcher shows it before any page. */
export function loadAppearance(path: string): void {
  filePath = path;
  const stored = appearanceSchema.safeParse(readJsonFile(path));
  current = stored.success ? stored.data : DEFAULT_APPEARANCE;
  pending = stored.success ? stored.data : undefined;
}

export function getAppearance(): Appearance {
  return current;
}

/** WorkAdventure reported its look: remembered, and sent to every local page (never to the remote view). */
export function setAppearance(appearance: Appearance): void {
  if (appearance.palette === current.palette && appearance.font === current.font) return;
  current = appearance;
  if (filePath) writeJsonFile(filePath, appearance);
  logger.info(appearance, "Appearance changed");
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(APPEARANCE_CHANNELS.changed, appearance);
}

/** A desktop choice remains pending while no compatible map is open. */
export function setLocalAppearance(appearance: Appearance): void {
  pending = appearance;
  setAppearance(appearance);
}

export function pendingAppearance(): Appearance | undefined {
  return pending;
}

export function confirmAppearance(appearance: Appearance | undefined): void {
  if (pending && appearance?.palette === pending.palette && appearance.font === pending.font) pending = undefined;
}
