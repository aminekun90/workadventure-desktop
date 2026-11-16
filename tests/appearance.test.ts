import { beforeEach, describe, expect, it, vi } from "vitest";
const stored = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] } }));
vi.mock("../src/main/json-file.js", () => ({ readJsonFile: stored, writeJsonFile: write }));
vi.mock("../src/main/logger.js", () => ({ logger: { info: vi.fn() } }));
const { loadAppearance, getAppearance, setLocalAppearance, pendingAppearance, confirmAppearance } = await import("../src/main/appearance.js");
beforeEach(() => { stored.mockReturnValue(undefined); write.mockReset(); send.mockReset(); loadAppearance("/profile/appearance.json"); });
describe("appearance outside a map", () => {
  it("persists a local choice and keeps it pending until the map applies it", () => {
    const choice = { palette: "forest", font: "system" } as const;
    setLocalAppearance(choice);
    expect(getAppearance()).toEqual(choice);
    expect(write).toHaveBeenCalledWith("/profile/appearance.json", choice);
    expect(send).toHaveBeenCalledWith("appearance:changed", choice);
    confirmAppearance({ palette: "night", font: "pixel" });
    expect(pendingAppearance()).toEqual(choice);
    confirmAppearance(choice);
    expect(pendingAppearance()).toBeUndefined();
  });
  it("restores the choice before any map opens", () => {
    const choice = { palette: "light", font: "classic" } as const;
    stored.mockReturnValue(choice);
    loadAppearance("/profile/appearance.json");
    expect(getAppearance()).toEqual(choice);
    expect(pendingAppearance()).toEqual(choice);
  });
});
