import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { accessSync, constants, createWriteStream, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { finished } from "node:stream/promises";
import { promisify } from "node:util";

/**
 * In-place updates for macOS without an Apple Developer ID (which Squirrel.Mac requires): the release
 * zip is downloaded, checked against the SHA-512 of the update manifest, unpacked next to the running
 * bundle, and swapped in by a small script once the app has quit.
 */

const RELEASE_DOWNLOAD_URL = "https://github.com/aminekun90/workadventure-desktop/releases/download";
const STAGING_DIR_NAME = ".WorkAdventure-update";

/** Runs detached after the app quits: $1 pid to wait for, $2 new bundle, $3 bundle to replace, $4 staging dir. */
const SWAP_SCRIPT = `
while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
backup="$3.previous"
rm -rf "$backup"
if mv "$3" "$backup" && mv "$2" "$3"; then rm -rf "$backup"; else [ -e "$3" ] || mv "$backup" "$3"; fi
rm -rf "$4"
open "$3"
`;

export interface UpdateFile {
  url: string;
  sha512: string;
  size?: number;
}

export interface PreparedUpdate {
  /** The new .app, unpacked next to the current one. */
  newBundle: string;
  /** The running .app, replaced on restart. */
  bundle: string;
}

type Fetch = (url: string) => Promise<Response>;

/** The running .app if it can be replaced: not when launched from the DMG or translocated by Gatekeeper. */
export function replaceableBundle(executablePath: string): string | undefined {
  const [bundle] = executablePath.split("/Contents/MacOS/");
  if (!bundle?.endsWith(".app")) return undefined;
  try {
    accessSync(bundle, constants.W_OK);
    accessSync(dirname(bundle), constants.W_OK);
    return bundle;
  } catch {
    return undefined;
  }
}

/** The release zip built for this CPU (artifact names end with `-<arch>.zip`, see electron-builder.yml). */
export function pickZip(files: readonly UpdateFile[], arch: string): UpdateFile | undefined {
  return files.find(({ url }) => url.endsWith(`-${arch}.zip`));
}

export async function prepareUpdate({
  version,
  file,
  bundle,
  fetch,
  onProgress,
}: {
  version: string;
  file: UpdateFile;
  bundle: string;
  fetch: Fetch;
  onProgress: (percent: number) => void;
}): Promise<PreparedUpdate> {
  const downloadDir = mkdtempSync(join(tmpdir(), "workadventure-update-"));
  try {
    const zipPath = join(downloadDir, basename(file.url));
    await downloadVerified({ url: `${RELEASE_DOWNLOAD_URL}/v${version}/${file.url}`, file, zipPath, fetch, onProgress });
    // Same volume as the bundle, so the swap is a rename rather than a copy.
    const stagingDir = join(dirname(bundle), STAGING_DIR_NAME);
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir);
    // ditto keeps symlinks, permissions and the code signature intact.
    await promisify(execFile)("/usr/bin/ditto", ["-x", "-k", zipPath, stagingDir]);
    const app = readdirSync(stagingDir).find((name) => name.endsWith(".app"));
    if (!app) throw new Error(`No .app in ${file.url}`);
    return { newBundle: join(stagingDir, app), bundle };
  } finally {
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

/** Starts the swap script; the caller must quit the app right after. */
export function installOnQuit({ newBundle, bundle }: PreparedUpdate): void {
  spawn("/bin/sh", ["-c", SWAP_SCRIPT, "swap", String(process.pid), newBundle, bundle, dirname(newBundle)], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

async function downloadVerified({
  url,
  file,
  zipPath,
  fetch,
  onProgress,
}: {
  url: string;
  file: UpdateFile;
  zipPath: string;
  fetch: Fetch;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Update download failed with HTTP ${response.status}: ${url}`);
  const total = file.size ?? Number(response.headers.get("content-length"));
  const hash = createHash("sha512");
  const output = createWriteStream(zipPath);
  let received = 0;
  let reported = -1;

  for await (const chunk of response.body) {
    hash.update(chunk);
    received += chunk.byteLength;
    const percent = total > 0 ? Math.floor((received / total) * 100) : 0;
    if (percent !== reported) onProgress((reported = percent));
    if (!output.write(chunk)) await once(output, "drain");
  }
  output.end();
  await finished(output);

  const digest = hash.digest("base64");
  if (digest !== file.sha512) throw new Error(`Update checksum mismatch for ${file.url}`);
}
