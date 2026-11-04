import type { AddressInfo } from "node:net";
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
  client?.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await vi.waitFor(() => expect(bridge.spicetifyConnected()).toBe(false));
});

describe("Spicetify bridge", () => {
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
});
