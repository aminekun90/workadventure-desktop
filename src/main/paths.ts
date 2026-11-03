import { app } from "electron";
import { join } from "node:path";

/** ~/Library/Logs/WorkAdventure/main.log on macOS, the platform logs folder elsewhere. */
export function logFilePath(): string {
  return join(app.getPath("logs"), "main.log");
}
