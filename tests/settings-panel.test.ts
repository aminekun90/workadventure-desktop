import { describe, expect, it } from "vitest";
import { searchText } from "../src/renderer/toolbar/settings-panel.js";

describe("the settings panel", () => {
  it("searches without case nor accents", () => {
    expect(searchText("Éclairage de NUIT")).toBe("eclairage de nuit");
    expect(searchText("Ombres et lumière").includes(searchText("lumiere"))).toBe(true);
  });
});
