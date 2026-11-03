import { app, BrowserWindow, clipboard, shell } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AboutInfo, AboutLink } from "../shared/about-api.js";
import { BACKGROUND, framelessChrome, IS_MAC, relayConsole, routeNavigation } from "./window-common.js";

const ABOUT_HTML = fileURLToPath(new URL("../renderer/about/index.html", import.meta.url));
const ABOUT_PRELOAD = fileURLToPath(new URL("../preload/about.cjs", import.meta.url));
export const ABOUT_URL = pathToFileURL(ABOUT_HTML).href;

const REPOSITORY_URL = "https://github.com/aminekun90/workadventure-desktop";
const SYSTEM_NAMES: Partial<Record<NodeJS.Platform, string>> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

let aboutWindow: BrowserWindow | undefined;

/** One About window at a time: asking again brings the open one to the front. */
export async function showAboutWindow(): Promise<void> {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: 440,
    height: 620,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: "À propos de WorkAdventure",
    backgroundColor: BACKGROUND,
    ...framelessChrome({ height: 40, color: BACKGROUND }),
    webPreferences: { preload: ABOUT_PRELOAD, sandbox: true, contextIsolation: true, spellcheck: false },
  });
  aboutWindow = window;
  window.on("closed", () => (aboutWindow = undefined));
  if (!IS_MAC) window.removeMenu();
  routeNavigation(window.webContents, (url) => url === ABOUT_URL);
  relayConsole(window.webContents);
  window.once("ready-to-show", () => window.show());
  await window.loadFile(ABOUT_HTML);
}

export function aboutInfo(): AboutInfo {
  const version = app.getVersion();
  return {
    version,
    channel: version.includes("-") ? "beta" : "stable",
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    system: `${SYSTEM_NAMES[process.platform] ?? process.platform} ${process.getSystemVersion()}`,
    arch: process.arch,
    copyright: `© ${new Date().getFullYear()} Amine Bouzahar`,
  };
}

export async function openAboutLink(link: AboutLink): Promise<void> {
  const url = link === "release-notes" ? `${REPOSITORY_URL}/releases/tag/v${app.getVersion()}` : REPOSITORY_URL;
  await shell.openExternal(url);
}

export function copyDiagnostics(): void {
  const info = aboutInfo();
  clipboard.writeText(
    [
      `WorkAdventure Desktop ${info.version}`,
      `Electron ${info.electron} · Chromium ${info.chromium} · Node ${info.node}`,
      `${info.system} (${info.arch})`,
    ].join("\n"),
  );
}
