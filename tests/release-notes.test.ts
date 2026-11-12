import { describe, expect, it } from "vitest";
import { parseInline, parseReleaseNotes } from "../src/renderer/release-notes.js";

describe("release notes", () => {
  it("turns the GitHub notes into titles, paragraphs and lists", () => {
    const notes = [
      "Renforce la sécurité de l'app, sans changement visible.",
      "",
      "## Nouveautés",
      "- Le binaire est **verrouillé** : rien d'autre ne peut l'utiliser.",
      "- La mini-fenêtre",
      "  suit le thème.",
      "",
      "Dans l'app, utilisez **« Rechercher les mises à jour… »**.",
    ].join("\n");
    expect(parseReleaseNotes(notes)).toEqual([
      { kind: "paragraph", inline: [{ text: "Renforce la sécurité de l'app, sans changement visible.", bold: false }] },
      { kind: "title", text: "Nouveautés" },
      {
        kind: "list",
        items: [
          [
            { text: "Le binaire est ", bold: false },
            { text: "verrouillé", bold: true },
            { text: " : rien d'autre ne peut l'utiliser.", bold: false },
          ],
          [{ text: "La mini-fenêtre suit le thème.", bold: false }],
        ],
      },
      {
        kind: "paragraph",
        inline: [
          { text: "Dans l'app, utilisez ", bold: false },
          { text: "« Rechercher les mises à jour… »", bold: true },
          { text: ".", bold: false },
        ],
      },
    ]);
  });

  it("keeps the text of links and code, never the URL", () => {
    expect(parseInline("Voir [la PR](https://evil.example/x) et `yarn run check`")).toEqual([
      { text: "Voir la PR et yarn run check", bold: false },
    ]);
  });

  it("returns nothing for empty notes", () => {
    expect(parseReleaseNotes("")).toEqual([]);
  });
});
