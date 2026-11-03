import { app, BrowserWindow, Menu, net, powerSaveBlocker, session, type WebContents } from "electron";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { choiceLabel, choiceUrl, INSTANCES, instanceIdSchema, resolveStartup, type Choice, type Settings } from "../shared/config.js";
import type { LauncherState } from "../shared/launcher-api.js";
import { UPDATE_CHANNELS, type UpdateStatus } from "../shared/update-api.js";
import { defaultWokaUrl, downloadAvatar, loadAvatar, READ_AVATAR_SCRIPT, saveAvatar, type Avatar } from "./avatar.js";
import { registerIpc } from "./ipc.js";
import { createLauncherWindow, LAUNCHER_URL } from "./launcher-window.js";
import { logger } from "./logger.js";
import { configureAboutPanel } from "./about.js";
import { buildMenu } from "./menu.js";
import { createPolicy, isAllowedUrl } from "./navigation.js";
import { installPermissionHandlers } from "./permissions.js";
import { persistSessionCookies } from "./session-persistence.js";
import { loadSettings, saveSettings } from "./settings.js";
import { applyUpdate, checkForUpdates, startUpdater } from "./updater.js";
import { contentOf, createWorkAdventureWindow } from "./workadventure-window.js";

// Chromium throttles hidden and occluded windows by default; WorkAdventure must stay live.
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.setName("WorkAdventure");
// Running from sources uses its own profile: it never touches, nor locks, the installed app's session.
if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "WorkAdventure-dev"));

const settingsPath = join(app.getPath("userData"), "settings.json");
const avatarPath = join(app.getPath("userData"), "avatar.json");
let policy = createPolicy(INSTANCES.prod.url);
let currentWindow: BrowserWindow | undefined;
let notice: string | undefined;
let updateStatus: UpdateStatus = { state: "disabled" };

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", focusCurrentWindow);
  app.on("window-all-closed", () => app.quit());
  // No top-level await: Electron only emits `ready` once the ESM entry has finished evaluating.
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      logger.fatal({ err: error }, "Startup failed");
      app.exit(1);
    });
} else {
  app.quit();
}

async function start(): Promise<void> {
  powerSaveBlocker.start("prevent-app-suspension");
  configureAboutPanel();
  installPermissionHandlers(session.defaultSession, (url) => url.startsWith(LAUNCHER_URL) || isAllowedUrl(url, policy));
  persistSessionCookies(session.defaultSession, (url) => isAllowedUrl(url, policy));
  registerIpc({
    getLauncherState: launcherState,
    launch,
    openLauncher,
    getUpdateStatus: () => updateStatus,
    applyUpdate: () => applyUpdate(updateStatus),
  });
  startUpdater(announceUpdateStatus);
  Menu.setApplicationMenu(
    buildMenu({ onOpenLauncher: () => void openLauncher(), onSignOut: () => void signOut(), onCheckForUpdates: checkForUpdates }),
  );

  const startup = resolveStartup(
    {
      url: app.commandLine.getSwitchValue("url") || undefined,
      instance: app.commandLine.getSwitchValue("instance") || undefined,
      launcher: app.commandLine.hasSwitch("launcher"),
    },
    loadSettings(settingsPath),
  );
  if (startup.mode === "launcher") {
    await openLauncher();
    return;
  }
  try {
    await enter(startup.choice);
  } catch (error) {
    logger.error({ err: error }, "Direct launch failed, opening launcher");
    notice = `Impossible de joindre ${new URL(choiceUrl(startup.choice)).host}`;
    await openLauncher();
  }
}

async function launch(request: Settings): Promise<void> {
  await enter(request.choice);
  saveSettings(settingsPath, request);
}

async function enter(choice: Choice): Promise<void> {
  const url = choiceUrl(choice);
  policy = createPolicy(url);
  logger.info({ url }, "Entering WorkAdventure");
  replaceCurrentWindow(
    await createWorkAdventureWindow({ url, label: choiceLabel(choice), policy, onRoomLoaded: (content) => void refreshAvatar(content) }),
  );
}

async function openLauncher(): Promise<void> {
  // Leaving a room: catch any woka change made during the session before the page closes.
  const content = currentWindow && contentOf(currentWindow);
  if (content) await refreshAvatar(content);
  replaceCurrentWindow(await createLauncherWindow());
}

/** Purely cosmetic: on failure the launcher keeps the previous avatar. */
async function refreshAvatar(content: WebContents): Promise<void> {
  try {
    const layerUrls: unknown = await content.executeJavaScript(READ_AVATAR_SCRIPT, true);
    const avatar = await downloadAvatar({ layerUrls, isTrusted: (url) => isAllowedUrl(url, policy), fetch: net.fetch });
    if (avatar) saveAvatar(avatarPath, avatar);
  } catch (error) {
    logger.warn({ err: error }, "Could not refresh the avatar");
  }
}

/** Until a room has been visited, the launcher shows WorkAdventure's default woka; cached like a captured one. */
async function fetchDefaultAvatar(instanceUrl: string): Promise<Avatar | undefined> {
  try {
    const instancePolicy = createPolicy(instanceUrl);
    const avatar = await downloadAvatar({
      layerUrls: [defaultWokaUrl(instanceUrl)],
      isTrusted: (url) => isAllowedUrl(url, instancePolicy),
      fetch: net.fetch,
    });
    if (avatar) saveAvatar(avatarPath, avatar);
    return avatar;
  } catch (error) {
    logger.warn({ err: error, instanceUrl }, "Could not fetch the default avatar");
    return undefined;
  }
}

/** Clears cookies and site storage (Authentik session, WorkAdventure token), then back to the launcher. */
async function signOut(): Promise<void> {
  await session.defaultSession.clearStorageData();
  rmSync(avatarPath, { force: true });
  logger.info("Signed out");
  await openLauncher();
}

async function launcherState(): Promise<LauncherState> {
  const settings = loadSettings(settingsPath);
  const avatar = loadAvatar(avatarPath) ?? (await fetchDefaultAvatar(choiceUrl(settings.choice)));
  const state: LauncherState = {
    instances: instanceIdSchema.options.map((id) => ({ id, ...INSTANCES[id], host: new URL(INSTANCES[id].url).host })),
    settings,
    version: app.getVersion(),
    ...(notice && { notice }),
    ...(avatar && { avatar: avatar.layers }),
  };
  notice = undefined;
  return state;
}

/** Local pages only: a window's own page is the launcher or the toolbar, never the remote WorkAdventure view. */
function announceUpdateStatus(status: UpdateStatus): void {
  updateStatus = status;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(UPDATE_CHANNELS.changed, status);
}

/** The new window opens before the old one closes, so `window-all-closed` never fires in between. */
function replaceCurrentWindow(next: BrowserWindow): void {
  const previous = currentWindow;
  currentWindow = next;
  previous?.close();
}

function focusCurrentWindow(): void {
  if (!currentWindow) return;
  if (currentWindow.isMinimized()) currentWindow.restore();
  currentWindow.focus();
}
