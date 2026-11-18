import type { BrowserWindow, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { Christmas, EnvironmentSetting, GraphicsQuality, Ground, LampMusicSource, Night, Seasonal, SoundSetting, Weather, WeatherFrequency, type EnvironmentState } from "../src/shared/environment-api.js";
import { controlsOf, resetControls, sendCommand, updateControls } from "../src/main/workadventure-controls.js";

const buildMenu = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ Menu: { buildFromTemplate: buildMenu } }));
const { environmentRequestSchema, environmentSchema, showEnvironmentMenu } = await import("../src/main/environment.js");
const state: EnvironmentState = { weather: Weather.Rain, displayWeather: Weather.Rain, night: Night.Server, ground: Ground.Seasonal,
  christmas: Christmas.Auto, isNight: false, effects: true, canEditWeather: false, busy: false, error: "" };

function fixture(): { content: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  return { content: { send } as unknown as WebContents, send };
}

describe("direct environment controls", () => {
  it("validates graphical presets and forwards them only to a compatible live front", () => {
    const { content, send } = fixture();
    const request = { setting: EnvironmentSetting.GraphicsQuality, value: GraphicsQuality.Low } as const;
    expect(environmentRequestSchema.parse(request)).toEqual(request);
    expect(environmentRequestSchema.safeParse({ ...request, value: GraphicsQuality.Custom }).success).toBe(false);
    expect(environmentRequestSchema.safeParse({ setting: EnvironmentSetting.GraphicsMonitoring, value: "true" }).success).toBe(false);
    updateControls(content, { environment: state });
    sendCommand(content, { type: "set-environment", request });
    expect(send).not.toHaveBeenCalled();
    const stats = { fps: 60, worstMs: 18, updateMs: 3, renderMs: 2 };
    const modern = environmentSchema.parse({ ...state, graphicsQuality: GraphicsQuality.High, animations: true, graphicsMonitoring: false, graphicsStats: stats });
    expect(modern?.graphicsStats).toEqual(stats);
    expect(environmentSchema.parse({ ...state, graphicsStats: { ...stats, fps: -1 } })?.graphicsStats).toBeUndefined();
    updateControls(content, { environment: modern });
    sendCommand(content, { type: "set-environment", request });
    sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.Animations, value: false } });
    sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.GraphicsMonitoring, value: true } });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenNthCalledWith(1, "content:command", { type: "set-environment", request });
    updateControls(content, { environment: null });
    sendCommand(content, { type: "set-environment", request });
    expect(send).toHaveBeenCalledTimes(3);
    resetControls(content);
  });
  it("keeps the map detected when a newer front reports unknown sound families", () => {
    const parsed = environmentSchema.parse({ ...state, sounds: { [SoundSetting.Jungle]: 0.15, futureSoundVolume: 0.2 } });
    expect(parsed?.sounds).toEqual({ [SoundSetting.Jungle]: 0.15 });
    expect(environmentSchema.safeParse({ ...state, sounds: { [SoundSetting.Jungle]: 2 } }).success).toBe(false);
  });

  it("validates panel requests before forwarding them to the game", () => {
    for (const request of [
      { setting: EnvironmentSetting.Appearance, value: { palette: "forest", font: "arcade" } },
      { setting: EnvironmentSetting.LampEffects, value: false },
      { setting: EnvironmentSetting.LampMusicSource, value: LampMusicSource.Personal },
      { setting: EnvironmentSetting.Night, value: Night.Disabled },
      { setting: EnvironmentSetting.Sounds, value: { sound: SoundSetting.Doors, volume: 0.35 } },
      { setting: EnvironmentSetting.CloudsHeight, value: 1 },
    ]) expect(environmentRequestSchema.parse(request)).toEqual(request);
    for (const request of [
      { setting: EnvironmentSetting.Appearance, value: { palette: "unknown", font: "system" } },
      { setting: EnvironmentSetting.LampMusicSource, value: "arbitrary-room" },
      { setting: EnvironmentSetting.LampEffects, value: "false" },
      { setting: EnvironmentSetting.Sounds, value: { sound: SoundSetting.Doors, volume: 1.1 } },
      { setting: EnvironmentSetting.CloudsHeight, value: -1 },
      { setting: "unknown", value: true },
    ]) expect(environmentRequestSchema.safeParse(request).success).toBe(false);
  });
  it("accepts the light settings WA describes, drops a malformed list, and forwards only described ones", () => {
    const bounce = { name: "lightBounce", group: "night", label: "Rebond sur les murs : 40 %", kind: "number", value: 0.4, min: 0, max: 1, step: 0.05, dependsOn: "lightBounceOn" };
    expect(environmentSchema.parse({ ...state, lightControls: [bounce] })?.lightControls).toEqual([bounce]);
    expect(environmentSchema.parse({ ...state, lightControls: [{ ...bounce, kind: "slider" }] })?.lightControls).toBeUndefined();
    expect(environmentRequestSchema.safeParse({ setting: EnvironmentSetting.Light, value: { name: "lightBounce", value: 0.6 } }).success).toBe(true);
    expect(environmentRequestSchema.safeParse({ setting: EnvironmentSetting.Light, value: { name: "", value: 0.6 } }).success).toBe(false);
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, lightControls: [{ ...bounce, group: "night", kind: "number" }] } });
    sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.Light, value: { name: "unknown", value: 1 } } });
    expect(send).not.toHaveBeenCalled();
    sendCommand(content, { type: "set-environment", request: { setting: EnvironmentSetting.Light, value: { name: "lightBounce", value: 0.6 } } });
    expect(send).toHaveBeenCalledOnce();
    resetControls(content);
  });

  it("selects the music source and rejects stale unsupported clicks", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, lampEffects: true, lampMusicSource: LampMusicSource.Rooms } });
    buildMenu.mockReturnValue({ popup: vi.fn() });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.LampEffects, { x: 0, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { label: string; checked: boolean; click: () => void }[];
    expect(items.find((item) => item.label?.startsWith("Musique des salons"))?.checked).toBe(true);
    const personal = items.find((item) => item.label?.startsWith("Ma musique"));
    personal?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.LampMusicSource, value: LampMusicSource.Personal } });
    send.mockClear();
    updateControls(content, { environment: state });
    personal?.click();
    expect(send).not.toHaveBeenCalled();
    expect(environmentSchema.safeParse({ ...state, lampMusicSource: "other" }).success).toBe(false);
  });

  it("shows modern weather choices and preserves live automatic settings on a menu click", () => {
    const { content, send } = fixture();
    const auto = { frequency: WeatherFrequency.Normal, include: [Weather.Rain], clouds: true };
    updateControls(content, { environment: { ...state, canEditWeather: true, mapWeather: Weather.Real, weatherAuto: auto } });
    buildMenu.mockReturnValue({ popup: vi.fn() });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.Weather, { x: 0, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { label: string; checked: boolean; click: () => void; submenu?: { label: string; click: () => void }[] }[];
    expect(items.find((item) => item.label?.startsWith("Météo réelle"))?.checked).toBe(true);
    expect(items.some((item) => item.label === "Nuageux")).toBe(true);
    updateControls(content, { environment: { ...state, canEditWeather: true, mapWeather: Weather.Real, weatherAuto: { ...auto, include: [Weather.Fog] } } });
    items.find((item) => item.label === "Fréquence du mode automatique")?.submenu?.find((item) => item.label === "Calme")?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.WeatherAuto, value: { ...auto, frequency: WeatherFrequency.Calm, include: [Weather.Fog] } } });
    send.mockClear();
    updateControls(content, { environment: state });
    items.find((item) => item.label === "Nuageux")?.click();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps cloud visibility personal and validates cloud height", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, clouds: true, cloudsHeight: 0.5 } });
    buildMenu.mockReturnValue({ popup: vi.fn() });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.Clouds, { x: 0, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { checked: boolean; click: () => void }[];
    items[0]?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.Clouds, value: false } });
    expect(environmentSchema.safeParse({ ...state, cloudsHeight: 2 }).success).toBe(false);
  });

  it("keeps new personal settings optional and validates reported volumes", () => {
    expect(environmentSchema.parse({ ...state, lampEffects: false, lampDemo: true, sounds: { [SoundSetting.Weather]: 0.15 } })).toMatchObject({ lampEffects: false, sounds: { [SoundSetting.Weather]: 0.15 } });
    for (const volume of [-1, 1.1, NaN, "0.5"]) {
      expect(environmentSchema.safeParse({ ...state, sounds: { [SoundSetting.Weather]: volume } }).success).toBe(false);
    }
    expect(environmentSchema.safeParse({ ...state, lampEffects: "false" }).success).toBe(false);
  });

  it("toggles music lights and demo from their live state and ignores unsupported fronts", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, lampEffects: true, lampDemo: false } });
    buildMenu.mockReturnValue({ popup: vi.fn() });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.LampEffects, { x: 0, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { label: string; checked: boolean; click: () => void }[];
    expect(items.map(({ label, checked }) => ({ label, checked }))).toEqual([
      { label: "Suivre la musique", checked: true }, { label: "Lampes de démonstration près de mon avatar", checked: false },
    ]);
    items[0]?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.LampEffects, value: false } });
    updateControls(content, { environment: { ...state, lampEffects: false, lampDemo: false } });
    items[0]?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.LampEffects, value: true } });
    items[1]?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.LampDemo, value: true } });
    send.mockClear();
    updateControls(content, { environment: state });
    items[0]?.click();
    items[1]?.click();
    expect(send).not.toHaveBeenCalled();
  });

  it("adjusts only the selected sound and blocks stale unsupported sound menu clicks", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, sounds: { [SoundSetting.Weather]: 0.37, [SoundSetting.Doors]: 0.15 } } });
    buildMenu.mockReturnValue({ popup: vi.fn() });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.Sounds, { x: 0, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { label: string; submenu: { label: string; checked: boolean; click: () => void }[] }[];
    expect(items.map(({ label }) => label)).toEqual(["Météo : 37 %", "Portes : 15 %"]);
    expect(items[0]?.submenu.find(({ checked }) => checked)?.label).toBe("37 %");
    const mute = items[0]?.submenu.find(({ label }) => label === "Muet");
    mute?.click();
    expect(send).toHaveBeenLastCalledWith("content:command", { type: "set-environment", request: { setting: EnvironmentSetting.Sounds, value: { sound: SoundSetting.Weather, volume: 0 } } });
    send.mockClear();
    updateControls(content, { environment: { ...state, sounds: { [SoundSetting.Doors]: 0.15 } } });
    mute?.click();
    updateControls(content, { environment: state });
    mute?.click();
    expect(send).not.toHaveBeenCalled();
  });

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

  it("preserves the new seasonal setting and accepts fronts without the legacy fields", () => {
    const modern = { ...state, seasonal: Seasonal.Autumn, ground: undefined, christmas: undefined };
    expect(environmentSchema.parse(modern)?.seasonal).toBe(Seasonal.Autumn);
    expect(environmentSchema.safeParse({ ...modern, seasonal: "always" }).success).toBe(false);
  });

  it("offers all four current WA themes and applies each directly, without changing shared weather", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, seasonal: Seasonal.Autumn } });
    const popup = vi.fn();
    buildMenu.mockReturnValue({ popup });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.Seasonal, { x: 10, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { label: string; checked: boolean; click: () => void }[];
    expect(items.find((item) => item.checked)?.label).toBe("Automne");
    expect(items.map((item) => item.label)).toEqual(["Automatique (calendrier)", "Automne", "Noël", "Aucun thème"]);
    for (const item of items) item.click();
    expect(send.mock.calls.map((call) => call[1])).toEqual(Object.values(Seasonal).map((value) => ({
      type: "set-environment", request: { setting: EnvironmentSetting.Seasonal, value },
    })));
  });

  it("blocks obsolete ground/Christmas controls on new WA while keeping them on older fronts", () => {
    const { content, send } = fixture();
    const ground = { type: "set-environment", request: { setting: EnvironmentSetting.Ground, value: Ground.Green } } as const;
    const christmas = { type: "set-environment", request: { setting: EnvironmentSetting.Christmas, value: Christmas.Always } } as const;
    const seasonal = { type: "set-environment", request: { setting: EnvironmentSetting.Seasonal, value: Seasonal.Christmas } } as const;
    updateControls(content, { environment: { ...state, seasonal: Seasonal.Auto } });
    sendCommand(content, ground);
    sendCommand(content, christmas);
    expect(send).not.toHaveBeenCalled();
    sendCommand(content, seasonal);
    expect(send).toHaveBeenLastCalledWith("content:command", seasonal);
    send.mockClear();
    updateControls(content, { environment: state });
    sendCommand(content, seasonal);
    expect(send).not.toHaveBeenCalled();
    sendCommand(content, ground);
    sendCommand(content, christmas);
    expect(send.mock.calls.map((call) => call[1])).toEqual([ground, christmas]);
  });

  it("refuses stale seasonal menu clicks after moving to an older front", () => {
    const { content, send } = fixture();
    updateControls(content, { environment: { ...state, seasonal: Seasonal.Auto } });
    buildMenu.mockReturnValue({ popup: vi.fn() });
    showEnvironmentMenu({} as unknown as BrowserWindow, content, EnvironmentSetting.Seasonal, { x: 0, y: 44 });
    const items = buildMenu.mock.lastCall?.[0] as { click: () => void }[];
    updateControls(content, { environment: state });
    items[0]?.click();
    expect(send).not.toHaveBeenCalled();
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
