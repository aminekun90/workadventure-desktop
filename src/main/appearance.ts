import { BrowserWindow } from "electron";
import { APPEARANCE_CHANNELS, DEFAULT_APPEARANCE, appearanceSchema, type Appearance } from "../shared/appearance-api.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";

let filePath: string | undefined;
let current: Appearance = DEFAULT_APPEARANCE;

/** Reads the appearance remembered from the last WorkAdventure session: the launcher shows it before any page. */
export function loadAppearance(path: string): void {
  filePath = path;
  const stored = appearanceSchema.safeParse(readJsonFile(path));
  current = stored.success ? stored.data : DEFAULT_APPEARANCE;
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
