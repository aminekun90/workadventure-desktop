import { describe, expect, it } from "vitest";
import { choiceLabel, choiceUrl, DEFAULT_SETTINGS, resolveStartup, type Settings } from "../src/shared/config.js";

const noSwitches = { launcher: false };
const skipToBeta: Settings = { choice: { kind: "instance", id: "beta" }, skipLauncher: true };

describe("resolveStartup", () => {
  it("opens the launcher by default", () => {
    expect(resolveStartup(noSwitches, DEFAULT_SETTINGS)).toEqual({ mode: "launcher" });
  });

  it("joins the saved space directly when the launcher is skipped", () => {
    expect(resolveStartup(noSwitches, skipToBeta)).toEqual({ mode: "direct", choice: skipToBeta.choice });
  });

  it("lets --launcher override a skipped launcher", () => {
    expect(resolveStartup({ launcher: true }, skipToBeta)).toEqual({ mode: "launcher" });
  });

  it("joins the instance given by --instance", () => {
    expect(resolveStartup({ ...noSwitches, instance: "beta" }, DEFAULT_SETTINGS)).toEqual({
      mode: "direct",
      choice: { kind: "instance", id: "beta" },
    });
  });

  it("joins the URL given by --url, before --instance", () => {
    expect(resolveStartup({ ...noSwitches, url: " http://localhost:8080/ ", instance: "beta" }, DEFAULT_SETTINGS)).toEqual({
      mode: "direct",
      choice: { kind: "custom", url: "http://localhost:8080/" },
    });
  });

  it("rejects an unknown instance with an actionable message", () => {
    expect(() => resolveStartup({ ...noSwitches, instance: "staging" }, DEFAULT_SETTINGS)).toThrow(
      /Unknown instance: staging.*src\/shared\/config\.ts/,
    );
  });

  it("rejects a non-http URL", () => {
    expect(() => resolveStartup({ ...noSwitches, url: "file:///etc/passwd" }, DEFAULT_SETTINGS)).toThrow(/URL invalide/);
  });
});

describe("choiceUrl", () => {
  it("maps an instance to its URL", () => {
    expect(choiceUrl({ kind: "instance", id: "prod" })).toBe("https://wa.goyan.fr/");
  });

  it("returns a custom URL as is", () => {
    expect(choiceUrl({ kind: "custom", url: "http://localhost/" })).toBe("http://localhost/");
  });
});

describe("choiceLabel", () => {
  it("names an instance", () => {
    expect(choiceLabel({ kind: "instance", id: "beta" })).toBe("Beta");
  });

  it("names a room link of a known instance after that instance", () => {
    expect(choiceLabel({ kind: "custom", url: "https://wa-beta.goyan.fr/~/goyan-garden/office.wam" })).toBe("Beta");
  });

  it("names any other URL as custom", () => {
    expect(choiceLabel({ kind: "custom", url: "http://localhost:8080/" })).toBe("Personnalisé");
  });
});
