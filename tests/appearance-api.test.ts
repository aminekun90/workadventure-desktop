import { describe, expect, it } from "vitest";
import { appearanceSchema } from "../src/shared/appearance-api.js";

describe("appearanceSchema", () => {
  it("accepts the palettes and fonts of WorkAdventure's settings", () => {
    expect(appearanceSchema.parse({ palette: "light", font: "system" })).toEqual({ palette: "light", font: "system" });
  });

  it("rejects a value this version does not know, whatever the page sends", () => {
    expect(appearanceSchema.safeParse({ palette: "neon", font: "system" }).success).toBe(false);
    expect(appearanceSchema.safeParse({ palette: "night", font: "url(evil)" }).success).toBe(false);
    expect(appearanceSchema.safeParse("night").success).toBe(false);
  });
});
