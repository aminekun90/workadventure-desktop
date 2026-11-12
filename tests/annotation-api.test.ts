import { describe, expect, it } from "vitest";
import { annotationCommandSchema } from "../src/shared/annotation-api.js";

describe("annotation commands from the meeting bar", () => {
  it("accepts the tools and the clear and stop actions", () => {
    for (const command of [{ tool: "pen" }, { tool: "laser" }, { tool: "mouse" }, { action: "clear" }, { action: "stop" }]) {
      expect(annotationCommandSchema.safeParse(command).success).toBe(true);
    }
  });

  it("refuses any other tool or action coming from the page", () => {
    for (const command of [{ tool: "spray" }, { action: "close-app" }, "pen", null, {}]) {
      expect(annotationCommandSchema.safeParse(command).success, JSON.stringify(command)).toBe(false);
    }
  });

  it("keeps only the known fields", () => {
    expect(annotationCommandSchema.parse({ tool: "pen", url: "https://evil.example/" })).toEqual({ tool: "pen" });
  });
});
