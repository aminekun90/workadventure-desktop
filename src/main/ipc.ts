import { ipcMain, net, type IpcMainInvokeEvent, type WebContents } from "electron";
import { z } from "zod";
import { ABOUT_CHANNELS, ABOUT_LINKS } from "../shared/about-api.js";
import { APPEARANCE_CHANNELS, appearanceSchema } from "../shared/appearance-api.js";
import { choiceSchema, choiceUrl, settingsSchema, type Settings } from "../shared/config.js";
import {
  LAUNCHER_CHANNELS,
  type AddSpaceResponse,
  type LaunchResult,
  type LauncherSpaces,
  type LauncherState,
  type ProbeResult,
} from "../shared/launcher-api.js";
import { newSpaceSchema, spaceRefSchema, type NewSpace, type SpaceRef } from "../shared/spaces.js";
import { CONTENT_CHANNELS } from "../shared/content-api.js";
import { TOOLBAR_CHANNELS } from "../shared/toolbar-api.js";
import { EnvironmentSetting } from "../shared/environment-api.js";
import { environmentSchema } from "./environment.js";
import { UPDATE_CHANNELS, type UpdateStatus } from "../shared/update-api.js";
import { ABOUT_URL, aboutInfo, copyDiagnostics, openAboutLink } from "./about-window.js";
import { getAppearance, setAppearance } from "./appearance.js";
import { LAUNCHER_URL } from "./launcher-window.js";
import { logger } from "./logger.js";
import { SpotifyPlaybackCommand } from "../shared/content-api.js";
import { watchSpotify } from "./spotify-player.js";
import {
  controlSpicetifyPlayback,
  onSpicetifyPlayback,
  spicetifyPlayback,
  dequeueOnSpicetify,
  enqueueOnSpicetify,
  followOnSpicetify,
  likeOnSpicetify,
  moveInSpicetifyQueue,
  onSpicetifyChange,
  onSpicetifyQueue,
  onSpicetifyMusic,
  spicetifyMusic,
  onSpicetifyQueueRequest,
  setHomeJamOnSpicetify,
  spicetifyQueue,
  spicetifyConnected,
  refreshSpicetifyQueue,
} from "./spicetify-bridge.js";
import {
  dequeueSchema,
  enqueueSchema,
  likeSchema,
  moveSchema,
  followSchema,
  homeJamSchema,
  listeningSchema,
  mediaSchema,
  statusSchema,
  unreadSchema,
  updateControls,
} from "./workadventure-controls.js";
import { focusWindowOf, isWorkAdventureContent, reloadContent, reportEnvironment, requestAttention, showEnvironment, showMapMenu, TOOLBAR_URL } from "./workadventure-window.js";

const PROBE_TIMEOUT_MS = 4000;
const availabilitySubscriptions = new WeakMap<WebContents, () => void>();
const anchorSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });

export interface IpcHandlers {
  getLauncherState(): Promise<LauncherState>;
  launch(request: Settings): Promise<void>;
  installListenAlong(): Promise<void>;
  dismissListenAlong(): void;
  addSpace(request: NewSpace): AddSpaceResponse;
  removeSpace(ref: SpaceRef): LauncherSpaces;
  restoreSpaces(): LauncherSpaces;
  openLauncher(): Promise<void>;
  getUpdateStatus(): UpdateStatus;
  applyUpdate(): Promise<void>;
  checkForUpdates(): void;
}

/** Payloads come from a renderer: each channel only answers its own bundled page, and validates input. */
export function registerIpc(handlers: IpcHandlers): void {
  registerLauncherChannels(handlers);
  registerListenAlongChannels(handlers);
  registerToolbarChannels(handlers);
  registerUpdateChannels(handlers);
  registerAppearanceChannels();
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

function registerListenAlongChannels(handlers: IpcHandlers): void {
  ipcMain.handle(LAUNCHER_CHANNELS.installListenAlong, async (event): Promise<LaunchResult> => {
    assertSender(event, LAUNCHER_URL);
    try {
      await handlers.installListenAlong();
      return { ok: true };
    } catch (error) {
      logger.error({ err: error }, "Listen along installation failed");
      return { ok: false, message: error instanceof Error ? error.message : "Installation impossible" };
    }
  });
  ipcMain.handle(LAUNCHER_CHANNELS.dismissListenAlong, (event) => {
    assertSender(event, LAUNCHER_URL);
    handlers.dismissListenAlong();
  });
  ipcMain.handle(LAUNCHER_CHANNELS.addSpace, (event, payload: unknown): AddSpaceResponse => {
    assertSender(event, LAUNCHER_URL);
    const request = newSpaceSchema.safeParse(payload);
    if (!request.success) return { ok: false, message: request.error.issues[0]?.message ?? "Espace invalide" };
    return handlers.addSpace(request.data);
  });
  ipcMain.handle(LAUNCHER_CHANNELS.removeSpace, (event, payload: unknown) => {
    assertSender(event, LAUNCHER_URL);
    return handlers.removeSpace(spaceRefSchema.parse(payload));
  });
  ipcMain.handle(LAUNCHER_CHANNELS.restoreSpaces, (event) => {
    assertSender(event, LAUNCHER_URL);
    return handlers.restoreSpaces();
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
  ipcMain.handle(TOOLBAR_CHANNELS.showEnvironment, (event, payload: unknown) => {
    assertSender(event, TOOLBAR_URL);
    const request = z.object({ setting: z.enum(EnvironmentSetting), anchor: anchorSchema }).parse(payload);
    showEnvironment(event.sender, request.setting, request.anchor);
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

/** Every local page follows the look chosen in WorkAdventure. */
function registerAppearanceChannels(): void {
  ipcMain.handle(APPEARANCE_CHANNELS.get, (event) => {
    assertSender(event, LAUNCHER_URL, TOOLBAR_URL, ABOUT_URL);
    return getAppearance();
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

/** From the remote WorkAdventure page: ignored unless the sender is a WorkAdventure view; values validated. */
function registerContentChannels(): void {
  ipcMain.on(CONTENT_CHANNELS.environment, (event, payload: unknown) => {
    if (!isWorkAdventureContent(event.sender)) return;
    const state = environmentSchema.safeParse(payload);
    if (!state.success) return;
    updateControls(event.sender, { environment: state.data });
    reportEnvironment(event.sender, state.data);
  });
  ipcMain.on(CONTENT_CHANNELS.attention, (event) => requestAttention(event.sender));
  ipcMain.on(CONTENT_CHANNELS.focus, (event) => focusWindowOf(event.sender));
  ipcMain.on(CONTENT_CHANNELS.controlsReady, (event) => {
    if (isWorkAdventureContent(event.sender)) updateControls(event.sender, { ready: true });
  });
  ipcMain.on(CONTENT_CHANNELS.media, (event, payload: unknown) => {
    const media = mediaSchema.safeParse(payload);
    if (media.success && isWorkAdventureContent(event.sender)) updateControls(event.sender, { media: media.data });
  });
  ipcMain.on(CONTENT_CHANNELS.statusReady, (event) => {
    if (isWorkAdventureContent(event.sender)) updateControls(event.sender, { statusReady: true });
  });
  ipcMain.on(CONTENT_CHANNELS.status, (event, payload: unknown) => {
    const status = statusSchema.safeParse(payload);
    if (status.success && isWorkAdventureContent(event.sender)) updateControls(event.sender, { status: status.data });
  });
  ipcMain.on(CONTENT_CHANNELS.appearance, (event, payload: unknown) => {
    const appearance = appearanceSchema.safeParse(payload);
    if (appearance.success && isWorkAdventureContent(event.sender)) setAppearance(appearance.data);
  });
  ipcMain.on(CONTENT_CHANNELS.spotifyWatch, (event, payload: unknown) => {
    const watching = z.boolean().safeParse(payload);
    if (watching.success && isWorkAdventureContent(event.sender)) watchSpotify(event.sender, { watching: watching.data });
  });
  ipcMain.on(CONTENT_CHANNELS.listening, (event, payload: unknown) => {
    const listening = listeningSchema.safeParse(payload);
    if (listening.success && isWorkAdventureContent(event.sender)) updateControls(event.sender, { listening: listening.data });
  });
  ipcMain.on(CONTENT_CHANNELS.listenAlongReady, (event) => {
    if (!isWorkAdventureContent(event.sender)) return;
    const page = event.sender;
    // A reload asks again: the previous subscription of this page is replaced, not stacked.
    availabilitySubscriptions.get(page)?.();
    let available = spicetifyConnected();
    page.send(CONTENT_CHANNELS.listenAlongAvailable, available);
    const stop = onSpicetifyChange(() => {
      if (page.isDestroyed() || spicetifyConnected() === available) return;
      available = spicetifyConnected();
      page.send(CONTENT_CHANNELS.listenAlongAvailable, available);
    });
    availabilitySubscriptions.set(page, stop);
    page.once("destroyed", stop);
  });
  ipcMain.on(CONTENT_CHANNELS.spotifyPlayback, (event, payload: unknown) => {
    const command = z.discriminatedUnion("command", [
      z.object({ command: z.enum([
        SpotifyPlaybackCommand.Play,
        SpotifyPlaybackCommand.Pause,
        SpotifyPlaybackCommand.Next,
        SpotifyPlaybackCommand.Previous,
        SpotifyPlaybackCommand.Mute,
        SpotifyPlaybackCommand.Shuffle,
        SpotifyPlaybackCommand.Repeat,
      ]) }),
      z.object({ command: z.literal(SpotifyPlaybackCommand.Seek), value: z.number().int().nonnegative().max(86_400_000) }),
      z.object({ command: z.literal(SpotifyPlaybackCommand.Volume), value: z.number().min(0).max(1) }),
    ]).safeParse(payload);
    if (command.success && isWorkAdventureContent(event.sender)) controlSpicetifyPlayback(command.data);
  });
  const playbackSubscriptions = new WeakMap<WebContents, () => void>();
  ipcMain.on(CONTENT_CHANNELS.spotifyPlaybackWatch, (event, payload: unknown) => {
    const watching = z.boolean().safeParse(payload);
    if (!watching.success || !isWorkAdventureContent(event.sender)) return;
    const page = event.sender;
    // Subscribe again before letting go of the previous subscription: dropping to no listener in between resets the
    // last state to null, which disabled the player until Spotify reported again.
    const previous = playbackSubscriptions.get(page);
    playbackSubscriptions.delete(page);
    if (!watching.data) {
      previous?.();
      return;
    }
    const stop = onSpicetifyPlayback((state) => {
      if (!page.isDestroyed()) page.send(CONTENT_CHANNELS.spotifyPlaybackState, state);
    });
    previous?.();
    page.send(CONTENT_CHANNELS.spotifyPlaybackState, spicetifyPlayback());
    playbackSubscriptions.set(page, stop);
    page.once("destroyed", stop);
  });
  ipcMain.on(CONTENT_CHANNELS.queueRefresh, (event) => {
    if (isWorkAdventureContent(event.sender)) refreshSpicetifyQueue();
  });
  ipcMain.on(CONTENT_CHANNELS.follow, (event, payload: unknown) => {
    const target = followSchema.safeParse(payload);
    if (target.success && isWorkAdventureContent(event.sender)) followOnSpicetify(target.data);
  });
  // The page in a home Jam receives the tracks the user adds from Spotify; only one at a time, the latest.
  let homeJamPage: WebContents | undefined;
  ipcMain.on(CONTENT_CHANNELS.homeJam, (event, payload: unknown) => {
    const jam = homeJamSchema.safeParse(payload);
    if (!jam.success || !isWorkAdventureContent(event.sender)) return;
    if (jam.data) homeJamPage = event.sender;
    else if (homeJamPage !== event.sender) return;
    else homeJamPage = undefined;
    setHomeJamOnSpicetify(jam.data);
  });
  onSpicetifyQueueRequest((uris) => {
    if (homeJamPage && !homeJamPage.isDestroyed()) homeJamPage.send(CONTENT_CHANNELS.queueRequest, uris);
  });
  ipcMain.on(CONTENT_CHANNELS.enqueue, (event, payload: unknown) => {
    const request = enqueueSchema.safeParse(payload);
    if (request.success && isWorkAdventureContent(event.sender)) enqueueOnSpicetify(request.data);
  });
  // The Jukebox's host page shows its Spotify queue: it receives it while it asks, a reload asking again.
  const musicSubscriptions = new WeakMap<WebContents, () => void>();
  ipcMain.on(CONTENT_CHANNELS.spotifyMusicWatch, (event, payload: unknown) => {
    const watching = z.boolean().safeParse(payload);
    if (!watching.success || !isWorkAdventureContent(event.sender)) return;
    const page = event.sender;
    const previous = musicSubscriptions.get(page);
    musicSubscriptions.delete(page);
    if (!watching.data) {
      previous?.();
      return;
    }
    const stop = onSpicetifyMusic((frame) => {
      if (!page.isDestroyed()) page.send(CONTENT_CHANNELS.spotifyMusic, frame);
    });
    previous?.();
    page.send(CONTENT_CHANNELS.spotifyMusic, spicetifyMusic());
    musicSubscriptions.set(page, stop);
    page.once("destroyed", stop);
  });
  const queueSubscriptions = new WeakMap<WebContents, () => void>();
  ipcMain.on(CONTENT_CHANNELS.queueWatch, (event, payload: unknown) => {
    const watching = z.boolean().safeParse(payload);
    if (!watching.success || !isWorkAdventureContent(event.sender)) return;
    const page = event.sender;
    queueSubscriptions.get(page)?.();
    queueSubscriptions.delete(page);
    if (!watching.data) return;
    page.send(CONTENT_CHANNELS.spotifyQueue, spicetifyQueue());
    const stop = onSpicetifyQueue((state) => {
      if (!page.isDestroyed()) page.send(CONTENT_CHANNELS.spotifyQueue, state);
    });
    queueSubscriptions.set(page, stop);
    page.once("destroyed", stop);
    refreshSpicetifyQueue();
  });
  ipcMain.on(CONTENT_CHANNELS.dequeue, (event, payload: unknown) => {
    const track = dequeueSchema.safeParse(payload);
    if (track.success && isWorkAdventureContent(event.sender)) dequeueOnSpicetify(track.data);
  });
  ipcMain.on(CONTENT_CHANNELS.move, (event, payload: unknown) => {
    const move = moveSchema.safeParse(payload);
    if (move.success && isWorkAdventureContent(event.sender)) moveInSpicetifyQueue(move.data);
  });
  ipcMain.on(CONTENT_CHANNELS.like, (event, payload: unknown) => {
    const like = likeSchema.safeParse(payload);
    if (like.success && isWorkAdventureContent(event.sender)) likeOnSpicetify(like.data.uri);
  });
  ipcMain.on(CONTENT_CHANNELS.unread, (event, payload: unknown) => {
    const unread = unreadSchema.safeParse(payload);
    if (unread.success && isWorkAdventureContent(event.sender)) updateControls(event.sender, { unread: unread.data });
  });
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
