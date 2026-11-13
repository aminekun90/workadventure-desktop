import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));

import { isWindowVisible, type WindowInfo } from "../src/main/window-visibility.js";

const OWN_PID = 100;
const WA = 1;
const wa: WindowInfo = { id: WA, pid: OWN_PID, layer: 0, alpha: 1, x: 0, y: 39, width: 2056, height: 1290 };
const other = (bounds: Partial<WindowInfo>): WindowInfo => ({
  id: 9,
  pid: 200,
  layer: 0,
  alpha: 1,
  x: 0,
  y: 0,
  width: 3000,
  height: 2000,
  ...bounds,
});

describe("isWindowVisible", () => {
  it("is visible in front of everything", () => {
    expect(isWindowVisible([wa, other({})], WA, OWN_PID)).toBe(true);
  });

  it("is hidden behind a window of another app covering it all", () => {
    expect(isWindowVisible([other({}), wa], WA, OWN_PID)).toBe(false);
  });

  it("stays visible when another app covers it only partly, like Teams over the map", () => {
    expect(isWindowVisible([other({ x: 200, y: 60, width: 1650, height: 1030 }), wa], WA, OWN_PID)).toBe(true);
  });

  it("stays visible when only a strip along the far edge shows", () => {
    expect(isWindowVisible([other({ width: 2055, height: 2000 }), wa], WA, OWN_PID)).toBe(true);
  });

  it("is hidden behind several windows that cover it together", () => {
    const left = other({ id: 7, width: 1100 });
    const right = other({ id: 8, x: 1100, width: 2000 });
    expect(isWindowVisible([left, right, wa], WA, OWN_PID)).toBe(false);
  });

  it("is not hidden by this app's own floating windows, the mini window or the annotations", () => {
    expect(isWindowVisible([other({ pid: OWN_PID }), wa], WA, OWN_PID)).toBe(true);
  });

  it("is not hidden by invisible windows or by the menu bar and other layers", () => {
    expect(isWindowVisible([other({ alpha: 0 }), other({ layer: 25 }), wa], WA, OWN_PID)).toBe(true);
  });

  it("is hidden when not on screen: minimized or on another desktop", () => {
    expect(isWindowVisible([other({ width: 10, height: 10 })], WA, OWN_PID)).toBe(false);
  });
});
