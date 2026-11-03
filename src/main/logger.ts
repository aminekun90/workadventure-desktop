import { existsSync, renameSync, statSync } from "node:fs";
import { pino } from "pino";

/** Past this size the log file is renamed `.old.log` at the next launch, so at most two files are kept. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

const streams = pino.multistream([{ stream: process.stdout }]);

export const logger = pino({ name: "workadventure-desktop", level: process.env["LOG_LEVEL"] ?? "info" }, streams);

/** The installed app has no terminal: its logs also go to a file the About window can open. */
export function logToFile(filePath: string): void {
  if (existsSync(filePath) && statSync(filePath).size > MAX_LOG_BYTES) renameSync(filePath, filePath.replace(/\.log$/, ".old.log"));
  streams.add({ stream: pino.destination({ dest: filePath, mkdir: true, sync: false }) });
}
