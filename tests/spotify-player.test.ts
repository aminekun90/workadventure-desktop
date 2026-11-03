import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));
const { parsePlayerOutput } = await import("../src/main/spotify-player.js");

describe("parsePlayerOutput", () => {
  it("reads a Spotify track with its album and cover, and links to its public page", () => {
    const output =
      "spotify\tSong\tArtist A, Artist B\tAlbum\tspotify:track:4uLU6hMCjMI75M1A2tKUQC\thttps://i.scdn.co/image/ab67616d00001e02\n";

    expect(parsePlayerOutput(output)).toEqual({
      title: "Song",
      artist: "Artist A, Artist B",
      url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      album: "Album",
      artworkUrl: "https://i.scdn.co/image/ab67616d00001e02",
      source: "spotify",
    });
  });

  it("reads an Apple Music track, which has no public link", () => {
    expect(parsePlayerOutput("apple-music\tSong\tArtist\tAlbum\n")).toEqual({
      title: "Song",
      artist: "Artist",
      url: "",
      album: "Album",
      source: "apple-music",
    });
  });

  it("drops a cover that is not on the Spotify image CDN", () => {
    expect(parsePlayerOutput("spotify\tSong\tArtist\t\tspotify:track:abc\thttps://evil.example/x.png")).not.toHaveProperty(
      "artworkUrl",
    );
  });

  it("shares nothing when nothing plays, nor ads, podcasts or local files", () => {
    expect(parsePlayerOutput("")).toBeNull();
    expect(parsePlayerOutput("spotify\tAdvertisement\t\t\tspotify:ad:000000012c6a6b8f00000000\t\n")).toBeNull();
    expect(parsePlayerOutput("spotify\tEpisode\tShow\t\tspotify:episode:512ojhOuo1ktJprKbVcKyQ\t\n")).toBeNull();
    expect(parsePlayerOutput("spotify\tMy file\tMe\t\tspotify:local:Me::My+file:180\t\n")).toBeNull();
  });
});
