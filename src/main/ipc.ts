import { ipcMain, net, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { ABOUT_CHANNELS, ABOUT_LINKS } from "../shared/about-api.js";
import { choiceSchema, choiceUrl, settingsSchema, type Settings } from "../shared/config.js";
import { LAUNCHER_CHANNELS, type LaunchResult, type LauncherState, type ProbeResult } from "../shared/launcher-api.js";
import { CONTENT_CHANNELS } from "../shared/content-api.js";
import { TOOLBAR_CHANNELS } from "../shared/toolbar-api.js";
import { UPDATE_CHANNELS, type UpdateStatus } from "../shared/update-api.js";
import { ABOUT_URL, aboutInfo, copyDiagnostics, openAboutLink } from "./about-window.js";
import { LAUNCHER_URL } from "./launcher-window.js";
import { logger } from "./logger.js";
import { focusWindowOf, reloadContent, requestAttention, showMapMenu, TOOLBAR_URL } from "./workadventure-window.js";

const PROBE_TIMEOUT_MS = 4000;
const anchorSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });

export interface IpcHandlers {
  getLauncherState(): Promise<LauncherState>;
  launch(request: Settings): Promise<void>;
  openLauncher(): Promise<void>;
  getUpdateStatus(): UpdateStatus;
  applyUpdate(): Promise<void>;
  checkForUpdates(): void;
}

/** Payloads come from a renderer: each channel only answers its own bundled page, and validates input. */
export function registerIpc(handlers: IpcHandlers): void {
  registerLauncherChannels(handlers);
  registerToolbarChannels(handlers);
  registerUpdateChannels(handlers);
  registerContentChannels();
  registerAboutChannels(handlers);
}

function registerLauncherChannels(handlers: IpcHandlers): void {
  ipcMain.handle(LAUNCHER_CHANNELS.getState, (event) => {
    assertSender(event, LAUNCHER_URL);
    return handlers.getLauncherState();
  });

  ipcMain.handle(LAUNCHER_CHANNELS.probe, (event, payload: unknown) => {
    assertSender(event, LAUNCHER_URL);
    return probe(choiceUrl(choiceSchema.parse(payload)));
  });

  ipcMain.handle(LAUNCHER_CHANNELS.launch, async (event, payload: unknown): Promise<LaunchResult> => {
    assertSender(event, LAUNCHER_URL);
    const request = settingsSchema.safeParse(payload);
    if (!request.success) return { ok: false, message: request.error.issues[0]?.message ?? "Requête invalide" };
    try {
      await handlers.launch(request.data);
      return { ok: true };
    } catch (error) {
      const host = new URL(choiceUrl(request.data.choice)).host;
      logger.error({ err: error, host }, "Launch failed");
      return { ok: false, message: `Impossible de joindre ${host}` };
    }
  });
}

function registerToolbarChannels(handlers: IpcHandlers): void {
  ipcMain.handle(TOOLBAR_CHANNELS.openLauncher, (event) => {
    assertSender(event, TOOLBAR_URL);
    return handlers.openLauncher();
  });

  ipcMain.handle(TOOLBAR_CHANNELS.reload, (event) => {
    assertSender(event, TOOLBAR_URL);
    reloadContent(event.sender);
  });

  ipcMain.handle(TOOLBAR_CHANNELS.showMaps, (event, payload: unknown) => {
    assertSender(event, TOOLBAR_URL);
    return showMapMenu(event.sender, anchorSchema.parse(payload));
  });
}

function registerAboutChannels(handlers: IpcHandlers): void {
  ipcMain.handle(ABOUT_CHANNELS.getInfo, (event) => {
    assertSender(event, ABOUT_URL);
    return aboutInfo();
  });

  ipcMain.handle(ABOUT_CHANNELS.open, (event, payload: unknown) => {
    assertSender(event, ABOUT_URL);
    return openAboutLink(z.enum(ABOUT_LINKS).parse(payload));
  });

  ipcMain.handle(ABOUT_CHANNELS.checkForUpdates, (event) => {
    assertSender(event, ABOUT_URL);
    handlers.checkForUpdates();
  });

  ipcMain.handle(ABOUT_CHANNELS.copyDiagnostics, (event) => {
    assertSender(event, ABOUT_URL);
    copyDiagnostics();
  });
}

/** Update status is shown by every local page. */
function registerUpdateChannels(handlers: IpcHandlers): void {
  ipcMain.handle(UPDATE_CHANNELS.get, (event) => {
    assertSender(event, LAUNCHER_URL, TOOLBAR_URL, ABOUT_URL);
    return handlers.getUpdateStatus();
  });

  ipcMain.handle(UPDATE_CHANNELS.apply, (event) => {
    assertSender(event, LAUNCHER_URL, TOOLBAR_URL, ABOUT_URL);
    return handlers.applyUpdate();
  });
}

/** Payload-free signals from the WorkAdventure page; senders that are not a WorkAdventure view are ignored. */
function registerContentChannels(): void {
  ipcMain.on(CONTENT_CHANNELS.attention, (event) => requestAttention(event.sender));
  ipcMain.on(CONTENT_CHANNELS.focus, (event) => focusWindowOf(event.sender));
}

/** An unreachable server is a probe result, not a failure. */
async function probe(url: string): Promise<ProbeResult> {
  const startedAt = performance.now();
  try {
    const response = await net.fetch(url, { method: "HEAD", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return { online: response.status < 500, latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { online: false };
  }
}

function assertSender(event: IpcMainInvokeEvent, ...allowedUrls: string[]): void {
  const senderUrl = event.senderFrame?.url;
  if (!senderUrl || !allowedUrls.includes(senderUrl)) throw new Error(`IPC refused: sender is not one of ${allowedUrls.join(", ")}`);
}
