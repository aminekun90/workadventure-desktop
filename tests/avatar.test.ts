import { describe, expect, it } from "vitest";
import { defaultWokaUrl, downloadAvatar } from "../src/main/avatar.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const LAYER = "https://wa-beta.goyan.fr/resources/customisation/character_color/character_color2.png";

const isTrusted = (url: string): boolean => new URL(url).hostname.endsWith("goyan.fr");
const serve =
  (body: Uint8Array<ArrayBuffer>, contentType = "image/png") =>
  async (): Promise<Response> =>
    new Response(body, { headers: { "content-type": contentType } });

describe("downloadAvatar", () => {
  it("turns layer URLs into PNG data URLs, keeping their order", async () => {
    const avatar = await downloadAvatar({ layerUrls: [LAYER, LAYER], isTrusted, fetch: serve(PNG) });
    expect(avatar?.layers).toEqual(Array(2).fill(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`));
  });

  it("is undefined when the user has no custom woka", async () => {
    expect(await downloadAvatar({ layerUrls: [], isTrusted, fetch: serve(PNG) })).toBeUndefined();
  });

  it.each([
    ["a non-https URL", ["http://wa-beta.goyan.fr/a.png"], serve(PNG), /Invalid/i],
    ["an untrusted origin", ["https://evil.example/a.png"], serve(PNG), /untrusted origin/],
    ["a non-PNG response", [LAYER], serve(PNG, "text/html"), /not a PNG/],
    ["an oversized layer", [LAYER], serve(new Uint8Array(300 * 1024)), /too large/],
    ["a payload that is not a URL list", { evil: true }, serve(PNG), /expected array/i],
  ])("rejects %s", async (_label, layerUrls, fetch, error) => {
    await expect(downloadAvatar({ layerUrls, isTrusted, fetch })).rejects.toThrow(error);
  });
});

describe("defaultWokaUrl", () => {
  it("points to WorkAdventure's default woka on the instance, space encoded", () => {
    expect(defaultWokaUrl("https://wa.goyan.fr/")).toBe("https://wa.goyan.fr/resources/characters/pipoya/Male%2001-1.png");
  });
});
