import { app, dialog, net, shell } from "electron";
import updaterPackage, { type UpdateInfo } from "electron-updater";
import type { UpdateStatus } from "../shared/update-api.js";
import { logger } from "./logger.js";
import { describeUpdateError, isReleaseInProgress } from "./update-errors.js";
import {
  downloadDiskImage,
  installOnQuit,
  locateBundle,
  pickDmg,
  pickZip,
  prepareUpdate,
  type PreparedUpdate,
  type UpdateFile,
} from "./mac-update.js";

const { autoUpdater } = updaterPackage;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** A failed check (network blip, proxy) is retried soon rather than at the next 4-hour check. */
const RETRY_AFTER_FAILURE_MINUTES = 5;
const RELEASES_URL = "https://github.com/aminekun90/workadventure-desktop/releases/tag";

/**
 * Windows (NSIS) and Linux (AppImage) use electron-updater end to end. macOS only uses it to find the
 * release: Squirrel.Mac needs a Developer ID signature, so mac-update.ts downloads and swaps the app.
 */
const IS_MAC = process.platform === "darwin";

/** The macOS update being downloaded or ready: a later check finding the same version reuses it. */
let retryTimer: ReturnType<typeof setTimeout> | undefined;

let macUpdate:
  | { version: string; status: UpdateStatus; files: readonly UpdateFile[]; prepared?: PreparedUpdate }
  | undefined;
/** Where update statuses go, for the disk image downloaded on click. */
let notify: (status: UpdateStatus) => void = () => undefined;

/** Checks GitHub releases at launch, then every few hours; reports each step to `onChange`. */
export function startUpdater(onChange: (status: UpdateStatus) => void): void {
  if (!app.isPackaged) {
    onChange({ state: "disabled" });
    return;
  }
  notify = onChange;

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = !IS_MAC;
  // A beta build follows beta releases; a stable build only stable ones.
  autoUpdater.allowPrerelease = app.getVersion().includes("-");

  // `download-progress` does not carry the version: remember the one announced by `update-available`.
  let incomingVersion = "";
  autoUpdater.on("checking-for-update", () => onChange({ state: "checking" }));
  autoUpdater.on("update-not-available", () => onChange({ state: "up-to-date" }));
  autoUpdater.on("error", (error) => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(checkForUpdates, RETRY_AFTER_FAILURE_MINUTES * 60 * 1000);
    // The new tag is visible while CI still builds its installers: nothing to install yet, not a failure.
    if (isReleaseInProgress(error)) {
      logger.info("A release is being published, checking again shortly");
      onChange({ state: "up-to-date" });
      return;
    }
    onChange({ state: "failed", reason: describeUpdateError(error), retryInMinutes: RETRY_AFTER_FAILURE_MINUTES });
  });
  autoUpdater.on("update-available", (info) => {
    incomingVersion = info.version;
    if (!IS_MAC) {
      onChange({ state: "downloading", version: info.version, percent: 0 });
      return;
    }
    if (macUpdate?.version === info.version) {
      onChange(macUpdate.status);
      return;
    }
    void prepareMacUpdate(info, onChange);
  });
  autoUpdater.on("download-progress", ({ percent }) => {
    onChange({ state: "downloading", version: incomingVersion, percent: Math.round(percent) });
  });
  autoUpdater.on("update-downloaded", ({ version }) => onChange({ state: "ready", version, action: "restart" }));

  checkForUpdates();
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

/** Also wired to the "Rechercher les mises à jour…" menu item. */
export function checkForUpdates(): void {
  if (!app.isPackaged) return;
  clearTimeout(retryTimer);
  // Failures are reported through the "error" event (and logged by electron-updater): nothing to add here.
  autoUpdater.checkForUpdates().catch(() => undefined);
}

export async function applyUpdate(status: UpdateStatus): Promise<void> {
  if (status.state !== "ready") return;
  if (status.action === "download") {
    await downloadAndOpenDiskImage(status.version);
    return;
  }
  if (!IS_MAC) {
    autoUpdater.quitAndInstall();
    return;
  }
  if (!macUpdate?.prepared) throw new Error("No prepared macOS update to install");
  installOnQuit(macUpdate.prepared);
  app.quit();
}

/**
 * Prepares the update in the background. An app run from its disk image (or translocated) cannot be replaced: the new
 * disk image is offered instead. A failed download is reported and retried, never sent to the browser.
 */
async function prepareMacUpdate({ version, files }: UpdateInfo, onChange: (status: UpdateStatus) => void): Promise<void> {
  const report = (status: UpdateStatus, prepared?: PreparedUpdate): void => {
    macUpdate = { version, status, files, ...(prepared && { prepared }) };
    onChange(status);
  };
  const location = locateBundle(app.getPath("exe"));
  const file = pickZip(files, process.arch);
  if (!location || location.kind === "read-only" || !file) {
    logger.info({ version, location, arch: process.arch }, "macOS update cannot be installed in place, offering the disk image");
    report({ state: "ready", version, action: "download" });
    return;
  }
  report({ state: "downloading", version, percent: 0 });
  try {
    const prepared = await prepareUpdate({
      version,
      file,
      bundle: location.bundle,
      asAdministrator: location.kind === "admin",
      fetch: (url) => net.fetch(url),
      onProgress: (percent) => report({ state: "downloading", version, percent }),
    });
    report({ state: "ready", version, action: "restart" }, prepared);
  } catch (error) {
    logger.error({ err: error, version }, "macOS update preparation failed");
    reportFailure(error);
  }
}

/** Downloads the disk image into Downloads and opens it: the user drags the app to Applications. */
async function downloadAndOpenDiskImage(version: string): Promise<void> {
  if (!macUpdate || macUpdate.version !== version || macUpdate.status.state === "downloading") return;
  const { files } = macUpdate;
  const file = pickDmg(files, process.arch);
  if (!file) {
    // No disk image for this CPU in the release: its page is the only way left.
    await shell.openExternal(`${RELEASES_URL}/v${version}`);
    return;
  }
  const ready: UpdateStatus = { state: "ready", version, action: "download" };
  const report = (status: UpdateStatus): void => {
    macUpdate = { version, status, files };
    notify(status);
  };
  report({ state: "downloading", version, percent: 0 });
  try {
    const path = await downloadDiskImage({
      version,
      file,
      directory: app.getPath("downloads"),
      fetch: (url) => net.fetch(url),
      onProgress: (percent) => report({ state: "downloading", version, percent }),
    });
    report(ready);
    const openError = await shell.openPath(path);
    if (openError) logger.warn({ path, openError }, "Could not open the update disk image");
    await dialog.showMessageBox({
      type: "info",
      message: `La version ${version} est téléchargée`,
      detail:
        "Glisse WorkAdventure dans Applications (en remplaçant l'ancienne), puis ouvre-le depuis Applications : " +
        `les prochaines mises à jour s'installeront alors toutes seules.\n\nFichier : ${path}`,
    });
  } catch (error) {
    logger.error({ err: error, version }, "Update disk image download failed");
    reportFailure(error);
  }
}

/** Shown to the user and retried shortly, like a failed check; the next check prepares the update again. */
function reportFailure(error: unknown): void {
  macUpdate = undefined;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(checkForUpdates, RETRY_AFTER_FAILURE_MINUTES * 60 * 1000);
  notify({ state: "failed", reason: describeUpdateError(error), retryInMinutes: RETRY_AFTER_FAILURE_MINUTES });
}
