import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Rectangle, type WebContents } from "electron";
import { z } from "zod";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";
import { BACKGROUND, routeNavigation } from "./window-common.js";

const STYLESHEETS = ["../renderer/theme.css", "../renderer/mini-window/mini-window.css"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);
/** theme.css loads it by a relative URL, which an about:blank page cannot resolve: inlined instead. */
const PIXEL_FONT = fileURLToPath(new URL("../renderer/fonts/PixelifySans.ttf", import.meta.url));
const DEFAULT_SIZE = { width: 280, height: 230 };
/** Smallest mini window: one row of buttons, the compact mode below 260×220 (mini-window.css). */
const MIN_SIZE = { width: 250, height: 60 };
const MEETING_BAR_SIZE = { width: 600, height: 56 };
/** Distance from the corner of the screen's usable area. */
const MARGIN = 16;
const SAVE_BOUNDS_DELAY_MS = 500;

// A size saved by an older version below today's minimum is raised to it, not rejected with the other preferences.
const boundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive().transform((width) => Math.max(width, MIN_SIZE.width)),
  height: z.number().int().positive().transform((height) => Math.max(height, MIN_SIZE.height)),
});
const preferencesSchema = z.object({
  /** Opens by itself during a conversation when WorkAdventure is not shown. */
  auto: z.boolean().default(true),
  /** Where the user last left it. */
  bounds: boundsSchema.optional(),
});
type Preferences = z.infer<typeof preferencesSchema>;

let preferencesPath: string | undefined;
/** The open mini window, and whether a screen share is going on (the meeting bar is open). */
let miniWindow: BrowserWindow | undefined;
let screenShared = false;
let preferences: Preferences = { auto: true };

/** The profile file holding the mini window's preferences; a missing or invalid file means the defaults. */
export function loadMiniWindowPreferences(filePath: string): void {
  preferencesPath = filePath;
  preferences = { auto: true };
  const content = readJsonFile(filePath);
  if (content === undefined) return;
  const result = preferencesSchema.safeParse(content);
  if (result.success) preferences = result.data;
  else logger.warn({ filePath, issues: result.error.issues }, "Ignoring invalid mini window preferences");
}

export function isMiniWindowAuto(): boolean {
  return preferences.auto;
}

export function setMiniWindowAuto(auto: boolean): void {
  savePreferences({ ...preferences, auto });
}

/**
 * The mini window floats over every app, where the user last left it, else in the bottom-right corner of the screen
 * WorkAdventure is on. The preload of the WorkAdventure page opens it (window.open) and renders the conversation.
 */
export function miniWindowOptions(parent: BrowserWindow): BrowserWindowConstructorOptions {
  return {
    ...(savedBoundsOnScreen() ?? defaultBounds(parent)),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: "WorkAdventure",
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    backgroundColor: BACKGROUND,
  };
}

/** The meeting bar: a strip at the top of the screen WorkAdventure is on, over every app, while the user shares. */
export function meetingBarOptions(parent: BrowserWindow): BrowserWindowConstructorOptions {
  const area = screen.getDisplayMatching(parent.getBounds()).workArea;
  return {
    ...MEETING_BAR_SIZE,
    x: Math.round(area.x + (area.width - MEETING_BAR_SIZE.width) / 2),
    y: area.y + MARGIN,
    title: "WorkAdventure",
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    backgroundColor: BACKGROUND,
  };
}

/** The app's theme and font for the page the preload renders, no navigation away from it, and its place remembered. */
export function prepareMiniWindow(child: WebContents): void {
  const window = prepareFloatingWindow(child, { protected: screenShared });
  if (!window) return;
  miniWindow = window;
  window.once("closed", () => {
    if (miniWindow === window) miniWindow = undefined;
  });
  rememberBounds(window);
}

/** The meeting bar lives as long as the share: while it is open, the mini window is kept out of the capture too. */
export function prepareMeetingBar(child: WebContents): void {
  const window = prepareFloatingWindow(child, { protected: true });
  setScreenShared(true);
  window?.once("closed", () => setScreenShared(false));
}

/** Out of a share's capture only during a share: otherwise, screenshot tools must see the mini window. */
function setScreenShared(shared: boolean): void {
  screenShared = shared;
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.setContentProtection(shared);
}

/**
 * Shared by the mini window and the meeting bar: no navigation, every desktop, out of screen shares (macOS and
 * Windows; Linux cannot exclude a window from a capture), and the app's styles.
 */
function prepareFloatingWindow(child: WebContents, options: { protected: boolean }): BrowserWindow | null {
  routeNavigation(child, () => false);
  const window = BrowserWindow.fromWebContents(child);
  // Follows the user to every desktop (macOS Spaces), full-screen apps included.
  // skipTransformProcessType: otherwise macOS turns the app into an accessory, gone from the Dock and Cmd+Tab.
  window?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  // The faces of the bubble and the controls stay out of what the user shares.
  window?.setContentProtection(options.protected);
  // Above the annotation overlay ("floating"): the meeting bar stays clickable while the pen takes the clicks.
  window?.setAlwaysOnTop(true, "status");
  const applyStyles = (): void => {
    // The font last: of two faces of the same family, the last one wins, and theme.css's one cannot load here.
    for (const css of [...STYLESHEETS.map((path) => readFileSync(path, "utf8")), fontFace()]) {
      child.insertCSS(css).catch((error: unknown) => logger.warn({ err: error }, "Mini window style not applied"));
    }
  };
  if (child.isLoading()) child.once("did-finish-load", applyStyles);
  else applyStyles();
  return window;
}

function rememberBounds(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!window.isDestroyed()) savePreferences({ ...preferences, bounds: window.getBounds() });
    }, SAVE_BOUNDS_DELAY_MS);
  };
  window.on("moved", save);
  window.on("resized", save);
  window.once("closed", () => clearTimeout(timer));
}

/** A saved place is reused only if it is still fully on a screen (a screen may have been unplugged since). */
function savedBoundsOnScreen(): Rectangle | undefined {
  const bounds = preferences.bounds;
  if (!bounds) return undefined;
  const fits = screen.getAllDisplays().some(({ workArea: area }) =>
    bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height,
  );
  return fits ? bounds : undefined;
}

function defaultBounds(parent: BrowserWindow): Rectangle {
  const area = screen.getDisplayMatching(parent.getBounds()).workArea;
  return {
    ...DEFAULT_SIZE,
    x: area.x + area.width - DEFAULT_SIZE.width - MARGIN,
    y: area.y + area.height - DEFAULT_SIZE.height - MARGIN,
  };
}

function fontFace(): string {
  const data = readFileSync(PIXEL_FONT).toString("base64");
  return `@font-face { font-family: "Pixelify Sans"; src: url("data:font/ttf;base64,${data}") format("truetype"); font-weight: 400 700; }`;
}

function savePreferences(next: Preferences): void {
  preferences = next;
  if (preferencesPath) writeJsonFile(preferencesPath, preferences);
}
