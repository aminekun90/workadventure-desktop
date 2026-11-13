import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserWindow as ElectronBrowserWindow, type BrowserWindow, type WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";

const WORK_AREA = { x: 0, y: 25, width: 1440, height: 875 };
vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  screen: { getAllDisplays: () => [{ workArea: WORK_AREA }], getDisplayMatching: () => ({ workArea: WORK_AREA }) },
}));

const { closeFloatingWindows, isMiniWindowAuto, loadMiniWindowPreferences, miniWindowOptions, prepareMeetingBar, prepareMiniWindow, setMiniWindowAuto } =
  await import("../src/main/mini-window.js");

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

describe("floating windows after a reload of WorkAdventure", () => {
  function floatingWindow(): { window: BrowserWindow; contents: WebContents; close: ReturnType<typeof vi.fn> } {
    const closedListeners: (() => void)[] = [];
    const close = vi.fn(() => {
      for (const listener of closedListeners) listener();
    });
    const window = {
      setVisibleOnAllWorkspaces: vi.fn(),
      setContentProtection: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      isDestroyed: () => close.mock.calls.length > 0,
      close,
      on: vi.fn(),
      once: (event: string, listener: () => void) => {
        if (event === "closed") closedListeners.push(listener);
      },
    } as unknown as BrowserWindow;
    const contents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      isLoading: () => true,
      once: vi.fn(),
    } as unknown as WebContents;
    return { window, contents, close };
  }

  it("closes the mini window and the meeting bar, frozen once the page that rendered them is gone", () => {
    const mini = floatingWindow();
    const bar = floatingWindow();
    vi.mocked(ElectronBrowserWindow.fromWebContents).mockImplementation((contents) =>
      contents === mini.contents ? mini.window : bar.window,
    );
    prepareMiniWindow(mini.contents);
    prepareMeetingBar(bar.contents);

    closeFloatingWindows();
    closeFloatingWindows();

    expect(mini.close).toHaveBeenCalledTimes(1);
    expect(bar.close).toHaveBeenCalledTimes(1);
  });
});
