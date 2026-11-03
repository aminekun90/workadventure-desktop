import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));
const { parsePlayerOutput } = await import("../src/main/spotify-player.js");

describe("parsePlayerOutput", () => {
  it("reads a track of the Spotify catalog and links to its public page", () => {
    expect(parsePlayerOutput("Song\tArtist A, Artist B\tspotify:track:4uLU6hMCjMI75M1A2tKUQC\n")).toEqual({
      title: "Song",
      artist: "Artist A, Artist B",
      url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });
  });

  it("shares nothing when nothing plays, nor ads, podcasts or local files", () => {
    expect(parsePlayerOutput("")).toBeNull();
    expect(parsePlayerOutput("Advertisement\t\tspotify:ad:000000012c6a6b8f00000000\n")).toBeNull();
    expect(parsePlayerOutput("Episode\tShow\tspotify:episode:512ojhOuo1ktJprKbVcKyQ\n")).toBeNull();
    expect(parsePlayerOutput("My file\tMe\tspotify:local:Me::My+file:180\n")).toBeNull();
  });
});
