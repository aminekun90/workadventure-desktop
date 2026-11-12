import { z } from "zod";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";

const RELEASES_API = "https://api.github.com/repos/aminekun90/workadventure-desktop/releases/tags";
const releaseSchema = z.object({ body: z.string().max(50_000).nullable() });
const seenSchema = z.object({ lastSeen: z.string().max(50) });

type Fetch = (url: string) => Promise<Response>;

/** The notes written on GitHub for this version, as Markdown; null when there are none or GitHub cannot be reached. */
export async function fetchReleaseNotes(version: string, fetch: Fetch): Promise<string | null> {
  try {
    const response = await fetch(`${RELEASES_API}/v${encodeURIComponent(version)}`);
    if (!response.ok) return null;
    return releaseSchema.parse(await response.json()).body?.trim() || null;
  } catch (error) {
    logger.warn({ err: error, version }, "Could not fetch the release notes");
    return null;
  }
}

/** True once per version: the What's new window opens by itself after an update, then not again. */
export function takeWhatsNew(filePath: string, version: string): boolean {
  const seen = seenSchema.safeParse(readJsonFile(filePath));
  if (seen.success && seen.data.lastSeen === version) return false;
  writeJsonFile(filePath, { lastSeen: version });
  return true;
}
