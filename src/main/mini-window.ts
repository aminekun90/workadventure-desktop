import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type WebContents } from "electron";
import { logger } from "./logger.js";
import { BACKGROUND, routeNavigation } from "./window-common.js";

const STYLESHEETS = ["../renderer/theme.css", "../renderer/mini-window/mini-window.css"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);
const SIZE = { width: 340, height: 300 };
/** Distance from the corner of the screen's usable area. */
const MARGIN = 16;

/**
 * The mini window floats over every app, in the bottom-right corner of the screen WorkAdventure is on. The preload of
 * the WorkAdventure page opens it (window.open) and renders the conversation into it.
 */
export function miniWindowOptions(parent: BrowserWindow): BrowserWindowConstructorOptions {
  const area = screen.getDisplayMatching(parent.getBounds()).workArea;
  return {
    ...SIZE,
    x: area.x + area.width - SIZE.width - MARGIN,
    y: area.y + area.height - SIZE.height - MARGIN,
    minWidth: 240,
    minHeight: 200,
    title: "WorkAdventure",
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    backgroundColor: BACKGROUND,
  };
}

/** The app's theme for the page the preload renders, and no navigation away from it. */
export function prepareMiniWindow(child: WebContents): void {
  routeNavigation(child, () => false);
  // Follows the user to every desktop (macOS Spaces), full-screen apps included.
  BrowserWindow.fromWebContents(child)?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const applyStyles = (): void => {
    for (const path of STYLESHEETS) {
      child.insertCSS(readFileSync(path, "utf8")).catch((error: unknown) => logger.warn({ err: error, path }, "Mini window style not applied"));
    }
  };
  if (child.isLoading()) child.once("did-finish-load", applyStyles);
  else applyStyles();
}
