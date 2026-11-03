import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Contents of a JSON file, or undefined when it is missing or corrupt: callers fall back to defaults. */
export function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
