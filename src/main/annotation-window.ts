import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, screen, type WebContents } from "electron";
import { ANNOTATION_CHANNELS, type AnnotationCommand } from "../shared/annotation-api.js";
import { CONTENT_CHANNELS } from "../shared/content-api.js";
import { logger } from "./logger.js";
import { relayConsole, routeNavigation } from "./window-common.js";

const ANNOTATION_HTML = fileURLToPath(new URL("../renderer/annotation/index.html", import.meta.url));
const ANNOTATION_PRELOAD = fileURLToPath(new URL("../preload/annotation.cjs", import.meta.url));
export const ANNOTATION_URL = pathToFileURL(ANNOTATION_HTML).href;

let overlay: BrowserWindow | undefined;
let ready: Promise<void> = Promise.resolve();
/** The WorkAdventure page whose meeting bar drives the overlay: told when Escape gives the mouse back. */
let page: WebContents | undefined;

/**
 * The meeting bar's annotation tools. The overlay covers the screen the pointer is on (the system picker does not
 * say which screen is shared) and is captured by the share, unlike the meeting bar and the mini window.
 */
export function annotate(command: AnnotationCommand, from: WebContents): void {
  page = from;
  if ("action" in command && command.action === "stop") {
    overlay?.close();
    return;
  }
  const window = overlay ?? openOverlay();
  // "mouse": the apps underneath get the clicks back, the drawings stay.
  if ("tool" in command) window.setIgnoreMouseEvents(command.tool === "mouse", { forward: true });
  ready
    .then(() => {
      if (!window.isDestroyed()) window.webContents.send(ANNOTATION_CHANNELS.command, command);
    })
    .catch((error: unknown) => logger.warn({ err: error }, "Annotation overlay not ready"));
}

/** Escape in the overlay: back to the mouse, drawings kept; the meeting bar shows it. */
export function releaseAnnotationMouse(): void {
  if (!overlay || !page || page.isDestroyed()) return;
  annotate({ tool: "mouse" }, page);
  page.send(CONTENT_CHANNELS.annotationTool, "mouse");
}

function openOverlay(): BrowserWindow {
  const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const window = new BrowserWindow({
    ...bounds,
    title: "WorkAdventure",
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    webPreferences: { preload: ANNOTATION_PRELOAD, sandbox: true, contextIsolation: true, spellcheck: false },
  });
  // Above the apps, on every desktop, like the shared screen; below the meeting bar and the mini window ("status"),
  // which must stay clickable while the pen takes the clicks.
  window.setAlwaysOnTop(true, "floating");
  // skipTransformProcessType: otherwise macOS turns the app into an accessory, gone from the Dock and Cmd+Tab.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  routeNavigation(window.webContents, (url) => url === ANNOTATION_URL);
  relayConsole(window.webContents);
  window.on("closed", () => {
    if (overlay === window) overlay = undefined;
  });
  overlay = window;
  ready = window.loadFile(ANNOTATION_HTML);
  return window;
}
