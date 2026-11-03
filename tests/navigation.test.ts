import { describe, expect, it } from "vitest";
import { createPolicy, isAllowedUrl, isSafeExternalUrl, nativeMusicAppUrl } from "../src/main/navigation.js";

describe("isAllowedUrl", () => {
  const policy = createPolicy("https://wa.goyan.fr/");

  it.each(["https://wa.goyan.fr/@/room", "https://auth.goyan.fr/application/o/authorize/", "https://meet.goyan.fr/room", "https://goyan.fr/"])(
    "keeps %s in the app",
    (url) => expect(isAllowedUrl(url, policy)).toBe(true),
  );

  it.each([
    "http://wa.goyan.fr/",
    "https://evilgoyan.fr/",
    "https://goyan.fr.evil.com/",
    "https://github.com/goyan",
    "javascript:alert(1)",
    "not a url",
  ])("sends %s out of the app", (url) => expect(isAllowedUrl(url, policy)).toBe(false));
});

describe("createPolicy", () => {
  it("trusts nothing extra for an instance under the trusted domains", () => {
    expect(createPolicy("https://wa-beta.goyan.fr/").origins).toEqual([]);
  });

  it("trusts the exact origin of a custom dev server, plain http included", () => {
    const policy = createPolicy("http://play.workadventure.localhost/");
    expect(isAllowedUrl("http://play.workadventure.localhost/@/any/room", policy)).toBe(true);
    expect(isAllowedUrl("http://other.localhost/", policy)).toBe(false);
  });
});

describe("isSafeExternalUrl", () => {
  it.each(["https://github.com/", "http://example.com/", "mailto:team@example.com"])("opens %s externally", (url) =>
    expect(isSafeExternalUrl(url)).toBe(true),
  );

  it.each(["file:///etc/passwd", "javascript:alert(1)", "smb://share", "nope"])("refuses %s", (url) =>
    expect(isSafeExternalUrl(url)).toBe(false),
  );
});

describe("nativeMusicAppUrl", () => {
  it("opens Spotify tracks and searches in the Spotify app", () => {
    expect(nativeMusicAppUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe("spotify:track:4uLU6hMCjMI75M1A2tKUQC");
    expect(nativeMusicAppUrl("https://open.spotify.com/search/Song%20Artist")).toBe("spotify:search:Song%20Artist");
  });

  it("opens Apple Music pages in the Music app", () => {
    expect(nativeMusicAppUrl("https://music.apple.com/search?term=Song%20Artist")).toBe(
      "music://music.apple.com/search?term=Song%20Artist",
    );
  });

  it("leaves every other link to the browser", () => {
    expect(nativeMusicAppUrl("https://open.spotify.com/playlist/abc")).toBeUndefined();
    expect(nativeMusicAppUrl("http://open.spotify.com/track/abc")).toBeUndefined();
    expect(nativeMusicAppUrl("https://wa.goyan.fr/")).toBeUndefined();
  });
});

