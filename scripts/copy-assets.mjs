// Copies the renderer's static files (HTML, CSS) next to their compiled scripts, plus the app icon for the About window.
import { cpSync, readFileSync, writeFileSync } from "node:fs";

cpSync(new URL("../src/renderer", import.meta.url), new URL("../dist/renderer", import.meta.url), {
  recursive: true,
  filter: (source) => !source.endsWith(".ts"),
});
cpSync(new URL("../build/icon.png", import.meta.url), new URL("../dist/renderer/about/icon.png", import.meta.url));

// Both local pages use the same settings form.
const settingsPanel = readFileSync(new URL("../src/renderer/settings-panel.html", import.meta.url), "utf8");
for (const page of ["launcher", "toolbar"]) {
  const target = new URL(`../dist/renderer/${page}/index.html`, import.meta.url);
  writeFileSync(target, readFileSync(target, "utf8").replace("<!-- settings-panel -->", settingsPanel));
}
