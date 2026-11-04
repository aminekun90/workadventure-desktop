import { app, BrowserWindow, Menu, net, WebContentsView, type MenuItemConstructorOptions, type WebContents } from "electron";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TOOLBAR_CHANNELS, type ToolbarState } from "../shared/toolbar-api.js";
import { logger } from "./logger.js";
import { currentMapPath, fetchMaps, mapUrl } from "./maps.js";
import { resetControls } from "./workadventure-controls.js";
import { isAllowedUrl, isSpotifyAuthorizationWindow, isSpotifyLoginUrl, type NavigationPolicy } from "./navigation.js";
import { BACKGROUND, framelessChrome, relayConsole, routeNavigation, screenWorkArea } from "./window-common.js";

const TOOLBAR_HTML = fileURLToPath(new URL("../renderer/toolbar/index.html", import.meta.url));
const TOOLBAR_PRELOAD = fileURLToPath(new URL("../preload/toolbar.cjs", import.meta.url));
const WORKADVENTURE_PRELOAD = fileURLToPath(new URL("../preload/workadventure.cjs", import.meta.url));
export const TOOLBAR_URL = pathToFileURL(TOOLBAR_HTML).href;

/** Must match `.toolbar` height in src/renderer/toolbar/toolbar.css. */
const TOOLBAR_HEIGHT = 44;
const TOOLBAR_COLOR = "#10122a";
const LOAD_TIMEOUT_MS = 20_000;

interface WindowParts {
  window: BrowserWindow;
  content: WebContents;
  origin: string;
}

/** IPC arrives from a WebContents (toolbar or page): these find the window it belongs to. */
const partsByToolbar = new WeakMap<WebContents, WindowParts>();
const partsByContent = new WeakMap<WebContents, WindowParts>();

export interface WorkAdventureTarget {
  url: string;
  label: string;
  policy: NavigationPolicy;
  /** Called each time a room (not the login page) has finished loading. */
  onRoomLoaded: (content: WebContents) => void;
}

/**
 * Two layers: the window's own page is our toolbar (local, full bridge), and WorkAdventure runs below
 * it in a separate view whose preload only sends two payload-free signals (src/preload/workadventure.cts).
 */
export async function createWorkAdventureWindow({ url, label, policy, onRoomLoaded }: WorkAdventureTarget): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    ...screenWorkArea(),
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "WorkAdventure",
    backgroundColor: BACKGROUND,
    ...framelessChrome({ height: TOOLBAR_HEIGHT, color: TOOLBAR_COLOR }),
    webPreferences: { preload: TOOLBAR_PRELOAD, sandbox: true, contextIsolation: true, spellcheck: false },
  });
  const content = new WebContentsView({
    webPreferences: {
      preload: WORKADVENTURE_PRELOAD,
      sandbox: true,
      contextIsolation: true,
    },
  });
  window.contentView.addChildView(content);
  const parts: WindowParts = { window, content: content.webContents, origin: new URL(url).origin };
  partsByToolbar.set(window.webContents, parts);
  partsByContent.set(content.webContents, parts);
  window.on("closed", () => content.webContents.close());

  routeNavigation(window.webContents, (target) => target === TOOLBAR_URL);
  relayConsole(window.webContents);
  routeNavigation(content.webContents, (target) => isAllowedUrl(target, policy), {
    // Linking a Spotify account: Spotify's pages, then WorkAdventure's callback, which hands the code to the page.
    allows: isSpotifyAuthorizationWindow,
    routeChild: (child) => routeNavigation(child, (target) => isSpotifyLoginUrl(target) || isAllowedUrl(target, policy)),
  });
  keepContentBelowToolbar(window, content);
  reloadOnCrash(content.webContents);
  syncToolbar(window.webContents, content.webContents, label);
  content.webContents.on("did-navigate", () => resetControls(content.webContents));
  content.webContents.on("did-stop-loading", () => {
    if (currentMapPath(content.webContents.getURL())) onRoomLoaded(content.webContents);
  });

  try {
    await window.loadFile(TOOLBAR_HTML);
    await loadWithTimeout(content.webContents, url);
  } catch (error) {
    window.destroy();
    throw error;
  }
  // Shown only once the server answered: until then the launcher stays up with its spinner.
  window.show();
  return window;
}

export function isWorkAdventureContent(contents: WebContents): boolean {
  return partsByContent.has(contents);
}

/** The WorkAdventure page of a window, if it is a WorkAdventure window. */
export function contentOf(window: BrowserWindow): WebContents | undefined {
  if (window.isDestroyed()) return undefined;
  return partsByToolbar.get(window.webContents)?.content;
}

/** The live window of a WorkAdventure page: a page can still send a last message while its window closes. */
function liveWindowOf(content: WebContents): BrowserWindow | undefined {
  const window = partsByContent.get(content)?.window;
  return window && !window.isDestroyed() ? window : undefined;
}

/** A notification was shown: draw the eye to a background window (Dock bounce, taskbar flash). */
export function requestAttention(content: WebContents): void {
  const window = liveWindowOf(content);
  if (!window || window.isFocused()) return;
  if (process.platform === "darwin") {
    app.dock?.bounce("informational");
    return;
  }
  window.flashFrame(true);
  window.once("focus", () => window.flashFrame(false));
}

/** A notification was clicked: the page cannot raise its window itself from inside a view. */
export function focusWindowOf(content: WebContents): void {
  const window = liveWindowOf(content);
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
}

export function reloadContent(toolbar: WebContents): void {
  partsByToolbar.get(toolbar)?.content.reload();
}

/** Native menu (the page view would cover an HTML dropdown), listing the space's maps live. */
export async function showMapMenu(toolbar: WebContents, anchor: { x: number; y: number }): Promise<void> {
  const parts = partsByToolbar.get(toolbar);
  if (!parts) return;
  const items = await mapMenuItems(parts);
  Menu.buildFromTemplate(items).popup({ window: parts.window, ...anchor });
}

/** Same map list as the toolbar's, for the menu bar item. */
export async function mapMenuFor(content: WebContents): Promise<MenuItemConstructorOptions[]> {
  const parts = partsByContent.get(content);
  return parts ? mapMenuItems(parts) : [];
}

async function mapMenuItems({ content, origin }: WindowParts): Promise<MenuItemConstructorOptions[]> {
  try {
    const maps = await fetchMaps({ origin, fetch: net.fetch });
    if (maps.length === 0) return [{ label: "Aucune map", enabled: false }];
    const current = currentMapPath(content.getURL());
    return maps.map(({ path, label }) => ({
      label,
      type: "radio",
      checked: path === current,
      click: () => {
        loadPage(content, mapUrl(origin, path)).catch((error: unknown) => logger.error({ err: error, path }, "Map switch failed"));
      },
    }));
  } catch (error) {
    logger.warn({ err: error, origin }, "Map listing unavailable");
    return [{ label: "Liste des maps indisponible", enabled: false }];
  }
}

/** The toolbar steps aside while a video is in HTML fullscreen. */
function keepContentBelowToolbar(window: BrowserWindow, content: WebContentsView): void {
  let top = TOOLBAR_HEIGHT;
  const layout = (): void => {
    const { width, height } = window.getContentBounds();
    content.setBounds({ x: 0, y: top, width, height: height - top });
  };
  layout();
  window.on("resize", layout);
  content.webContents.on("enter-html-full-screen", () => {
    top = 0;
    layout();
  });
  content.webContents.on("leave-html-full-screen", () => {
    top = TOOLBAR_HEIGHT;
    layout();
  });
}

function reloadOnCrash(content: WebContents): void {
  content.on("render-process-gone", (_event, details) => {
    logger.error({ reason: details.reason, exitCode: details.exitCode }, "WorkAdventure renderer gone, reloading");
    if (details.reason !== "clean-exit") content.reload();
  });
}

function syncToolbar(toolbar: WebContents, content: WebContents, label: string): void {
  const push = (): void => {
    if (toolbar.isDestroyed() || content.isDestroyed()) return;
    const state: ToolbarState = { label, host: URL.parse(content.getURL())?.host ?? "", loading: content.isLoading() };
    toolbar.send(TOOLBAR_CHANNELS.state, state);
  };
  toolbar.on("did-finish-load", push);
  content.on("did-navigate", push);
  content.on("did-navigate-in-page", push);
  content.on("did-start-loading", push);
  content.on("did-stop-loading", push);
}

async function loadWithTimeout(content: WebContents, url: string): Promise<void> {
  const timeout = AbortSignal.timeout(LOAD_TIMEOUT_MS);
  await Promise.race([loadPage(content, url), once(timeout, "abort").then(() => Promise.reject(timeout.reason))]);
}

async function loadPage(content: WebContents, url: string): Promise<void> {
  try {
    await content.loadURL(url);
  } catch (error) {
    // The front redirects to the OpenID login before the first load completes.
    if (!isAbortedNavigation(error)) throw error;
  }
}

function isAbortedNavigation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ERR_ABORTED";
}
