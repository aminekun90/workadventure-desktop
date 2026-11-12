import type { AboutApi } from "../../shared/about-api.js";
import { parseReleaseNotes, type Inline, type NotesBlock } from "../release-notes.js";
import { byId } from "../dom.js";
import { drawSkyline } from "../skyline.js";
import { mountAppearance } from "../appearance.js";
import { mountUpdateStatus } from "../update-status.js";

declare global {
  interface Window {
    /** Exposed by src/preload/about.cts. */
    aboutBridge: AboutApi;
  }
}

const COPIED_FEEDBACK_MS = 1500;

/** This version's notes, in the window: fetched once, rendered with textContent only (src/shared/release-notes.ts). */
async function showNotes(): Promise<void> {
  const panel = byId("notes", HTMLElement);
  byId("notes-title", HTMLElement).textContent = `Nouveautés de la version ${info.version}`;
  panel.hidden = false;
  byId("notes-close", HTMLButtonElement).focus();
  const content = byId("notes-content", HTMLElement);
  if (content.dataset["loaded"] === "true") return;
  content.textContent = "Chargement des notes…";
  const notes = await api.releaseNotes();
  const blocks = notes ? parseReleaseNotes(notes) : [];
  if (blocks.length === 0) {
    content.textContent = "Notes indisponibles pour l'instant. Elles sont aussi sur GitHub.";
    return;
  }
  content.dataset["loaded"] = "true";
  content.replaceChildren(...blocks.map(renderBlock));
}

function renderBlock(block: NotesBlock): HTMLElement {
  if (block.kind === "title") {
    const title = document.createElement("h3");
    title.textContent = block.text;
    return title;
  }
  if (block.kind === "paragraph") {
    const paragraph = document.createElement("p");
    paragraph.append(...block.inline.map(renderInline));
    return paragraph;
  }
  const list = document.createElement("ul");
  for (const item of block.items) {
    const entry = document.createElement("li");
    entry.append(...item.map(renderInline));
    list.append(entry);
  }
  return list;
}

function renderInline({ text, bold }: Inline): Node {
  if (!bold) return document.createTextNode(text);
  const strong = document.createElement("strong");
  strong.textContent = text;
  return strong;
}

const api = window.aboutBridge;
const info = await api.getInfo();

byId("version", HTMLSpanElement).textContent = info.version;
const channel = byId("channel", HTMLSpanElement);
channel.textContent = info.channel === "beta" ? "Beta" : "Stable";
channel.dataset["channel"] = info.channel;
byId("electron", HTMLElement).textContent = info.electron;
byId("chromium", HTMLElement).textContent = info.chromium;
byId("node", HTMLElement).textContent = info.node;
byId("system", HTMLElement).textContent = `${info.system} (${info.arch})`;
byId("copyright", HTMLElement).textContent = info.copyright;

drawSkyline(byId("skyline", SVGSVGElement));
mountUpdateStatus(api.update);
mountAppearance(api.appearance);
byId("check", HTMLButtonElement).addEventListener("click", () => void api.checkForUpdates());
byId("release-notes", HTMLButtonElement).addEventListener("click", () => void showNotes());
byId("notes-github", HTMLButtonElement).addEventListener("click", () => void api.open("release-notes"));
byId("notes-close", HTMLButtonElement).addEventListener("click", () => (byId("notes", HTMLElement).hidden = true));
if (info.whatsNew) void showNotes();
byId("repository", HTMLButtonElement).addEventListener("click", () => void api.open("repository"));
byId("logs", HTMLButtonElement).addEventListener("click", () => void api.open("logs"));

const copyButton = byId("copy", HTMLButtonElement);
copyButton.addEventListener("click", () => {
  void api.copyDiagnostics().then(() => {
    copyButton.textContent = "Copié ✓";
    copyButton.dataset["done"] = "true";
    setTimeout(() => {
      copyButton.textContent = "Copier les infos";
      copyButton.dataset["done"] = "false";
    }, COPIED_FEEDBACK_MS);
  });
});
