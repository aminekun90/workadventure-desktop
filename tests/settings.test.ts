import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "../src/main/settings.js";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/config.js";

describe("settings", () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "wa-desktop-"));
    filePath = join(directory, "settings.json");
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("falls back to defaults when the file does not exist", () => {
    expect(loadSettings(filePath)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", () => {
    const settings: Settings = { choice: { kind: "custom", url: "http://localhost:8080/" }, skipLauncher: true };
    saveSettings(filePath, settings);
    expect(loadSettings(filePath)).toEqual(settings);
  });

  it.each([
    ["corrupt JSON", "{ not json"],
    ["an unknown instance", JSON.stringify({ choice: { kind: "instance", id: "staging" }, skipLauncher: false })],
  ])("falls back to defaults on %s", (_label, content) => {
    writeFileSync(filePath, content);
    expect(loadSettings(filePath)).toEqual(DEFAULT_SETTINGS);
  });
});
