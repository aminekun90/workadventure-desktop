import { describe, expect, it } from "vitest";
import { DEFAULT_SPACES, MAX_SAVED_SPACES, addSpace, removeSpace, restoreInstances, visibleInstances } from "../src/shared/spaces.js";

const ID = "6f1c3c3e-6a51-4f5e-9d3a-0d6b1c1e2a10";

describe("spaces", () => {
  it("adds a space, named after its host when no name is given", () => {
    const result = addSpace(DEFAULT_SPACES, { label: "", url: "https://wa.example.org/@/team" }, ID);
    expect(result).toEqual({
      ok: true,
      spaces: { saved: [{ id: ID, label: "wa.example.org", url: "https://wa.example.org/@/team" }], hiddenInstances: [] },
    });
  });

  it("refuses the same address twice, and more spaces than the limit", () => {
    const first = addSpace(DEFAULT_SPACES, { label: "Équipe", url: "https://wa.example.org/" }, ID);
    if (!first.ok) throw new Error("expected the first space to be added");
    expect(addSpace(first.spaces, { label: "Autre", url: "https://wa.example.org" }, ID).ok).toBe(false);

    const full = {
      ...DEFAULT_SPACES,
      saved: Array.from({ length: MAX_SAVED_SPACES }, (_, index) => ({ id: ID, label: `${index}`, url: `https://s${index}.example.org/` })),
    };
    expect(addSpace(full, { label: "", url: "https://one-more.example.org/" }, ID).ok).toBe(false);
  });

  it("removes a saved space, hides one of goyan's, and restores them", () => {
    const added = addSpace(DEFAULT_SPACES, { label: "", url: "https://wa.example.org/" }, ID);
    if (!added.ok) throw new Error("expected the space to be added");

    const removed = removeSpace(removeSpace(added.spaces, { kind: "saved", id: ID }), { kind: "instance", id: "prod" });
    expect(removed.saved).toEqual([]);
    expect(visibleInstances(removed)).toEqual(["beta"]);
    expect(visibleInstances(restoreInstances(removed))).toEqual(["prod", "beta"]);
  });
});
