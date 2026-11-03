import { app, shell, type BrowserWindowConstructorOptions, type WebContents } from "electron";
import { logger } from "./logger.js";
import { isSafeExternalUrl, nativeMusicAppUrl } from "./navigation.js";

export const BACKGROUND = "#0b0d1a";
export const IS_MAC = process.platform === "darwin";

/** Hides the native title bar: our page draws it, and keeps drag + double-click-to-maximize natively. */
export function framelessChrome({ height, color }: { height: number; color: string }): BrowserWindowConstructorOptions {
  return {
    titleBarStyle: "hidden",
    ...(IS_MAC
      ? { trafficLightPosition: { x: 16, y: Math.round((height - 16) / 2) } }
      : { titleBarOverlay: { color, symbolColor: "#c9cbe8", height } }),
  };
}

/** Keeps in-app URLs in the window and hands every other link to the default browser. */
export function routeNavigation(contents: WebContents, isInApp: (url: string) => boolean): void {
  contents.on("will-navigate", (event) => {
    if (isInApp(event.url)) return;
    event.preventDefault();
    openExternal(event.url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isInApp(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });
}

/** Surfaces the logs of our own pages (launcher, toolbar) in the main-process logger. */
export function relayConsole(contents: WebContents): void {
  contents.on("console-message", ({ level, message, lineNumber, sourceId }) => {
    const fields = { source: `${sourceId}:${lineNumber}` };
    if (level === "error") logger.error(fields, message);
    else if (level === "warning") logger.warn(fields, message);
    else logger.debug(fields, message);
  });
}

function openExternal(url: string): void {
  if (!isSafeExternalUrl(url)) {
    logger.warn({ url }, "Blocked navigation to unsafe URL");
    return;
  }
  const target = installedMusicAppUrl(url) ?? url;
  shell.openExternal(target).catch((error: unknown) => logger.warn({ err: error, url: target }, "Could not open external URL"));
}

/** A Spotify or Apple Music link opens in the app when it is installed, in the web player otherwise. */
function installedMusicAppUrl(url: string): string | undefined {
  const nativeUrl = nativeMusicAppUrl(url);
  if (!nativeUrl) return undefined;
  const protocol = `${nativeUrl.slice(0, nativeUrl.indexOf(":"))}://`;
  return app.getApplicationNameForProtocol(protocol) ? nativeUrl : undefined;
}
