import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

const WORK_AREA = { x: 0, y: 25, width: 1440, height: 875 };
vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  screen: { getAllDisplays: () => [{ workArea: WORK_AREA }], getDisplayMatching: () => ({ workArea: WORK_AREA }) },
}));

const { isMiniWindowAuto, loadMiniWindowPreferences, miniWindowOptions, setMiniWindowAuto } = await import("../src/main/mini-window.js");

const parent = { getBounds: () => WORK_AREA } as unknown as BrowserWindow;

function preferencesFile(content?: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "wa-mini-window-")), "mini-window.json");
  if (content !== undefined) writeFileSync(path, JSON.stringify(content));
  return path;
}

describe("mini window preferences", () => {
  it("opens by itself by default, and ignores an invalid file", () => {
    loadMiniWindowPreferences(preferencesFile({ auto: "yes" }));
    expect(isMiniWindowAuto()).toBe(true);
  });

  it("remembers the user's choice in the profile", () => {
    const path = preferencesFile();
    loadMiniWindowPreferences(path);
    setMiniWindowAuto(false);
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ auto: false });
    loadMiniWindowPreferences(path);
    expect(isMiniWindowAuto()).toBe(false);
  });
});

describe("mini window place", () => {
  it("raises a size saved below the minimum, and keeps the other preferences", () => {
    loadMiniWindowPreferences(preferencesFile({ auto: false, bounds: { x: 40, y: 60, width: 120, height: 90 } }));
    expect(isMiniWindowAuto()).toBe(false);
    expect(miniWindowOptions(parent)).toMatchObject({ x: 40, y: 60, width: 250, height: 90 });
  });

  it("opens in the bottom-right corner of WorkAdventure's screen the first time", () => {
    loadMiniWindowPreferences(preferencesFile());
    expect(miniWindowOptions(parent)).toMatchObject({ x: 1440 - 280 - 16, y: 25 + 875 - 230 - 16, width: 280, height: 230 });
  });

  it("reopens where the user left it, if that place is still on a screen", () => {
    loadMiniWindowPreferences(preferencesFile({ auto: true, bounds: { x: 40, y: 60, width: 400, height: 320 } }));
    expect(miniWindowOptions(parent)).toMatchObject({ x: 40, y: 60, width: 400, height: 320 });
  });

  it("falls back to the corner when the saved place is off every screen (screen unplugged)", () => {
    loadMiniWindowPreferences(preferencesFile({ auto: true, bounds: { x: 2000, y: 60, width: 400, height: 320 } }));
    expect(miniWindowOptions(parent)).toMatchObject({ x: 1144, y: 654 });
  });
});
