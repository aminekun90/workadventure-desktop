import { describe, expect, it } from "vitest";
import { deepLinkTarget } from "../src/main/deep-links.js";
import { createPolicy, isAllowedUrl } from "../src/main/navigation.js";

const policy = createPolicy("https://wa.goyan.fr/");
const isTrusted = (url: string): boolean => isAllowedUrl(url, policy);

describe("deepLinkTarget", () => {
  it("turns a room link into its https URL, keeping position and query", () => {
    expect(deepLinkTarget("workadventure://wa-beta.goyan.fr/~/goyan/office.wam?x=2#desk", isTrusted)).toBe(
      "https://wa-beta.goyan.fr/~/goyan/office.wam?x=2#desk",
    );
  });

  it.each([
    ["an untrusted site", "workadventure://evil.example/~/room.wam"],
    ["another protocol", "https://wa.goyan.fr/~/goyan/office.wam"],
    ["a link without host", "workadventure:office"],
    ["garbage", "not a link"],
  ])("refuses %s", (_label, link) => {
    expect(deepLinkTarget(link, isTrusted)).toBeUndefined();
  });
});
