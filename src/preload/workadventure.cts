// Preload of the remote WorkAdventure page (see src/shared/content-api.ts for what may cross).
// Sandboxed preloads can only require "electron": channel and command names are inlined, checked by type.
import electron = require("electron");
import type { AnnotationTool } from "../shared/annotation-api.js";
import type { EnvironmentRequest } from "../shared/environment-api.js";
import type {
  AvailabilityStatus,
  ContentChannel,
  ContentCommand,
  MediaState,
  MEETING_BAR_NAME,
  MINI_WINDOW_NAME,
  QueueState,
  SpotifyTrack,
  SpotifyMusicFrame,
  SpotifyPlaybackRequest,
  SpotifyPlaybackState,
  StatusRequest,
} from "../shared/content-api.js";

const { contextBridge, ipcRenderer, webFrame } = electron;
const send = (channel: ContentChannel, payload?: unknown): void => ipcRenderer.send(channel, payload);

/** WorkAdventure stores the microphone/camera the user asked for under these keys (LocalUserStore.ts). */
const MEDIA_KEYS = { microphone: "requestedMicrophoneStateKey", camera: "requestedCameraStateKey" } as const;
/** The badge of WorkAdventure's chat button (ChatMenuItem.svelte). */
const UNREAD_BADGE = '[data-testid="unreadMessagesCount"]';
const UNREAD_CHECK_DELAY_MS = 500;

// --- WorkAdventure's desktop API -----------------------------------------------------------------------
// WorkAdventure looks for `window.WAD` at startup (Api/Desktop/index.ts) and registers its own microphone
// and camera toggles: the main process triggers them, so WorkAdventure stays the only one touching media.
// Only the members WorkAdventure actually calls are provided.
const toggles: Partial<Record<"toggle-microphone" | "toggle-camera", () => void>> = {};
let requestStatus: ((request: StatusRequest) => void) | undefined;
let requestEnvironment: ((request: EnvironmentRequest) => void) | undefined;
let onSpotifyMusic: ((frame: SpotifyMusicFrame | null) => void) | undefined;
let onSpotifyTrack: ((track: SpotifyTrack | null) => void) | undefined;
let onListenAlongAvailable: ((available: boolean) => void) | undefined;
let onQueueRequest: ((uris: string[]) => void) | undefined;
let onSpotifyQueue: ((state: QueueState) => void) | undefined;
let onSpotifyPlayback: ((state: SpotifyPlaybackState | null) => void) | undefined;

contextBridge.exposeInMainWorld("WAD", {
  desktop: true,
  watchSpotifyMusic: (callback: (frame: SpotifyMusicFrame | null) => void): (() => void) => {
    onSpotifyMusic = callback;
    send("content:spotify-music-watch", true);
    return () => {
      if (onSpotifyMusic !== callback) return;
      onSpotifyMusic = undefined;
      send("content:spotify-music-watch", false);
    };
  },
  onEnvironmentRequest: (callback: (request: EnvironmentRequest) => void) => {
    requestEnvironment = callback;
  },
  reportEnvironment: (state: unknown) => send("content:environment", state),
  onMuteToggle: (callback: () => void) => {
    toggles["toggle-microphone"] = callback;
    send("content:controls-ready");
  },
  onCameraToggle: (callback: () => void) => {
    toggles["toggle-camera"] = callback;
  },
  // Status members only exist in WorkAdventure builds carrying goyan/workadventure#62.
  onStatusRequest: (callback: (request: StatusRequest) => void) => {
    requestStatus = callback;
    send("content:status-ready");
  },
  // The look chosen in WorkAdventure's settings: the local pages follow it (fork, Api/Desktop/index.ts).
  reportAppearance: (appearance: unknown) => {
    send("content:appearance", appearance);
    rememberAppearance(appearance);
    refreshMiniWindow();
  },
  reportStatus: (name: string, label: string) => {
    const status: AvailabilityStatus = { name, label };
    send("content:status", status);
    currentStatus = status;
    refreshMiniWindow();
  },
  // What the user shares about their listening, whatever its source (fork, Api/Desktop/index.ts). Validated in main.
  reportListening: (listening: unknown) => {
    send("content:listening", listening);
    currentListening = readListening(listening);
    if (currentListening?.title && currentListening.source === "spotify") lastSpotifyTrack = currentListening;
    refreshMiniWindow();
  },
  // Listening along, through the WorkAdventure Spicetify extension (fork, Spotify/ListeningFollower.ts).
  followListening: (target: unknown) => send("content:follow", target),
  onListenAlongAvailable: (callback: (available: boolean) => void) => {
    onListenAlongAvailable = callback;
    send("content:listen-along-ready");
  },
  // Home Jam (fork, Spotify/HomeJam.ts): guests add tracks from Spotify to the host's queue. Validated in main.
  setHomeJam: (jam: unknown) => send("content:home-jam", jam),
  onQueueRequest: (callback: (uris: string[]) => void) => {
    onQueueRequest = callback;
  },
  enqueueOnSpotify: (request: unknown) => send("content:enqueue", request),
  // The Jukebox's queue (fork, Spotify/HomeJam.ts): the host's page shows it and removes tracks from it.
  watchSpotifyQueue: (callback: (state: QueueState) => void) => {
    onSpotifyQueue = callback;
    send("content:queue-watch", true);
    return () => {
      if (onSpotifyQueue !== callback) return;
      onSpotifyQueue = undefined;
      send("content:queue-watch", false);
    };
  },
  controlSpotifyPlayback: (request: SpotifyPlaybackRequest): void => send("content:spotify-playback", request),
  watchSpotifyPlayback: (callback: (state: SpotifyPlaybackState | null) => void): (() => void) => {
    onSpotifyPlayback = callback;
    send("content:spotify-playback-watch", true);
    return () => {
      if (onSpotifyPlayback !== callback) return;
      onSpotifyPlayback = undefined;
      // One subscription per page, shared with the mini window's play/pause button.
      if (!miniWindowWatchesPlayback) send("content:spotify-playback-watch", false);
    };
  },
  refreshSpotifyQueue: () => send("content:queue-refresh"),
  dequeueOnSpotify: (track: unknown) => send("content:dequeue", track),
  moveInSpotifyQueue: (move: unknown) => send("content:move", move),
  // Heart on a card or a Jukebox track: saved to the Liked Songs of this Spotify.
  likeOnSpotify: (track: unknown) => send("content:like", track),
  // Spotify sharing without an account: WorkAdventure calls it while sharing is on (fork, LocalSpotifyPlayer.ts).
  watchSpotifyTrack: (callback: (track: SpotifyTrack | null) => void) => {
    onSpotifyTrack = callback;
    send("content:spotify-watch", true);
    return () => {
      if (onSpotifyTrack !== callback) return;
      onSpotifyTrack = undefined;
      send("content:spotify-watch", false);
    };
  },
});

ipcRenderer.on("content:spotify-music" satisfies ContentChannel, (_event, frame: SpotifyMusicFrame | null) => {
  onSpotifyMusic?.(frame);
});
ipcRenderer.on("content:spotify-playback-state" satisfies ContentChannel, (_event, state: SpotifyPlaybackState | null) => {
  onSpotifyPlayback?.(state);
  playing = state?.playing === true;
  progress = state && state.durationMs > 0 ? { positionMs: state.positionMs, durationMs: state.durationMs, at: Date.now() } : undefined;
  refreshMiniWindow();
});

ipcRenderer.on("content:spotify-track" satisfies ContentChannel, (_event, track: SpotifyTrack | null) => {
  onSpotifyTrack?.(track);
});

ipcRenderer.on("content:spotify-queue" satisfies ContentChannel, (_event, state: QueueState) => {
  onSpotifyQueue?.(state);
});

ipcRenderer.on("content:queue-request" satisfies ContentChannel, (_event, uris: string[]) => {
  onQueueRequest?.(uris);
});

ipcRenderer.on("content:listen-along-available" satisfies ContentChannel, (_event, available: boolean) => {
  onListenAlongAvailable?.(available);
  spotifyConnected = available === true;
  refreshMiniWindow();
});

ipcRenderer.on("content:command" satisfies ContentChannel, (_event, command: ContentCommand) => {
  if (command.type === "set-environment") requestEnvironment?.(command.request);
  else if (command.type === "set-status") requestStatus?.(command.status);
  else toggles[command.type]?.();
});

// --- Signals and state ------------------------------------------------------------------------------------
contextBridge.exposeInMainWorld("workadventureDesktop", {
  requestAttention: () => send("content:attention"),
  focusWindow: () => send("content:focus"),
  mediaChanged: reportMedia,
  // Read by the page shim: while true, WorkAdventure sees its page as shown (see the mini window below).
  keepVisible: () => keepVisible,
  // The page shim reports the user's screen share: the meeting bar shows while it lasts.
  screenShareChanged: (sharing: boolean) => {
    screenSharing = sharing === true;
    syncMeetingBar();
  },
});

function reportMedia(): void {
  send("content:media", readMedia());
}

/** Read here rather than trusted from the page: WorkAdventure defaults both to true when unset. */
function readMedia(): MediaState {
  const read = (key: string): boolean => (localStorage.getItem(key) ?? "true") === "true";
  return { microphone: read(MEDIA_KEYS.microphone), camera: read(MEDIA_KEYS.camera) };
}

function watchUnreadBadge(): void {
  let last = -1;
  let scheduled = false;
  const check = (): void => {
    scheduled = false;
    const count = Number.parseInt(document.querySelector(UNREAD_BADGE)?.textContent ?? "", 10) || 0;
    if (count === last) return;
    last = count;
    send("content:unread", count);
  };
  // The page changes constantly (game canvas, video): batch checks instead of reading on every mutation.
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(check, UNREAD_CHECK_DELAY_MS);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  check();
}

// --- Mini window --------------------------------------------------------------------------------------------
// While the user is in a conversation and WorkAdventure is not shown (minimized, hidden or covered), a floating
// window shows it: the videos of WorkAdventure's tiles (the same streams, muted: the page plays the sound), the
// names, the microphone and camera toggles, and the way back. Main allows this window only (navigation.ts) and
// gives it its options and the app's styles (mini-window.ts).
const MINI_WINDOW = "wa-desktop-mini-window" satisfies typeof MINI_WINDOW_NAME;
/** A participant's tile in WorkAdventure's camera strip (VideoMediaBox.svelte), the user's own included. */
const TILE = ".camera-box";
/** WorkAdventure's picture-in-picture button (PictureInPictureMenuItem.svelte), shown in a remote conversation only. */
const IN_CONVERSATION = '[data-testid="pictureInPictureButton"]';
const CONVERSATION_CHECK_DELAY_MS = 300;
/** Streams and mute states change without DOM mutations: re-read while the mini window shows them. */
const MINI_WINDOW_REFRESH_MS = 1000;

const icon = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  microphone: icon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>'),
  microphoneOff: icon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M3 3l18 18"/>'),
  camera: icon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>'),
  cameraOff: icon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3zM3 3l18 18"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
  music: icon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  previous: icon('<path d="M19 20 9 12l10-8zM5 19V5"/>'),
  play: icon('<path d="m6 4 14 8-14 8z"/>'),
  pause: icon('<path d="M7 4v16M17 4v16"/>'),
  pen: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  laser: icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  mouse: icon('<path d="m4 4 7 17 2.5-7.5L21 11z"/>'),
  clear: icon('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  next: icon('<path d="m5 4 10 8-10 8zM19 5v14"/>'),
};
/** The statuses the user can pick, as in WorkAdventure's status menu (and the menu bar's). */
const STATUS_CHOICES: readonly { request: StatusRequest; name: string; label: string }[] = [
  { request: "online", name: "ONLINE", label: "En ligne" },
  { request: "busy", name: "BUSY", label: "Occupé" },
  { request: "do-not-disturb", name: "DO_NOT_DISTURB", label: "Ne pas déranger" },
  { request: "back-in-a-moment", name: "BACK_IN_A_MOMENT", label: "De retour bientôt" },
];
const MINI_WINDOW_HTML = `
  <header class="mini-header">
    <span class="mini-title">En réunion</span><span class="mini-count"></span>
    <select class="mini-status" aria-label="Statut" hidden></select>
    <button class="mini-close" type="button" aria-label="Fermer la mini-fenêtre">${ICONS.close}</button>
  </header>
  <main class="mini-grid"></main>
  <section class="mini-music" hidden>
    ${ICONS.music}
    <div class="mini-music-text"><span class="mini-music-title"></span><span class="mini-music-detail"></span></div>
    <button class="mini-skip" type="button" data-action="previous" aria-label="Morceau précédent">${ICONS.previous}</button>
    <button class="mini-skip" type="button" data-action="play-pause"></button>
    <button class="mini-skip" type="button" data-action="next" aria-label="Morceau suivant">${ICONS.next}</button>
    <div class="mini-progress" hidden>
      <span class="mini-time"></span>
      <button class="mini-track" type="button" aria-label="Aller à cette position"><span class="mini-track-fill"></span></button>
      <span class="mini-time"></span>
    </div>
  </section>
  <footer class="mini-controls">
    <button class="mini-toggle" type="button" data-action="toggle-microphone"></button>
    <button class="mini-toggle" type="button" data-action="toggle-camera"></button>
    <button class="mini-toggle" type="button" data-action="music" aria-label="Afficher la musique" aria-pressed="false" hidden>${ICONS.music}</button>
    <button class="button primary" type="button" data-action="back">Revenir</button>
  </footer>`;

interface Participant {
  name: string;
  muted: boolean;
  stream: MediaStream | null;
}

/** What the user shares, as WorkAdventure reports it; empty title when nothing is shared. */
interface MiniListening {
  title: string;
  artist: string;
  jamAreaName: string;
  source: string;
}

let keepVisible = false;
/** The user's choice (menu bar), from main: the mini window opens by itself during a conversation. */
let autoOpen = true;
/** From main: the page cannot tell when the user switches to another window, it stays visible and focused. */
let windowFocused = true;
let currentStatus: AvailabilityStatus | undefined;
let currentListening: MiniListening | undefined;
/** The music controls, opened by the music button; kept from one mini window to the next. */
let musicOpen = false;
/** This computer's Spotify plays (Spicetify), while the mini window or WorkAdventure watches the playback. */
let playing = false;
/** Where the track was when Spotify last reported (`at`, ms since the epoch); it moves on while playing. */
let progress: { positionMs: number; durationMs: number; at: number } | undefined;
let miniWindowWatchesPlayback = false;
/** This computer's Spotify app is connected (Spicetify): the controls stay, to resume a stopped track. */
let spotifyConnected = false;
/** This computer has the Spotify app: the music button stays, to start it, even while it is closed. */
let spotifyInstalled = false;
/** The last track this computer's Spotify shared: shown, paused, once WorkAdventure no longer shares anything. */
let lastSpotifyTrack: MiniListening | undefined;
let miniWindow: Window | null = null;
/** Closed by hand: stays closed until the user comes back to WorkAdventure. */
let dismissed = false;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let appearance: { palette: string; font: string } | undefined;

// Registered before the page shim's listener, which hides the real changes from WorkAdventure: the preload sees them.
window.addEventListener(
  "visibilitychange",
  (event) => {
    if (event.isTrusted) syncMiniWindow();
  },
  true,
);

function watchConversation(): void {
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      syncMiniWindow();
    }, CONVERSATION_CHECK_DELAY_MS);
  }).observe(document.body, { childList: true, subtree: true });
}

ipcRenderer.on("content:window-focused" satisfies ContentChannel, (_event, focused: boolean) => {
  windowFocused = focused === true;
  syncMiniWindow();
});

ipcRenderer.on("content:mini-window-auto" satisfies ContentChannel, (_event, auto: boolean) => {
  autoOpen = auto === true;
  syncMiniWindow();
});

function watchConversationPreference(): void {
  ipcRenderer
    .invoke("content:mini-window-auto" satisfies ContentChannel)
    .then((auto: unknown) => {
      autoOpen = auto === true;
      syncMiniWindow();
    })
    .catch(() => undefined);
  ipcRenderer
    .invoke("content:spotify-installed" satisfies ContentChannel)
    .then((installed: unknown) => {
      spotifyInstalled = installed === true;
    })
    .catch(() => undefined);
}

function syncMiniWindow(): void {
  const participants = readParticipants();
  // WorkAdventure shows its picture-in-picture button during a remote conversation only; the user's own tile alone
  // is not enough (a busy user loses it while still talking). Without the mini window, WorkAdventure keeps its own
  // behavior when hidden (videos off, away status).
  const inConversation = (document.querySelector(IN_CONVERSATION) !== null || participants.length > 1) && autoOpen;
  setKeepVisible(inConversation);
  // Another window has the focus, or WorkAdventure is minimized, hidden or covered. The preload's world reads the real
  // visibility: the page shim only changes what WorkAdventure's world reads.
  const away = !windowFocused || document.visibilityState === "hidden";
  if (!away) dismissed = false;
  if (miniWindow?.closed) {
    dismissed = true;
    forgetMiniWindow();
  }
  if (inConversation && away && !dismissed) showMiniWindow(participants);
  else closeMiniWindow();
}

function readParticipants(): Participant[] {
  return [...document.querySelectorAll<HTMLElement>(TILE)].map((tile) => {
    const name = tile.innerText.trim().split("\n")[0]?.trim() ?? "";
    const video = tile.querySelector("video");
    const stream = video?.srcObject instanceof MediaStream ? video.srcObject : null;
    // WorkAdventure labels the muted icon "<name> est en sourdine." (video.user_is_muted).
    const muted = [...tile.querySelectorAll("[aria-label]")].some((element) => element.getAttribute("aria-label")?.startsWith(name));
    return { name, muted, stream };
  });
}

/** WorkAdventure re-reads its visibility: shown while kept visible, the real state afterwards. */
function setKeepVisible(value: boolean): void {
  if (value === keepVisible) return;
  keepVisible = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

function showMiniWindow(participants: Participant[]): void {
  if (!miniWindow) {
    miniWindow = window.open("about:blank", MINI_WINDOW);
    if (!miniWindow) return;
    buildMiniWindow(miniWindow.document);
    refreshTimer = setInterval(syncMiniWindow, MINI_WINDOW_REFRESH_MS);
  }
  renderMiniWindow(miniWindow.document, participants);
}

function closeMiniWindow(): void {
  const closing = miniWindow;
  forgetMiniWindow();
  closing?.close();
}

function forgetMiniWindow(): void {
  watchPlayback(false);
  clearInterval(refreshTimer);
  refreshTimer = undefined;
  miniWindow = null;
}

function buildMiniWindow(doc: Document): void {
  doc.title = "WorkAdventure";
  doc.body.innerHTML = MINI_WINDOW_HTML;
  doc.querySelector(".mini-close")?.addEventListener("click", () => {
    dismissed = true;
    closeMiniWindow();
  });
  doc.querySelector('[data-action="back"]')?.addEventListener("click", () => send("content:focus"));
  for (const type of ["toggle-microphone", "toggle-camera"] as const) {
    doc.querySelector(`[data-action="${type}"]`)?.addEventListener("click", () => toggles[type]?.());
  }
  doc.querySelector('[data-action="music"]')?.addEventListener("click", () => {
    musicOpen = !musicOpen;
    renderListening(doc);
  });
  for (const command of ["previous", "next"] as const) {
    doc.querySelector(`[data-action="${command}"]`)?.addEventListener("click", () => send("content:spotify-playback", { command }));
  }
  const track = doc.querySelector<HTMLElement>(".mini-track");
  track?.addEventListener("click", (event) => {
    if (!progress) return;
    const { left, width } = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - left) / width));
    const value = Math.round(ratio * progress.durationMs);
    send("content:spotify-playback", { command: "seek", value });
    progress = { ...progress, positionMs: value, at: Date.now() };
    renderListening(doc);
  });
  doc.querySelector('[data-action="play-pause"]')?.addEventListener("click", () => {
    // Spotify closed (or its extension not connected yet): main starts it, then plays.
    if (!spotifyConnected) send("content:spotify-start");
    else send("content:spotify-playback", { command: playing ? "pause" : "play" });
  });
  const status = doc.querySelector("select");
  status?.addEventListener("change", () => {
    const choice = STATUS_CHOICES.find(({ request }) => request === status.value);
    if (choice) requestStatus?.(choice.request);
  });
}

/** Status and listening changes show right away, without waiting for the next refresh. */
function refreshMiniWindow(): void {
  if (miniWindow && !miniWindow.closed) renderMiniWindow(miniWindow.document, readParticipants());
}

function renderMiniWindow(doc: Document, participants: Participant[]): void {
  if (appearance) {
    doc.documentElement.dataset["palette"] = appearance.palette;
    doc.documentElement.dataset["font"] = appearance.font;
  }
  const count = doc.querySelector(".mini-count");
  if (count) count.textContent = `${participants.length} personnes`;
  const grid = doc.querySelector(".mini-grid");
  if (!grid) return;
  while (grid.children.length > participants.length) grid.lastElementChild?.remove();
  participants.forEach((participant, index) => {
    renderTile(grid.children[index] ?? grid.appendChild(createTile(doc)), participant);
  });
  const media = readMedia();
  renderToggle(doc, "toggle-microphone", media.microphone, ICONS.microphone, ICONS.microphoneOff, "micro");
  renderToggle(doc, "toggle-camera", media.camera, ICONS.camera, ICONS.cameraOff, "caméra");
  renderStatus(doc);
  renderListening(doc);
}

/** Only with WorkAdventure builds that accept status requests; a status the user cannot pick shows as is. */
function renderStatus(doc: Document): void {
  const select = doc.querySelector("select");
  if (!select) return;
  select.hidden = requestStatus === undefined || currentStatus === undefined;
  if (select.hidden || !currentStatus) return;
  const current = STATUS_CHOICES.find(({ name }) => name === currentStatus?.name);
  const key = `${currentStatus.name}|${currentStatus.label}`;
  if (select.dataset["status"] === key) return;
  select.dataset["status"] = key;
  select.replaceChildren(
    ...(current ? [] : [new Option(currentStatus.label, "", true, true)]),
    ...STATUS_CHOICES.map(({ request, label }) => new Option(label, request, false, request === current?.request)),
  );
  if (!current) select.options[0]?.setAttribute("disabled", "");
}

function renderListening(doc: Document): void {
  const section = doc.querySelector<HTMLElement>(".mini-music");
  const button = doc.querySelector<HTMLElement>('[data-action="music"]');
  if (!section || !button) return;
  const sharing = Boolean(currentListening?.title);
  // Nothing shared: the last track (or Spotify itself), paused, to resume it; Spotify closed, to start it.
  const idle = { ...(lastSpotifyTrack ?? { title: "Spotify" }), jamAreaName: "", source: "spotify" };
  const listening = sharing
    ? currentListening
    : spotifyConnected
      ? { ...idle, artist: "En pause" }
      : spotifyInstalled
        ? { ...idle, artist: "Spotify n'est pas lancé" }
        : undefined;
  button.hidden = !listening?.title;
  button.classList.toggle("is-active", musicOpen);
  button.setAttribute("aria-pressed", String(musicOpen));
  button.setAttribute("aria-label", musicOpen ? "Masquer la musique" : "Afficher la musique");
  section.hidden = !listening?.title || !musicOpen;
  if (!listening?.title) return;
  const title = section.querySelector(".mini-music-title");
  if (title) title.textContent = listening.title;
  const detail = section.querySelector(".mini-music-detail");
  if (detail) detail.textContent = listening.jamAreaName ? `${listening.artist}, Jam ${listening.jamAreaName}` : listening.artist;
  // The controls drive this computer's Spotify app (Spicetify), the only source the app can control.
  const controllable = listening.source === "spotify";
  for (const control of section.querySelectorAll<HTMLElement>(".mini-skip")) {
    // Spotify closed: only the play button, which starts it.
    control.hidden = !controllable || (!spotifyConnected && control.dataset["action"] !== "play-pause");
  }
  watchPlayback(controllable && musicOpen && spotifyConnected);
  renderProgress(section, controllable && spotifyConnected);
  const playPause = section.querySelector('[data-action="play-pause"]');
  if (playPause && playPause.getAttribute("data-state") !== String(playing)) {
    playPause.setAttribute("data-state", String(playing));
    playPause.innerHTML = playing ? ICONS.pause : ICONS.play;
    playPause.setAttribute("aria-label", playing ? "Mettre en pause" : "Lire");
  }
}

/** Elapsed and total time, and the bar (a click seeks); between two reports, the position moves on while playing. */
function renderProgress(section: Element, shown: boolean): void {
  const bar = section.querySelector<HTMLElement>(".mini-progress");
  if (!bar) return;
  bar.hidden = !shown || !progress;
  if (bar.hidden || !progress) return;
  const elapsed = Math.min(progress.durationMs, progress.positionMs + (playing ? Date.now() - progress.at : 0));
  bar.style.setProperty("--progress", String(elapsed / progress.durationMs));
  const [start, end] = bar.querySelectorAll(".mini-time");
  if (start) start.textContent = formatTime(elapsed);
  if (end) end.textContent = formatTime(progress.durationMs);
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The play/pause button needs the playback state: one subscription per page, shared with WorkAdventure's player. */
function watchPlayback(watch: boolean): void {
  if (watch === miniWindowWatchesPlayback) return;
  miniWindowWatchesPlayback = watch;
  if (watch || !onSpotifyPlayback) send("content:spotify-playback-watch", watch);
}

function readListening(value: unknown): MiniListening | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const text = (key: string): string => {
    const field = (value as Record<string, unknown>)[key];
    return typeof field === "string" ? field.slice(0, 200) : "";
  };
  return { title: text("title"), artist: text("artist"), jamAreaName: text("jamAreaName"), source: text("source") };
}

function createTile(doc: Document): HTMLElement {
  const tile = doc.createElement("div");
  tile.className = "mini-tile";
  const video = doc.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  const initial = doc.createElement("div");
  initial.className = "mini-initial";
  const label = doc.createElement("div");
  label.className = "mini-name";
  label.innerHTML = ICONS.microphoneOff;
  label.append(doc.createElement("span"));
  tile.append(video, initial, label);
  return tile;
}

function renderTile(tile: Element, { name, muted, stream }: Participant): void {
  const video = tile.querySelector("video");
  if (video && video.srcObject !== stream) video.srcObject = stream;
  if (video) video.hidden = stream === null;
  const initial = tile.querySelector<HTMLElement>(".mini-initial");
  if (initial) {
    initial.hidden = stream !== null;
    initial.textContent = name.charAt(0).toUpperCase();
  }
  const label = tile.querySelector(".mini-name span");
  if (label) label.textContent = name;
  tile.querySelector(".mini-name svg")?.toggleAttribute("hidden", !muted);
}

function renderToggle(doc: Document, action: string, on: boolean, iconOn: string, iconOff: string, device: string): void {
  const button = doc.querySelector(`[data-action="${action}"]`);
  if (!button) return;
  const state = on ? "on" : "off";
  if (button.getAttribute("data-state") === state) return;
  button.setAttribute("data-state", state);
  button.classList.toggle("is-off", !on);
  button.innerHTML = on ? iconOn : iconOff;
  button.setAttribute("aria-label", on ? `Couper le ${device}` : `Activer le ${device}`);
}

// --- Meeting bar --------------------------------------------------------------------------------------------
// While the user shares their screen, a strip at the top of the screen keeps the meeting at hand: microphone,
// camera, the way back, and stopping the share. Main keeps it, like the mini window, out of the share.
const MEETING_BAR = "wa-desktop-meeting-bar" satisfies typeof MEETING_BAR_NAME;
/** Dispatched on the page's window: the page shim stops the share (DOM events reach both worlds). */
const STOP_SHARE_EVENT = "workadventure-desktop:stop-share";
/** Same values as ANNOTATION_TOOLS (annotation-api.ts): a sandboxed preload cannot import a local module. */
const ANNOTATION_TOOL_NAMES = ["pen", "laser", "mouse"] as const satisfies readonly AnnotationTool[];
const MEETING_BAR_HTML = `
  <div class="bar">
    <span class="bar-live" aria-hidden="true"></span>
    <span class="bar-label">Partage en cours</span>
    <div class="bar-tools" role="group" aria-label="Annoter l'écran partagé">
      <button class="mini-skip" type="button" data-tool="pen" aria-label="Stylo" aria-pressed="false">${ICONS.pen}</button>
      <button class="mini-skip" type="button" data-tool="laser" aria-label="Laser" aria-pressed="false">${ICONS.laser}</button>
      <button class="mini-skip" type="button" data-tool="mouse" aria-label="Souris (garder les dessins)" aria-pressed="false">${ICONS.mouse}</button>
      <button class="mini-skip" type="button" data-action="clear" aria-label="Effacer les dessins">${ICONS.clear}</button>
    </div>
    <button class="mini-toggle" type="button" data-action="toggle-microphone"></button>
    <button class="mini-toggle" type="button" data-action="toggle-camera"></button>
    <button class="button quiet" type="button" data-action="back">WorkAdventure</button>
    <button class="button bar-stop" type="button" data-action="stop-share">Arrêter</button>
  </div>`;

let screenSharing = false;
let meetingBar: Window | null = null;
/** The annotation tool in use, undefined until the user picks one (no overlay until then). */
let annotationTool: AnnotationTool | undefined;

function syncMeetingBar(): void {
  if (screenSharing) showMeetingBar();
  else closeMeetingBar();
}

function showMeetingBar(): void {
  if (!meetingBar || meetingBar.closed) {
    meetingBar = window.open("about:blank", MEETING_BAR);
    if (!meetingBar) return;
    const doc = meetingBar.document;
    doc.title = "WorkAdventure";
    doc.body.classList.add("meeting-bar");
    doc.body.innerHTML = MEETING_BAR_HTML;
    for (const type of ["toggle-microphone", "toggle-camera"] as const) {
      doc.querySelector(`[data-action="${type}"]`)?.addEventListener("click", () => {
        toggles[type]?.();
        // WorkAdventure writes the new state to localStorage right away: show it.
        setTimeout(() => renderMeetingBar(doc), 100);
      });
    }
    doc.querySelector('[data-action="back"]')?.addEventListener("click", () => send("content:focus"));
    doc.querySelector('[data-action="stop-share"]')?.addEventListener("click", () => window.dispatchEvent(new Event(STOP_SHARE_EVENT)));
    for (const button of doc.querySelectorAll<HTMLElement>("[data-tool]")) {
      button.addEventListener("click", () => {
        const tool = ANNOTATION_TOOL_NAMES.find((name) => name === button.dataset["tool"]);
        if (!tool) return;
        annotationTool = tool;
        send("content:annotate", { tool });
        renderMeetingBar(doc);
      });
    }
    doc.querySelector('[data-action="clear"]')?.addEventListener("click", () => send("content:annotate", { action: "clear" }));
  }
  renderMeetingBar(meetingBar.document);
}

function renderMeetingBar(doc: Document): void {
  if (appearance) {
    doc.documentElement.dataset["palette"] = appearance.palette;
    doc.documentElement.dataset["font"] = appearance.font;
  }
  const media = readMedia();
  renderToggle(doc, "toggle-microphone", media.microphone, ICONS.microphone, ICONS.microphoneOff, "micro");
  renderToggle(doc, "toggle-camera", media.camera, ICONS.camera, ICONS.cameraOff, "caméra");
  for (const button of doc.querySelectorAll<HTMLElement>("[data-tool]")) {
    const active = button.dataset["tool"] === annotationTool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

/** The share is over: the bar goes, and the drawings with it. */
function closeMeetingBar(): void {
  const closing = meetingBar;
  meetingBar = null;
  closing?.close();
  if (annotationTool === undefined) return;
  annotationTool = undefined;
  send("content:annotate", { action: "stop" });
}

function rememberAppearance(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  const { palette, font } = value as Record<string, unknown>;
  if (typeof palette === "string" && typeof font === "string") appearance = { palette, font };
}

window.addEventListener("DOMContentLoaded", () => {
  reportMedia();
  watchUnreadBadge();
  watchConversation();
  watchConversationPreference();
});

/**
 * Runs in the page's own world, before WorkAdventure's scripts:
 * - WorkAdventure's notification switch is off by default in browsers; here it is on, unless the user chose.
 * - Every notification asks for attention, and a click brings the window to the front.
 * - Electron never displays service-worker notifications (`showNotification` hangs), which WorkAdventure
 *   uses for chat messages: they become regular notifications, and a click opens the chat on that room
 *   with the same message WorkAdventure's service worker would send.
 * - Writes of the microphone/camera keys are reported, so the menu bar shows the current state.
 * - During a conversation, the page reads as shown even when the app is minimized, hidden or covered: WorkAdventure
 *   would otherwise remove its videos, and the mini window would have nothing to show. Chromium still slows the
 *   hidden page down (no game frames drawn), only what WorkAdventure reads changes. Events dispatched by the
 *   preload (untrusted) go through, so WorkAdventure re-reads the state when it changes.
 */
const PAGE_SHIM = `(() => {
  const desktop = window.workadventureDesktop;
  if (localStorage.getItem("notificationPermission") === null) localStorage.setItem("notificationPermission", "true");

  const NativeNotification = window.Notification;
  window.Notification = class extends NativeNotification {
    constructor(title, options) {
      super(title, options);
      desktop.requestAttention();
      this.addEventListener("click", () => desktop.focusWindow());
    }
  };

  ServiceWorkerRegistration.prototype.showNotification = async function (title, options = {}) {
    const notification = new window.Notification(title, options);
    const chatRoomId = options.data?.chatRoomId;
    if (!chatRoomId) return;
    notification.addEventListener("click", () => {
      new BroadcastChannel("message").postMessage({ type: "openChat", data: { chatRoomId } });
    });
  };

  const mediaKeys = new Set(${JSON.stringify(Object.values(MEDIA_KEYS))});
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (mediaKeys.has(key)) desktop.mediaChanged();
  };

  const visibilityState = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState").get;
  const hidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden").get;
  Object.defineProperty(Document.prototype, "visibilityState", {
    configurable: true,
    get() { return desktop.keepVisible() ? "visible" : visibilityState.call(this); },
  });
  Object.defineProperty(Document.prototype, "hidden", {
    configurable: true,
    get() { return desktop.keepVisible() ? false : hidden.call(this); },
  });
  window.addEventListener("visibilitychange", (event) => {
    if (event.isTrusted && desktop.keepVisible()) event.stopImmediatePropagation();
  }, true);

  const shares = new Set();
  const reportShares = () => desktop.screenShareChanged(shares.size > 0);
  const getDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async (constraints) => {
    const stream = await getDisplayMedia(constraints);
    const track = stream.getVideoTracks()[0];
    if (!track) return stream;
    shares.add(track);
    reportShares();
    // WorkAdventure stops its share with track.stop(), which fires no "ended": check the state instead.
    const check = setInterval(() => {
      if (track.readyState !== "ended") return;
      clearInterval(check);
      shares.delete(track);
      reportShares();
    }, 1000);
    return stream;
  };
  // The meeting bar's stop button: ended as if the user stopped it from the system, so WorkAdventure stops sharing.
  window.addEventListener(${JSON.stringify(STOP_SHARE_EVENT)}, () => {
    for (const track of shares) {
      track.stop();
      track.dispatchEvent(new Event("ended"));
    }
  });
})();`;

void webFrame.executeJavaScript(PAGE_SHIM);
