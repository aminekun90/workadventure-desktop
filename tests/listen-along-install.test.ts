import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/main/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const {
  extensionConfigured,
  readListenAlongAnswer,
  saveListenAlongAnswer,
  shouldOfferListenAlong,
  spicetifyCandidates,
  spicetifyTarget,
  spotifyLocations,
  updateListenAlongExtension,
} = await import("../src/main/listen-along-install.js");

const homes: string[] = [];
function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "listen-along-"));
  homes.push(home);
  return home;
}
const mac = (home: string) => ({ platform: "darwin" as const, arch: "arm64", home, appData: undefined, localAppData: undefined });

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("listen along installation", () => {
  it("picks the Spicetify build of this computer, and none where Spicetify publishes none", () => {
    expect(spicetifyTarget({ platform: "darwin", arch: "arm64" })).toBe("darwin-arm64.tar.gz");
    expect(spicetifyTarget({ platform: "darwin", arch: "x64" })).toBe("darwin-amd64.tar.gz");
    expect(spicetifyTarget({ platform: "win32", arch: "x64" })).toBe("windows-x64.zip");
    expect(spicetifyTarget({ platform: "linux", arch: "x64" })).toBe("linux-amd64.tar.gz");
    expect(spicetifyTarget({ platform: "linux", arch: "arm64" })).toBeUndefined();
  });

  it("looks for Spotify and Spicetify where their installers put them", () => {
    const windows = { platform: "win32" as const, arch: "x64", home: "C:\\Users\\amine", appData: "C:\\AppData\\Roaming", localAppData: "C:\\AppData\\Local" };
    expect(spotifyLocations(windows)).toEqual([join("C:\\AppData\\Roaming", "Spotify", "Spotify.exe")]);
    expect(spicetifyCandidates(windows)).toEqual([join("C:\\AppData\\Local", "spicetify", "spicetify.exe")]);
    expect(spicetifyCandidates(mac("/Users/amine"))[0]).toBe(join("/Users/amine", ".spicetify", "spicetify"));
  });

  it("offers it once, and only with Spotify on this computer", () => {
    const appData = fakeHome();
    const answerFile = join(appData, "listen-along.json");
    const windows = { platform: "win32" as const, arch: "x64", home: appData, appData, localAppData: appData };
    expect(shouldOfferListenAlong(windows, readListenAlongAnswer(answerFile))).toBe(false);

    mkdirSync(join(appData, "Spotify"));
    writeFileSync(join(appData, "Spotify", "Spotify.exe"), "");
    expect(shouldOfferListenAlong(windows, readListenAlongAnswer(answerFile))).toBe(true);

    saveListenAlongAnswer(answerFile, "dismissed");
    expect(readListenAlongAnswer(answerFile)).toBe("dismissed");
    expect(shouldOfferListenAlong(windows, readListenAlongAnswer(answerFile))).toBe(false);
  });

  it("is not offered when the extension is already set up in Spicetify", () => {
    const appData = fakeHome();
    const windows = { platform: "win32" as const, arch: "x64", home: appData, appData, localAppData: appData };
    mkdirSync(join(appData, "Spotify"));
    writeFileSync(join(appData, "Spotify", "Spotify.exe"), "");
    mkdirSync(join(appData, "spicetify"));
    const config = join(appData, "spicetify", "config-xpui.ini");

    writeFileSync(config, "[AdditionalOptions]\nextensions            = adblock.js|workadventure.js\n");
    expect(extensionConfigured(windows)).toBe(true);
    expect(shouldOfferListenAlong(windows, undefined)).toBe(false);

    writeFileSync(config, "[AdditionalOptions]\nextensions            = adblock.js\n");
    expect(extensionConfigured(windows)).toBe(false);
    expect(shouldOfferListenAlong(windows, undefined)).toBe(true);
  });

  describe("extension update", () => {
    /** A Mac with Spicetify set up with the extension; `spicetify` records its arguments. */
    function setUp(installed: string) {
      const home = fakeHome();
      mkdirSync(join(home, ".config", "spicetify", "Extensions"), { recursive: true });
      writeFileSync(join(home, ".config", "spicetify", "config-xpui.ini"), "extensions = workadventure.js\n");
      writeFileSync(join(home, ".config", "spicetify", "Extensions", "workadventure.js"), installed);
      mkdirSync(join(home, ".spicetify"));
      const calls = join(home, "calls");
      writeFileSync(join(home, ".spicetify", "spicetify"), `#!/bin/sh\necho "$@" >> "${calls}"\n`);
      chmodSync(join(home, ".spicetify", "spicetify"), 0o755);
      return {
        env: mac(home),
        extension: () => readFileSync(join(home, ".config", "spicetify", "Extensions", "workadventure.js"), "utf8"),
        calls: () => (existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : []),
      };
    }
    const fetchPinned = vi.fn(async () => new Response("// v1.1.0"));

    it("replaces an older extension and restarts a running Spotify to load it", async () => {
      const mac = setUp("// v1.0.0");
      expect(await updateListenAlongExtension(mac.env, fetchPinned, async () => true)).toBe(true);
      expect(mac.extension()).toBe("// v1.1.0");
      expect(mac.calls()).toEqual(["apply"]);
    });

    it("does not open a closed Spotify: the new version loads when it starts", async () => {
      const mac = setUp("// v1.0.0");
      expect(await updateListenAlongExtension(mac.env, fetchPinned, async () => false)).toBe(true);
      expect(mac.calls()).toEqual(["apply --no-restart"]);
    });

    it("leaves an up-to-date extension and Spotify alone", async () => {
      const mac = setUp("// v1.1.0");
      expect(await updateListenAlongExtension(mac.env, fetchPinned, async () => true)).toBe(false);
      expect(mac.calls()).toEqual([]);
    });

    it("installs nothing for someone who did not set up the extension", async () => {
      const fetchNothing = vi.fn(async () => new Response(""));
      expect(await updateListenAlongExtension(mac(fakeHome()), fetchNothing)).toBe(false);
      expect(fetchNothing).not.toHaveBeenCalled();
    });
  });
});
