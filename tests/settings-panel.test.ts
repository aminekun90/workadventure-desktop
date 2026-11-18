import { describe, expect, it } from "vitest";
import { lightControlSection, searchText, splitLightLabel } from "../src/renderer/toolbar/settings-panel.js";

describe("light settings in the panel", () => {
  it("keeps a short label and moves the explanation to the tooltip", () => {
    expect(splitLightLabel({ label: "1 · Ambiance des pièces (une pièce où entre de la lumière est éclaircie partout)", kind: "switch" }))
      .toEqual({ label: "Ambiance des pièces", hint: "une pièce où entre de la lumière est éclaircie partout" });
    expect(splitLightLabel({ label: "Éclairage réaliste : les pièces ne s'allument plus toutes seules", kind: "switch" }))
      .toEqual({ label: "Éclairage réaliste", hint: "les pièces ne s'allument plus toutes seules" });
    expect(splitLightLabel({ label: "Même éclairage dans l'éditeur de carte qu'en jeu, pour régler les lampes", kind: "switch" }))
      .toEqual({ label: "Même éclairage dans l'éditeur de carte qu'en jeu", hint: "pour régler les lampes" });
  });

  it("names a detail without its switch and keeps the value of a slider", () => {
    expect(splitLightLabel({ label: "Arbres : Forme de l'ombre", kind: "choice", dependsOn: "trees" }).label).toBe("Forme de l'ombre");
    expect(splitLightLabel({ label: "Obscurité de la nuit : 60 %", kind: "number" })).toEqual({ label: "Obscurité de la nuit : 60 %", hint: "" });
    expect(splitLightLabel({ label: "Bords des lumières adoucis sur 8 px (0 : nets)", kind: "number", dependsOn: "soft" }))
      .toEqual({ label: "Bords des lumières adoucis sur 8 px", hint: "0 : nets" });
  });

  it("separates the atmosphere from render quality without requiring newer WA metadata", () => {
    for (const name of ["nightDarkness", "nightRealistic", "nightKeptInEditor", "moonPhaseCurve"]) expect(lightControlSection(name)).toBe("ambiance");
    for (const name of ["sunShown", "moonShown", "ambienceOn", "ambienceStrength", "lightSoftEdgeOn", "lightBounceOn", "lightSecondBounceOn", "shadowTrees", "perfCounter"]) expect(lightControlSection(name)).toBe("graphics");
  });

  it("searches without case nor accents", () => {
    expect(searchText("Éclairage de NUIT")).toBe("eclairage de nuit");
    expect(searchText("Ombres et lumière").includes(searchText("lumiere"))).toBe(true);
  });
});
