// Copies the renderer's static files (HTML, CSS) next to their compiled scripts.
import { cpSync } from "node:fs";

cpSync(new URL("../src/renderer", import.meta.url), new URL("../dist/renderer", import.meta.url), {
  recursive: true,
  filter: (source) => !source.endsWith(".ts"),
});
