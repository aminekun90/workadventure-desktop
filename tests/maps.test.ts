import { describe, expect, it } from "vitest";
import { currentMapPath, fetchMaps, listedMaps, mapUrl } from "../src/main/maps.js";

describe("listedMaps", () => {
  const maps = {
    "goyan/office.wam": { metadata: { name: "Modern Office" } },
    "goyan-garden/office.wam": { metadata: { name: "jardin beta" } },
    "goyan-before-x4-20261030/office.wam": { metadata: { name: "Modern Office" } },
    "tmj-goyan-garden-x4/office.wam": { metadata: { name: "goyan-garden" } },
    "carte-test/office.wam": { metadata: { name: "Bureau vierge" } },
    "carte-equipe/office.wam": { metadata: { name: "Bureau vierge" } },
    "sans-nom/office.wam": {},
  };

  it("hides backups and generated conversions, tells same-name maps apart, sorts by label", () => {
    expect(listedMaps({ maps })).toEqual([
      { path: "carte-equipe/office.wam", label: "Bureau vierge · carte-equipe" },
      { path: "carte-test/office.wam", label: "Bureau vierge · carte-test" },
      { path: "goyan-garden/office.wam", label: "jardin beta" },
      { path: "goyan/office.wam", label: "Modern Office" },
      { path: "sans-nom/office.wam", label: "sans-nom/office.wam" },
    ]);
  });
});

describe("mapUrl", () => {
  it("builds the room URL of a map", () => {
    expect(mapUrl("https://wa-beta.goyan.fr", "goyan-garden/office.wam")).toBe("https://wa-beta.goyan.fr/~/goyan-garden/office.wam");
  });
});

describe("currentMapPath", () => {
  it("extracts the map of a room URL, ignoring position and query", () => {
    expect(currentMapPath("https://wa.goyan.fr/~/goyan/office.wam?x=1#desk")).toBe("goyan/office.wam");
  });

  it("is undefined outside a room", () => {
    expect(currentMapPath("https://auth.goyan.fr/if/flow/login/")).toBeUndefined();
  });
});

describe("fetchMaps", () => {
  const respond = (body: unknown, status = 200) => async (): Promise<Response> => Response.json(body, { status });

  it("reads the map-storage listing of the space", async () => {
    const maps = await fetchMaps({ origin: "https://wa.goyan.fr", fetch: respond({ maps: { "goyan/office.wam": {} } }) });
    expect(maps).toEqual([{ path: "goyan/office.wam", label: "goyan/office.wam" }]);
  });

  it("fails on an HTTP error", async () => {
    await expect(fetchMaps({ origin: "https://wa.goyan.fr", fetch: respond({}, 502) })).rejects.toThrow(/HTTP 502/);
  });

  it("fails on an unexpected payload", async () => {
    await expect(fetchMaps({ origin: "https://wa.goyan.fr", fetch: respond({ rooms: [] }) })).rejects.toThrow();
  });
});
