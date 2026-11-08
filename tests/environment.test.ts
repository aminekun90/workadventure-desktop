import type { BrowserWindow, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { Christmas, EnvironmentSetting, Ground, Night, Weather, type EnvironmentState } from "../src/shared/environment-api.js";
import { controlsOf, resetControls, sendCommand, updateControls } from "../src/main/workadventure-controls.js";

const buildMenu = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ Menu: { buildFromTemplate: buildMenu } }));
const { environmentSchema, showEnvironmentMenu } = await import("../src/main/environment.js");
const state: EnvironmentState = { weather: Weather.Rain, displayWeather: Weather.Rain, night: Night.Server, ground: Ground.Seasonal,
  christmas: Christmas.Auto, isNight: false, effects: true, canEditWeather: false, busy: false, error: "" };

function fixture(): { content: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  return { content: { send } as unknown as WebContents, send };
}

describe("direct environment controls", () => {
  it("validates reported settings and disables them when the room leaves", () => {
    expect(environmentSchema.safeParse(state).success).toBe(true);
    expect(environmentSchema.safeParse(null).success).toBe(true);
    expect(environmentSchema.safeParse({ ...state, night: "evil" }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...state, effects: "true" }).success).toBe(false);
    const { content } = fixture();
    updateControls(content, { environment: state });
    resetControls(content);
    expect(controlsOf(content).environment).toBeNull();
  });

  it("requires the environment bridge and editor rights for shared weather, while personal values remain available", () => {
    const { content, send } = fixture();
    const command = { type: "set-environment", request: { setting: EnvironmentSetting.Weather, value: Weather.Snow } } as const;
    sendCommand(content, command);
    expect(send).not.toHaveBeenCalled();
    updateControls(content, { environment: state });
    sendCommand(content, command);
    expect(send).not.toHaveBeenCalled();
    sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.Christmas, value: Christmas.Always } });
    expect(send).toHaveBeenCalledTimes(1);
    updateControls(content, { environment: { ...state, canEditWeather: true } });
    sendCommand(content, command);
    expect(send).toHaveBeenLastCalledWith("content:command", command);
    updateControls(content, { environment: { ...state, canEditWeather: true, busy: true } });
    sendCommand(content, command);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("selects values directly in a native menu and reads live rights again before sending", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, canEditWeather: true } });
    const popup = vi.fn();
    buildMenu.mockReturnValue({ popup });
    const window = {} as unknown as BrowserWindow;
    showEnvironmentMenu(window, content, EnvironmentSetting.Weather, { x: 10, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { label: string; checked: boolean; click: () => void }[];
    expect(items.find((item) => item.checked)?.label).toBe("Pluie");
    items.find((item) => item.label === "Neige")?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.Weather, value: Weather.Snow } });
    expect(popup).toHaveBeenCalledWith({ window, x: 10, y: 44 });
    updateControls(content, { environment: state });
    items.find((item) => item.label === "Orage")?.click();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
