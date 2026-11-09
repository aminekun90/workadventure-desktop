import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { SpotifyPlaybackCommand } from "../src/shared/content-api.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, type WebSocketServer } from "ws";

vi.mock("../src/main/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const bridge = await import("../src/main/spicetify-bridge.js");

const SPOTIFY_ORIGIN = "https://xpui.app.spotify.com";
let server: WebSocketServer | undefined;
let client: WebSocket | undefined;

async function start(): Promise<string> {
  const started = bridge.startSpicetifyBridge(0);
  server = started;
  await new Promise((resolve) => started.once("listening", resolve));
  return `ws://127.0.0.1:${(started.address() as AddressInfo).port}`;
}

function connect(url: string, origin: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextChange(): Promise<void> {
  return new Promise((resolve) => {
    const stop = bridge.onSpicetifyChange(() => {
      stop();
      resolve();
    });
  });
}

afterEach(async () => {
  vi.useRealTimers();
  client?.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(false));
});

describe("Spicetify bridge", () => {
  it("reports real player state while watched, ignores invalid values and clears it on disconnect", async () => {
    client = await connect(await start(), SPOTIFY_ORIGIN);
    const states: unknown[] = [];
    const stop = bridge.onSpicetifyPlayback((state) => { states[states.length] = state; });
    const state = { track: { uri: "spotify:track:abc", title: "Song", artist: "Artist", album: "", artworkUrl: "" },
      playing: false, positionMs: 5000, durationMs: 120000, volume: 0.5, shuffle: true, repeat: 2 };
    client.send(JSON.stringify({ type: "playback-state", state: { ...state, volume: 5 } }));
    client.send(JSON.stringify({ type: "playback-state", state }));
    await vi.waitFor(() => expect(states).toEqual([state]));
    expect(bridge.spicetifyPlayback()).toEqual(state);
    client.close();
    await vi.waitFor(() => expect(states).toEqual([state, null]));
    stop();
    expect(bridge.spicetifyPlayback()).toBeNull();
  });
  it("retries an occupied port after the other desktop client releases it", async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    server = bridge.startSpicetifyBridge(address.port);
    const listening = new Promise<void>((resolve) => server?.once("listening", resolve));
    await new Promise<void>((resolve) => server?.once("error", () => resolve()));
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    await listening;
    client = await connect(`ws://127.0.0.1:${address.port}`, SPOTIFY_ORIGIN);
    await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(true));
  });

  it("sends play, pause and next to the local Spotify extension", async () => {
    client = await connect(await start(), SPOTIFY_ORIGIN);
    const received: unknown[] = [];
    client.on("message", (raw) => { received[received.length] = JSON.parse(raw.toString()); });
    for (const command of [SpotifyPlaybackCommand.Play, SpotifyPlaybackCommand.Pause, SpotifyPlaybackCommand.Next]) {
      bridge.controlSpicetifyPlayback({ command });
    }
    await vi.waitFor(() => expect(received).toEqual([
      { type: "playback", command: SpotifyPlaybackCommand.Play },
      { type: "playback", command: SpotifyPlaybackCommand.Pause },
      { type: "playback", command: SpotifyPlaybackCommand.Next },
    ]));
  });

  it("clears availability when Spotify stops answering heartbeats", async () => {
    vi.useFakeTimers();
    const url = await start();
    client = new WebSocket(url, { origin: SPOTIFY_ORIGIN, autoPong: false });
    await new Promise<void>((resolve) => client?.once("open", resolve));
    const closed = new Promise<void>((resolve) => client?.once("close", () => resolve()));
    await vi.advanceTimersByTimeAsync(30_000);
    await closed;
    vi.useRealTimers();
    expect(bridge.spicetifyConnected()).toBe(false);
  });
  it("validates musical frames, stops on disconnect and unsubscribes", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    const frames: unknown[] = [];
    const stop = bridge.onSpicetifyMusic((frame) => { frames[frames.length] = frame; });
    const frame = { uri: "spotify:track:abc", beatStartMs: 500, intensity: 0.7 };
    client.send(JSON.stringify({ type: "music", frame: { ...frame, intensity: 2 } }));
    client.send(JSON.stringify({ type: "music", frame }));
    await vi.waitFor(() => expect(frames).toEqual([frame]));
    expect(bridge.spicetifyMusic()).toEqual(frame);
    client.close();
    await vi.waitFor(() => expect(frames).toEqual([frame, null]));
    stop();
    expect(bridge.spicetifyMusic()).toBeNull();
  });
  it("only accepts the Spotify app", async () => {
    const url = await start();
    await expect(connect(url, "https://evil.example")).rejects.toThrow();
    expect(bridge.spicetifyConnected()).toBe(false);
  });

  it("reads the playing track with its position, as a Spotify track page", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    const changed = nextChange();
    client.send(
      JSON.stringify({
        type: "state",
        track: { uri: "spotify:track:abc", title: "Song", artist: "Artist", album: "", artworkUrl: "" },
        positionMs: 61_000,
        positionAt: 1_000,
      }),
    );
    await changed;

    expect(bridge.spicetifyTrack()).toEqual({
      title: "Song",
      artist: "Artist",
      url: "https://open.spotify.com/track/abc",
      source: "spotify",
      positionMs: 61_000,
      positionAt: 1_000,
    });
  });

  it("passes the playlist the track plays from, and drops another kind of context", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    const state = (context: unknown) =>
      JSON.stringify({
        type: "state",
        track: { uri: "spotify:track:abc", title: "Song", artist: "Artist", album: "", artworkUrl: "" },
        positionMs: 0,
        positionAt: 1,
        context,
      });

    let changed = nextChange();
    client.send(state({ uri: "spotify:playlist:37i9dQZF1DX8Uebhn9wzrS", name: "Focus" }));
    await changed;
    expect(bridge.spicetifyTrack()).toMatchObject({
      contextUri: "spotify:playlist:37i9dQZF1DX8Uebhn9wzrS",
      contextName: "Focus",
    });

    changed = nextChange();
    client.send(state({ uri: "spotify:artist:abc", name: "Artist radio" }));
    await changed;
    expect(bridge.spicetifyTrack()).toMatchObject({ title: "Song" });
    expect(bridge.spicetifyTrack()).not.toHaveProperty("contextUri");
  });

  it("ignores a state with an unsafe link", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    client.send(
      JSON.stringify({
        type: "state",
        track: { uri: "spotify:track:abc", title: "Song", artist: "", album: "", artworkUrl: "https://evil.example/a.png" },
        positionMs: 0,
        positionAt: 1,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bridge.spicetifyTrack()).toBeNull();
  });

  it("asks the extension to play along, then to stop", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(true));
    const received: unknown[] = [];
    client.on("message", (data) => received.push(JSON.parse(String(data))));

    bridge.followOnSpicetify({ uri: "spotify:track:abc", positionMs: 5_000 });
    bridge.followOnSpicetify(null);

    await vi.waitFor(() =>
      expect(received).toEqual([{ type: "follow", uri: "spotify:track:abc", positionMs: 5_000 }, { type: "unfollow" }]),
    );
  });

  it("tells an extension that connects later about the home Jam, and when it ends", async () => {
    const url = await start();
    bridge.setHomeJamOnSpicetify({ hostName: "Nat" });
    // Listening before the socket opens: the bridge tells the home Jam as soon as the extension connects.
    const received: unknown[] = [];
    const socket = new WebSocket(url, { origin: SPOTIFY_ORIGIN });
    socket.on("message", (data) => received.push(JSON.parse(String(data))));
    client = socket;
    await vi.waitFor(() => expect(received).toEqual([{ type: "home-jam", hostName: "Nat" }]));

    bridge.setHomeJamOnSpicetify(null);
    await vi.waitFor(() => expect(received.at(-1)).toEqual({ type: "home-jam", hostName: null }));
  });

  it("passes on the tracks added from Spotify, and only Spotify tracks", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    const requests: string[][] = [];
    const stop = bridge.onSpicetifyQueueRequest((uris) => requests.push(uris));

    client.send(JSON.stringify({ type: "queue-request", uris: ["spotify:episode:abc"] }));
    client.send(JSON.stringify({ type: "queue-request", uris: ["spotify:track:abc", "spotify:track:def"] }));

    await vi.waitFor(() => expect(requests).toEqual([["spotify:track:abc", "spotify:track:def"]]));
    stop();
  });

  it("asks the connected extension to refresh its context and queue", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(true));
    const received: unknown[] = [];
    client.on("message", (data) => { received[received.length] = JSON.parse(String(data)); });
    bridge.refreshSpicetifyQueue();
    await vi.waitFor(() => expect(received).toEqual([{ type: "refresh-queue" }]));
  });

  it("adds a participant's tracks to the host's queue", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(true));
    const received: unknown[] = [];
    client.on("message", (data) => received.push(JSON.parse(String(data))));

    bridge.enqueueOnSpicetify({ uris: ["spotify:track:abc"], from: "Amine" });

    await vi.waitFor(() => expect(received).toEqual([{ type: "enqueue", uris: ["spotify:track:abc"], from: "Amine" }]));
  });

  it("keeps the queue and the rest of the playlist the extension reports, and empties them when Spotify goes", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    const reported: unknown[] = [];
    const stop = bridge.onSpicetifyQueue((tracks) => reported.push(tracks));
    const queued = {
      uri: "spotify:track:abc",
      uid: "q1",
      title: "Song",
      artist: "Artist",
      addedBy: "Amine",
      addedByUuid: "amine-uuid",
    };

    client.send(
      JSON.stringify({ type: "queue", tracks: [{ ...queued, artworkUrl: "https://evil.example/cover.png" }] }),
    );
    await vi.waitFor(() =>
      expect(bridge.spicetifyQueue()).toEqual({ tracks: [{ ...queued, artworkUrl: "" }], upcoming: [], contextName: "" }),
    );

    const upcoming = { uri: "spotify:track:next", uid: "6b7541", title: "Next", artist: "Artist", artworkUrl: "" };
    client.send(JSON.stringify({ type: "queue", tracks: [], upcoming: [upcoming], contextName: "Focus" }));
    await vi.waitFor(() =>
      expect(bridge.spicetifyQueue()).toEqual({ tracks: [], upcoming: [upcoming], contextName: "Focus" }),
    );

    client.close();
    await vi.waitFor(() => expect(bridge.spicetifyQueue()).toEqual({ tracks: [], upcoming: [], contextName: "" }));
    expect(reported.at(-1)).toEqual({ tracks: [], upcoming: [], contextName: "" });
    stop();
  });

  it("asks the host's extension to remove a track from the queue", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(true));
    const received: unknown[] = [];
    client.on("message", (data) => received.push(JSON.parse(String(data))));

    bridge.dequeueOnSpicetify({ uri: "spotify:track:abc", uid: "q1" });

    await vi.waitFor(() => expect(received).toEqual([{ type: "dequeue", uri: "spotify:track:abc", uid: "q1" }]));
  });

  it("asks the host's extension to move a track, and the local one to like a track", async () => {
    const url = await start();
    client = await connect(url, SPOTIFY_ORIGIN);
    await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(true));
    const received: unknown[] = [];
    client.on("message", (data) => received.push(JSON.parse(String(data))));

    bridge.moveInSpicetifyQueue({ uri: "spotify:track:b", uid: "q2", before: { uri: "spotify:track:a", uid: "q1" } });
    bridge.likeOnSpicetify("spotify:track:b");

    await vi.waitFor(() =>
      expect(received).toEqual([
        { type: "move", uri: "spotify:track:b", uid: "q2", before: { uri: "spotify:track:a", uid: "q1" } },
        { type: "like", uri: "spotify:track:b" },
      ]),
    );
  });
});
