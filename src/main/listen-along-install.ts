import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";

/**
 * "Écouter en même temps" without Premium needs Spicetify and the WorkAdventure extension in the Spotify app. The
 * launcher offers to install them once, when Spotify is on this computer: the user says yes or no, and is not
 * asked again. Spotify Premium is not detectable locally, so the offer says who it is for.
 */
export type ListenAlongAnswer = "installed" | "dismissed";
type Fetch = (url: string) => Promise<Response>;

/** The extension at a fixed version, so that it always speaks the protocol of this desktop app. */
const EXTENSION_URL = "https://raw.githubusercontent.com/aminekun90/workadventure-spicetify/v1.0.0/workadventure.js";
const EXTENSION_FILE = "workadventure.js";
const SPICETIFY_LATEST_URL = "https://api.github.com/repos/spicetify/cli/releases/latest";
const COMMAND_TIMEOUT_MS = 120_000;

const answerSchema = z.object({ answer: z.enum(["installed", "dismissed"]) });

export interface ListenAlongEnvironment {
  platform: NodeJS.Platform;
  arch: string;
  home: string;
  /** %APPDATA% and %LOCALAPPDATA% on Windows. */
  appData: string | undefined;
  localAppData: string | undefined;
}

export function currentEnvironment(): ListenAlongEnvironment {
  return {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    appData: process.env["APPDATA"],
    localAppData: process.env["LOCALAPPDATA"],
  };
}

export function readListenAlongAnswer(filePath: string): ListenAlongAnswer | undefined {
  return answerSchema.safeParse(readJsonFile(filePath)).data?.answer;
}

export function saveListenAlongAnswer(filePath: string, answer: ListenAlongAnswer): void {
  writeJsonFile(filePath, { answer });
}

/** Offered once, to a computer with a Spotify app Spicetify can patch, and a Spicetify build for it. */
export function shouldOfferListenAlong(env: ListenAlongEnvironment, answer: ListenAlongAnswer | undefined): boolean {
  return answer === undefined && spotifyInstalled(env) && spicetifyTarget(env) !== undefined;
}

export function spotifyInstalled(env: ListenAlongEnvironment): boolean {
  return spotifyLocations(env).some((path) => existsSync(path));
}

/** Where Spotify installs itself; the Microsoft Store and Flatpak builds are left out: Spicetify cannot patch them as is. */
export function spotifyLocations(env: ListenAlongEnvironment): string[] {
  if (env.platform === "darwin") return ["/Applications/Spotify.app", join(env.home, "Applications/Spotify.app")];
  if (env.platform === "win32") return env.appData ? [join(env.appData, "Spotify", "Spotify.exe")] : [];
  if (env.platform === "linux") return ["/opt/spotify", "/usr/share/spotify", "/usr/share/spotify-client"];
  return [];
}

/** The Spicetify release asset suffix for this computer, undefined when Spicetify publishes none. */
export function spicetifyTarget({ platform, arch }: Pick<ListenAlongEnvironment, "platform" | "arch">): string | undefined {
  if (platform === "darwin") return arch === "arm64" ? "darwin-arm64.tar.gz" : "darwin-amd64.tar.gz";
  if (platform === "linux") return arch === "x64" ? "linux-amd64.tar.gz" : undefined;
  if (platform === "win32") return { x64: "windows-x64.zip", arm64: "windows-arm64.zip", ia32: "windows-x32.zip" }[arch];
  return undefined;
}

/** Where the official installers put Spicetify, then the usual package manager locations. */
export function spicetifyCandidates(env: ListenAlongEnvironment): string[] {
  if (env.platform === "win32") return env.localAppData ? [join(env.localAppData, "spicetify", "spicetify.exe")] : [];
  return [join(env.home, ".spicetify", "spicetify"), "/opt/homebrew/bin/spicetify", "/usr/local/bin/spicetify"];
}

/**
 * Downloads Spicetify when absent, adds the WorkAdventure extension and patches Spotify (which restarts it).
 * Throws with a message for the launcher when a step fails.
 */
export async function installListenAlong(env: ListenAlongEnvironment, fetchFn: Fetch): Promise<void> {
  const existing = spicetifyCandidates(env).find((path) => existsSync(path));
  const spicetify = existing ?? (await downloadSpicetify(env, fetchFn));
  const userData = (await run(spicetify, ["path", "userdata"])).trim();
  const extensionsDir = join(userData, "Extensions");
  await mkdir(extensionsDir, { recursive: true });
  await writeFile(join(extensionsDir, EXTENSION_FILE), await download(fetchFn, EXTENSION_URL));
  await run(spicetify, ["config", "extensions", EXTENSION_FILE]);
  // A fresh Spicetify first backs up the untouched Spotify; an existing one already has its backup.
  await run(spicetify, existing ? ["apply"] : ["backup", "apply"]);
  logger.info({ spicetify }, "Listen along installed");
}

async function downloadSpicetify(env: ListenAlongEnvironment, fetchFn: Fetch): Promise<string> {
  const target = spicetifyTarget(env);
  const [destination] = spicetifyCandidates(env);
  if (!target || !destination) throw new Error("Spicetify n'existe pas pour cet ordinateur.");
  const release = z
    .object({ assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url() })) })
    .parse(JSON.parse((await download(fetchFn, SPICETIFY_LATEST_URL)).toString("utf8")));
  const asset = release.assets.find(({ name }) => name.endsWith(`-${target}`));
  if (!asset) throw new Error("Spicetify n'existe pas pour cet ordinateur.");
  const installDir = join(destination, "..");
  const staging = await mkdtemp(join(tmpdir(), "spicetify-"));
  try {
    const archive = join(staging, asset.name);
    await writeFile(archive, await download(fetchFn, asset.browser_download_url));
    await mkdir(installDir, { recursive: true });
    // tar reads .tar.gz everywhere and .zip on Windows 10 and later (bsdtar).
    await run("tar", ["-xf", archive, "-C", installDir]);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  if (!existsSync(destination)) throw new Error("L'installation de Spicetify a échoué.");
  return destination;
}

async function download(fetchFn: Fetch, url: string): Promise<Buffer> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${new URL(url).host}`);
  return Buffer.from(await response.arrayBuffer());
}

/** No terminal: a step that asks a question (Spotify updated since the backup) fails instead of guessing. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        logger.warn({ command, args, stderr: stderr.slice(-2000) }, "Listen along step failed");
        reject(new Error(`Échec de « ${[command.split(/[\\/]/).pop(), ...args].join(" ")} »`));
        return;
      }
      resolve(stdout);
    });
    child.stdin?.end();
  });
}
