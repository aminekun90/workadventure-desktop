import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "../shared/config.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";

/** A missing or invalid settings file falls back to defaults: it only holds UI preferences. */
export function loadSettings(filePath: string): Settings {
  const content = readJsonFile(filePath);
  if (content === undefined) return DEFAULT_SETTINGS;
  const result = settingsSchema.safeParse(content);
  if (result.success) return result.data;
  logger.warn({ filePath, issues: result.error.issues }, "Ignoring invalid settings file");
  return DEFAULT_SETTINGS;
}

export function saveSettings(filePath: string, settings: Settings): void {
  writeJsonFile(filePath, settings);
}
