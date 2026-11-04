/**
 * What the WorkAdventure page and the main process exchange, through src/preload/workadventure.cts.
 * Page → main: payload-free signals, plus small state values read by the preload (validated in main).
 * Main → page: a fixed set of commands, run through WorkAdventure's own desktop API (`window.WAD`), and the
 * track the local Spotify app plays, only while the page asks for it (WorkAdventure's Spotify sharing is on).
 */
export const CONTENT_CHANNELS = {
  /** A notification was shown: bounce the Dock icon if the window is in the background. */
  attention: "content:attention",
  /** A notification was clicked: bring the window to the front. */
  focus: "content:focus",
  /** WorkAdventure registered its microphone/camera toggles: commands can be sent. */
  controlsReady: "content:controls-ready",
  /** Requested microphone/camera state, as WorkAdventure stores it. */
  media: "content:media",
  /** Unread chat messages, as shown on WorkAdventure's chat button. */
  unread: "content:unread",
  /** WorkAdventure accepts status requests (window.WAD.onStatusRequest, fork goyan/workadventure#62). */
  statusReady: "content:status-ready",
  /** Effective availability status: WorkAdventure enum name and its localized label. */
  status: "content:status",
  /** Page → main: start (true) or stop (false) reading the Spotify app of this Mac (window.WAD.watchSpotifyTrack). */
  spotifyWatch: "content:spotify-watch",
  /** Main → page: the track Spotify plays, or null. */
  spotifyTrack: "content:spotify-track",
  /** What the user shares about their listening, whatever its source (window.WAD.reportListening). */
  listening: "content:listening",
  /** Page → main: WorkAdventure wants to know whether listening along is possible (window.WAD.onListenAlongAvailable). */
  listenAlongReady: "content:listen-along-ready",
  /** Main → page: whether the WorkAdventure Spicetify extension is connected. */
  listenAlongAvailable: "content:listen-along-available",
  /** Page → main: play this track along with another user, or stop (window.WAD.followListening). */
  follow: "content:follow",
  /** Page → main: the home Jam the user takes part in, or null (window.WAD.setHomeJam). */
  homeJam: "content:home-jam",
  /** Main → page: tracks the user asked, from Spotify, to add to the queue of the home Jam's host. */
  queueRequest: "content:queue-request",
  /** Page → main: tracks another participant adds to this user's queue, as host (window.WAD.enqueueOnSpotify). */
  enqueue: "content:enqueue",
  /** Page → main: start (true) or stop (false) receiving the queue of this Spotify (window.WAD.watchSpotifyQueue). */
  queueWatch: "content:queue-watch",
  /** Main → page: the tracks added to the queue of this Spotify, as host of a Jukebox. */
  spotifyQueue: "content:spotify-queue",
  /** Page → main: a track to remove from the queue of this Spotify (window.WAD.dequeueOnSpotify). */
  dequeue: "content:dequeue",
  /** Main → page. */
  command: "content:command",
} as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[keyof typeof CONTENT_CHANNELS];

/** The statuses that can be requested: the same choices as WorkAdventure's status menu. */
export const STATUS_REQUESTS = ["online", "busy", "do-not-disturb", "back-in-a-moment"] as const;
export type StatusRequest = (typeof STATUS_REQUESTS)[number];

export type ContentCommand = { type: "toggle-microphone" } | { type: "toggle-camera" } | { type: "set-status"; status: StatusRequest };

export interface MediaState {
  microphone: boolean;
  camera: boolean;
}

export interface AvailabilityStatus {
  /** WorkAdventure enum name, e.g. "BUSY" or "JITSI". */
  name: string;
  /** Label in the user's language, e.g. "En réunion". */
  label: string;
}

/**
 * What the user shares about their listening, as WorkAdventure publishes it: read from the Spotify or Music app of
 * this Mac, or from the Web API of a linked Spotify account (phone, web player, speaker). Empty strings when nothing
 * is shared.
 */
export interface Listening {
  title: string;
  artist: string;
  album: string;
  /** https://open.spotify.com/track/…, empty for Apple Music. */
  url: string;
  /** https://i.scdn.co/image/… (Spotify only). */
  artworkUrl: string;
  /** Empty when nothing plays. */
  source: "spotify" | "apple-music" | "";
  /** The listening zone whose Spotify Jam the user joined, empty otherwise. */
  jamAreaName: string;
}

/** What the Spotify or Music app of this Mac plays (see src/main/spotify-player.ts). */
export interface SpotifyTrack {
  title: string;
  artist: string;
  /** https://open.spotify.com/track/…, empty for Apple Music (no public link from the app). */
  url: string;
  album?: string;
  /** https://i.scdn.co/image/… (Spotify only). */
  artworkUrl?: string;
  source: "spotify" | "apple-music";
  /** Position in the track (ms) at `positionAt` (ms since the epoch); only from the Spicetify extension. */
  positionMs?: number;
  positionAt?: number;
  /** The playlist or album it plays from (spotify:playlist:… or spotify:album:…) and its name; Spicetify only. */
  contextUri?: string;
  contextName?: string;
}

/** The home Jam the user takes part in as a guest: the extension offers to add tracks to its host's queue. */
export interface HomeJam {
  hostName: string;
}

/** Tracks (spotify:track:…) a home Jam participant adds to the host's queue. */
export interface EnqueueRequest {
  uris: string[];
  /** Who added them, shown in the host's Spotify. */
  from: string;
}

/** A track added to the queue of this Spotify, as the Jukebox shows it. */
export interface QueuedTrack {
  /** spotify:track:… */
  uri: string;
  /** Identifies this entry of the queue (the same track can be queued twice). */
  uid: string;
  title: string;
  artist: string;
  /** https://i.scdn.co/image/…, or empty. */
  artworkUrl: string;
  /** Who added it from WorkAdventure; empty for the host. */
  addedBy: string;
}

/** A track to play along with another user, at the position they are at. */
export interface FollowTarget {
  /** spotify:track:… */
  uri: string;
  positionMs: number;
}
