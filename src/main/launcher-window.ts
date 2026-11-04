import { BrowserWindow } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BACKGROUND, framelessChrome, IS_MAC, relayConsole, routeNavigation, screenWorkArea } from "./window-common.js";

const LAUNCHER_HTML = fileURLToPath(new URL("../renderer/launcher/index.html", import.meta.url));
const LAUNCHER_PRELOAD = fileURLToPath(new URL("../preload/launcher.cjs", import.meta.url));
export const LAUNCHER_URL = pathToFileURL(LAUNCHER_HTML).href;

export async function createLauncherWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    ...screenWorkArea(),
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: "WorkAdventure",
    backgroundColor: BACKGROUND,
    ...framelessChrome({ height: 40, color: BACKGROUND }),
    webPreferences: { preload: LAUNCHER_PRELOAD, sandbox: true, contextIsolation: true, spellcheck: false },
  });
  if (!IS_MAC) window.removeMenu();
  routeNavigation(window.webContents, (url) => url === LAUNCHER_URL);
  relayConsole(window.webContents);
  window.once("ready-to-show", () => window.show());
  await window.loadFile(LAUNCHER_HTML);
  return window;
}
