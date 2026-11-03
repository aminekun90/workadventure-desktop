import { app, net, shell } from "electron";
import updaterPackage, { type UpdateInfo } from "electron-updater";
import type { UpdateStatus } from "../shared/update-api.js";
import { logger } from "./logger.js";
import { describeUpdateError } from "./update-errors.js";
import { installOnQuit, pickZip, prepareUpdate, replaceableBundle, type PreparedUpdate } from "./mac-update.js";

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

let macUpdate: { version: string; status: UpdateStatus; prepared?: PreparedUpdate } | undefined;

/** Checks GitHub releases at launch, then every few hours; reports each step to `onChange`. */
export function startUpdater(onChange: (status: UpdateStatus) => void): void {
  if (!app.isPackaged) {
    onChange({ state: "disabled" });
    return;
  }

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
    await shell.openExternal(`${RELEASES_URL}/v${status.version}`);
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

/** Falls back to the download page when the app cannot replace itself (run from the DMG, no write access). */
async function prepareMacUpdate({ version, files }: UpdateInfo, onChange: (status: UpdateStatus) => void): Promise<void> {
  const report = (status: UpdateStatus, prepared?: PreparedUpdate): void => {
    macUpdate = { version, status, ...(prepared && { prepared }) };
    onChange(status);
  };
  const bundle = replaceableBundle(app.getPath("exe"));
  const file = pickZip(files, process.arch);
  if (!bundle || !file) {
    logger.info({ version, bundle, arch: process.arch }, "macOS update cannot be installed in place, offering the download");
    report({ state: "ready", version, action: "download" });
    return;
  }
  report({ state: "downloading", version, percent: 0 });
  try {
    const prepared = await prepareUpdate({
      version,
      file,
      bundle,
      fetch: (url) => net.fetch(url),
      onProgress: (percent) => report({ state: "downloading", version, percent }),
    });
    report({ state: "ready", version, action: "restart" }, prepared);
  } catch (error) {
    logger.error({ err: error, version }, "macOS update preparation failed, offering the download");
    report({ state: "ready", version, action: "download" });
  }
}
