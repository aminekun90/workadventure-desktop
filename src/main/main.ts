import { app, BrowserWindow, Menu, net, session, type WebContents } from "electron";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { choiceLabel, choiceUrl, INSTANCES, instanceIdSchema, resolveStartup, type Choice, type Settings } from "../shared/config.js";
import type { LauncherState } from "../shared/launcher-api.js";
import { UPDATE_CHANNELS, type UpdateStatus } from "../shared/update-api.js";
import { defaultWokaUrl, downloadAvatar, loadAvatar, READ_AVATAR_SCRIPT, saveAvatar, type Avatar } from "./avatar.js";
import { DEEP_LINK_PROTOCOL, deepLinkTarget } from "./deep-links.js";
import { startDesktopIntegration, type DesktopIntegration } from "./desktop-integration.js";
import { registerIpc } from "./ipc.js";
import {
  currentEnvironment,
  installListenAlong,
  readListenAlongAnswer,
  updateListenAlongExtension,
  saveListenAlongAnswer,
  shouldOfferListenAlong,
} from "./listen-along-install.js";
import { startSpicetifyBridge } from "./spicetify-bridge.js";
import { createLauncherWindow, LAUNCHER_URL } from "./launcher-window.js";
import { logger, logToFile } from "./logger.js";
import { showAboutWindow } from "./about-window.js";
import { buildMenu } from "./menu.js";
import { createPolicy, isAllowedUrl, TRUSTED_DOMAINS } from "./navigation.js";
import { logFilePath } from "./paths.js";
import { installPermissionHandlers } from "./permissions.js";
import { persistSessionCookies } from "./session-persistence.js";
import { loadSettings, saveSettings } from "./settings.js";
import { reportManualCheck } from "./update-dialog.js";
import { applyUpdate, checkForUpdates, startUpdater } from "./updater.js";
import { contentOf, createWorkAdventureWindow } from "./workadventure-window.js";

// Keeps WorkAdventure connected in the background: its timers run at full rate even when the window is
// hidden (no 1-per-minute "intensive" throttling). Rendering is still paused while hidden or covered:
// the game canvas would otherwise redraw up to 120 times per second for nobody, draining the battery.
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-features", "IntensiveWakeUpThrottling");
app.setName("WorkAdventure");
if (app.isPackaged) logToFile(logFilePath());
// Running from sources uses its own profile: it never touches, nor locks, the installed app's session.
if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "WorkAdventure-dev"));

const settingsPath = join(app.getPath("userData"), "settings.json");
const avatarPath = join(app.getPath("userData"), "avatar.json");
const listenAlongPath = join(app.getPath("userData"), "listen-along.json");
let policy = createPolicy(INSTANCES.prod.url);
let currentWindow: BrowserWindow | undefined;
let notice: string | undefined;
let updateStatus: UpdateStatus = { state: "disabled" };
/** Set by the menu item: the next settled status is reported in a dialog. */
let manualCheckPending = false;
let desktop: DesktopIntegration | undefined;
/** A workadventure:// link that launched the app, opened once it is ready. */
let pendingDeepLink: string | undefined;

// Registered before `ready`: macOS delivers the link that launched the app right away.
app.on("open-url", (event, link) => {
  event.preventDefault();
  void openDeepLink(link);
});

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
  installPermissionHandlers(session.defaultSession, (url) => url.startsWith(LAUNCHER_URL) || isAllowedUrl(url, policy));
  persistSessionCookies(session.defaultSession, (url) => isAllowedUrl(url, policy));
  registerIpc({
    getLauncherState: launcherState,
    launch,
    openLauncher,
    getUpdateStatus: () => updateStatus,
    applyUpdate: () => applyUpdate(updateStatus),
    checkForUpdates,
    installListenAlong: async () => {
      await installListenAlong(currentEnvironment(), net.fetch);
      saveListenAlongAnswer(listenAlongPath, "installed");
    },
    dismissListenAlong: () => saveListenAlongAnswer(listenAlongPath, "dismissed"),
  });
  startUpdater(announceUpdateStatus);
  startSpicetifyBridge();
  updateListenAlongExtension(currentEnvironment(), net.fetch).catch((error: unknown) =>
    logger.warn({ err: error }, "Could not update the listen along extension"),
  );
  if (app.isPackaged) app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
  desktop = startDesktopIntegration({
    currentContent: () => currentWindow && contentOf(currentWindow),
    showWindow: focusCurrentWindow,
    openLauncher: () => void openLauncher(),
    checkForUpdates: checkForUpdatesFromMenu,
    showAbout: () => void showAboutWindow(),
  });
  Menu.setApplicationMenu(
    buildMenu({ onOpenLauncher: () => void openLauncher(), onSignOut: () => void signOut(), onCheckForUpdates: checkForUpdatesFromMenu, onShowAbout: () => void showAboutWindow() }),
  );

  if (pendingDeepLink) {
    await enter({ kind: "custom", url: pendingDeepLink });
    return;
  }
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
  const label = choiceLabel(choice);
  replaceCurrentWindow(
    await createWorkAdventureWindow({
      url,
      label,
      policy,
      onRoomLoaded: (content) => {
        void refreshAvatar(content);
        desktop?.roomLoaded(content);
      },
    }),
  );
  desktop?.enteredSpace(label);
}

/** Opens the room of a workadventure:// link; links to untrusted sites are ignored. */
async function openDeepLink(link: string): Promise<void> {
  const target = deepLinkTarget(link, (url) => isAllowedUrl(url, { domains: TRUSTED_DOMAINS, origins: [] }));
  if (!target) {
    logger.warn({ link }, "Ignoring deep link to an untrusted or malformed address");
    return;
  }
  if (!app.isReady()) {
    pendingDeepLink = target;
    return;
  }
  try {
    await enter({ kind: "custom", url: target });
    focusCurrentWindow();
  } catch (error) {
    logger.error({ err: error, target }, "Could not open deep link");
  }
}

async function openLauncher(): Promise<void> {
  // Leaving a room: catch any woka change made during the session before the page closes.
  const content = currentWindow && contentOf(currentWindow);
  if (content) await refreshAvatar(content);
  replaceCurrentWindow(await createLauncherWindow());
  desktop?.leftSpace();
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
    offerListenAlong: shouldOfferListenAlong(currentEnvironment(), readListenAlongAnswer(listenAlongPath)),
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
  if (manualCheckPending && status.state !== "checking") {
    manualCheckPending = false;
    void reportManualCheck(status, { parent: currentWindow, onApply: () => applyUpdate(status) });
  }
}

/** Already downloaded or running from sources: answer right away; otherwise check and answer when settled. */
function checkForUpdatesFromMenu(): void {
  if (updateStatus.state === "ready" || updateStatus.state === "disabled") {
    void reportManualCheck(updateStatus, { parent: currentWindow, onApply: () => applyUpdate(updateStatus) });
    return;
  }
  manualCheckPending = true;
  checkForUpdates();
}

/** The new window opens before the old one closes, so `window-all-closed` never fires in between. */
function replaceCurrentWindow(next: BrowserWindow): void {
  const previous = currentWindow;
  currentWindow = next;
  // Closed by the user or on quit: forget it, late messages from its page must not reach a destroyed window.
  next.once("closed", () => {
    if (currentWindow === next) currentWindow = undefined;
  });
  previous?.close();
}

function focusCurrentWindow(): void {
  if (!currentWindow) return;
  if (currentWindow.isMinimized()) currentWindow.restore();
  currentWindow.show();
  currentWindow.focus();
  app.focus({ steal: true });
}
