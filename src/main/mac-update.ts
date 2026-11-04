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
 * bundle, and swapped in by a small script once the app has quit. When the app's folder is not writable
 * (standard account, managed Mac), the swap asks macOS for an administrator password. An app run from
 * its disk image cannot be replaced: the new disk image is downloaded and opened instead.
 */

const RELEASE_DOWNLOAD_URL = "https://github.com/aminekun90/workadventure-desktop/releases/download";
const STAGING_DIR_NAME = ".WorkAdventure-update";

/** Waits for the app to quit, then swaps: $1 pid to wait for, $2 new bundle, $3 bundle to replace, $4 staging dir. */
const SWAP_SCRIPT = `
while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
backup="$3.previous"
rm -rf "$backup"
if mv "$3" "$backup" && mv "$2" "$3"; then rm -rf "$backup"; else [ -e "$3" ] || mv "$backup" "$3"; fi
rm -rf "$4"
`;

/**
 * The swap with an administrator password, asked by macOS itself. The app is reopened afterwards as the user,
 * never as root, and also when the password is refused (the previous version then stays).
 */
const ADMIN_SWAP_SCRIPT = `
on run argv
  set swap to "/bin/sh -c " & quoted form of (item 1 of argv) & " swap"
  repeat with argument in items 2 thru 5 of argv
    set swap to swap & " " & quoted form of (contents of argument)
  end repeat
  try
    do shell script swap with prompt "WorkAdventure a besoin d'un mot de passe administrateur pour installer sa mise à jour." with administrator privileges
  end try
  do shell script "/usr/bin/open " & quoted form of (item 4 of argv)
end run
`;

export interface UpdateFile {
  url: string;
  sha512: string;
  size?: number;
}

export interface PreparedUpdate {
  /** The new .app, unpacked next to the current one (in a temporary folder when that one is not writable). */
  newBundle: string;
  /** The running .app, replaced on restart. */
  bundle: string;
  /** The swap needs an administrator password: the app's folder is not writable by this account. */
  asAdministrator: boolean;
}

/**
 * Where the running app is: replaceable as is, replaceable with an administrator password, or read-only (run from its
 * disk image, or translocated by Gatekeeper because it was opened before being moved to Applications).
 */
export type BundleLocation =
  | { kind: "writable"; bundle: string }
  | { kind: "admin"; bundle: string }
  | { kind: "read-only"; bundle: string };

type Fetch = (url: string) => Promise<Response>;

/** The running .app and whether it can be replaced; undefined outside an .app bundle (run from sources). */
export function locateBundle(executablePath: string): BundleLocation | undefined {
  const [bundle] = executablePath.split("/Contents/MacOS/");
  if (!bundle?.endsWith(".app")) return undefined;
  if (bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) return { kind: "read-only", bundle };
  try {
    accessSync(bundle, constants.W_OK);
    accessSync(dirname(bundle), constants.W_OK);
    return { kind: "writable", bundle };
  } catch {
    return { kind: "admin", bundle };
  }
}

/** The release zip built for this CPU (artifact names end with `-<arch>.zip`, see electron-builder.yml). */
export function pickZip(files: readonly UpdateFile[], arch: string): UpdateFile | undefined {
  return files.find(({ url }) => url.endsWith(`-${arch}.zip`));
}

/** The release disk image built for this CPU, for an app that cannot replace itself. */
export function pickDmg(files: readonly UpdateFile[], arch: string): UpdateFile | undefined {
  return files.find(({ url }) => url.endsWith(`-${arch}.dmg`));
}

export async function prepareUpdate({
  version,
  file,
  bundle,
  asAdministrator = false,
  fetch,
  onProgress,
}: {
  version: string;
  file: UpdateFile;
  bundle: string;
  asAdministrator?: boolean;
  fetch: Fetch;
  onProgress: (percent: number) => void;
}): Promise<PreparedUpdate> {
  const downloadDir = mkdtempSync(join(tmpdir(), "workadventure-update-"));
  try {
    const zipPath = join(downloadDir, basename(file.url));
    await downloadVerified({ url: `${RELEASE_DOWNLOAD_URL}/v${version}/${file.url}`, file, path: zipPath, fetch, onProgress });
    // Next to the bundle, the swap is a rename rather than a copy; this account cannot write there without a password.
    const stagingDir = asAdministrator
      ? mkdtempSync(join(tmpdir(), STAGING_DIR_NAME))
      : join(dirname(bundle), STAGING_DIR_NAME);
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir);
    // ditto keeps symlinks, permissions and the code signature intact.
    await promisify(execFile)("/usr/bin/ditto", ["-x", "-k", zipPath, stagingDir]);
    const app = readdirSync(stagingDir).find((name) => name.endsWith(".app"));
    if (!app) throw new Error(`No .app in ${file.url}`);
    return { newBundle: join(stagingDir, app), bundle, asAdministrator };
  } finally {
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

/** Starts the swap script; the caller must quit the app right after. */
export function installOnQuit({ newBundle, bundle, asAdministrator }: PreparedUpdate): void {
  const swapArguments = [String(process.pid), newBundle, bundle, dirname(newBundle)];
  const [command, args] = asAdministrator
    ? ["/usr/bin/osascript", ["-e", ADMIN_SWAP_SCRIPT, SWAP_SCRIPT, ...swapArguments]]
    : ["/bin/sh", ["-c", `${SWAP_SCRIPT}\nopen "$3"`, "swap", ...swapArguments]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

/** Downloads and checks the release disk image into `directory`, for an app that cannot replace itself. */
export async function downloadDiskImage({
  version,
  file,
  directory,
  fetch,
  onProgress,
}: {
  version: string;
  file: UpdateFile;
  directory: string;
  fetch: Fetch;
  onProgress: (percent: number) => void;
}): Promise<string> {
  const path = join(directory, basename(file.url));
  try {
    await downloadVerified({ url: `${RELEASE_DOWNLOAD_URL}/v${version}/${file.url}`, file, path, fetch, onProgress });
  } catch (error) {
    rmSync(path, { force: true });
    throw error;
  }
  return path;
}

async function downloadVerified({
  url,
  file,
  path,
  fetch,
  onProgress,
}: {
  url: string;
  file: UpdateFile;
  path: string;
  fetch: Fetch;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Update download failed with HTTP ${response.status}: ${url}`);
  const total = file.size ?? Number(response.headers.get("content-length"));
  const hash = createHash("sha512");
  const output = createWriteStream(path);
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
