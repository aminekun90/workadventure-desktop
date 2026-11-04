import { describe, expect, it, vi } from "vitest";
import type { Listening } from "../src/shared/content-api.js";

vi.mock("electron", () => ({ app: {}, globalShortcut: {}, Menu: {}, nativeImage: {}, powerMonitor: {}, Tray: vi.fn() }));

const { listeningItems } = await import("../src/main/menu-bar.js");

const listening: Listening = {
  title: "Baby, You're A Ghost",
  artist: "Tami Neilson",
  album: "Kingmaker",
  url: "https://open.spotify.com/track/abc",
  artworkUrl: "",
  source: "spotify",
  jamAreaName: "",
};

describe("menu bar listening", () => {
  it("shows the shared track, and a click opens it", () => {
    const openTrack = vi.fn();
    const [item] = listeningItems(listening, { openTrack });

    expect(item?.label).toBe("En écoute : Baby, You're A Ghost — Tami Neilson");
    expect(item?.enabled).toBe(true);
    item?.click?.({} as never, undefined, {} as never);
    expect(openTrack).toHaveBeenCalledWith("https://open.spotify.com/track/abc");
  });

  it("cannot open a track without a public link (Apple Music)", () => {
    const [item] = listeningItems({ ...listening, url: "", source: "apple-music" }, { openTrack: vi.fn() });

    expect(item?.enabled).toBe(false);
  });

  it("shortens a long title", () => {
    const [item] = listeningItems({ ...listening, title: "x".repeat(100) }, { openTrack: vi.fn() });

    expect(item?.label).toHaveLength(60);
    expect(item?.label?.endsWith("…")).toBe(true);
  });

  it("shows the Jam, even when nothing plays, and nothing when nothing is shared", () => {
    const items = listeningItems({ ...listening, title: "", artist: "", url: "", source: "", jamAreaName: "Lounge" }, { openTrack: vi.fn() });

    expect(items.map((item) => item.label)).toEqual(["Dans la Jam : Lounge"]);
    expect(listeningItems(undefined, { openTrack: vi.fn() })).toEqual([]);
  });
});
