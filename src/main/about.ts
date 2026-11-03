import { app } from "electron";

const REPOSITORY_URL = "https://github.com/aminekun90/workadventure-desktop";

/** Native "À propos" panel: app and engine versions, so a bug report says exactly what runs. */
export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: "WorkAdventure",
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron}`,
    copyright: `© ${new Date().getFullYear()} Amine Bouzahar`,
    credits: `Client desktop pour WorkAdventure (goyan.fr)\nChromium ${process.versions.chrome} · Node ${process.versions.node}\n${REPOSITORY_URL}`,
    authors: ["Amine Bouzahar"],
    website: REPOSITORY_URL,
  });
}
