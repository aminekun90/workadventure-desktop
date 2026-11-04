import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import type { Listening, StatusRequest } from "../shared/content-api.js";
import { fileURLToPath } from "node:url";
import { SHORTCUTS } from "./system.js";
import type { ControlsState } from "./workadventure-controls.js";

/** Same choices and wording as WorkAdventure's status menu (fr-FR), keyed by its enum names. */
const STATUS_CHOICES: readonly { request: StatusRequest; name: string; label: string }[] = [
  { request: "online", name: "ONLINE", label: "En ligne" },
  { request: "busy", name: "BUSY", label: "Occupé" },
  { request: "do-not-disturb", name: "DO_NOT_DISTURB", label: "Ne pas déranger" },
  { request: "back-in-a-moment", name: "BACK_IN_A_MOMENT", label: "De retour bientôt" },
];

/** "Template" suffix: macOS tints the icon for light and dark menu bars (assets/tray.svg is its source). */
const ICON = fileURLToPath(new URL("../../assets/trayTemplate.png", import.meta.url));

export interface MenuBarState {
  /** Name of the space the user is in, undefined on the launcher. */
  space: string | undefined;
  controls: ControlsState | undefined;
  maps: MenuItemConstructorOptions[];
  openAtLogin: boolean;
}

export interface MenuBarActions {
  toggleMicrophone: () => void;
  toggleCamera: () => void;
  setStatus: (status: StatusRequest) => void;
  /** Opens the shared track, in the Spotify app when it is installed. */
  openTrack: (url: string) => void;
  showWindow: () => void;
  openLauncher: () => void;
  setOpenAtLogin: (openAtLogin: boolean) => void;
  checkForUpdates: () => void;
  showAbout: () => void;
  quit: () => void;
}

/** The icon in the macOS menu bar: microphone, camera and navigation without bringing the window up. */
export function createMenuBarItem(actions: MenuBarActions): { update: (state: MenuBarState) => void } {
  const tray = new Tray(nativeImage.createFromPath(ICON));
  tray.setToolTip("WorkAdventure");
  return {
    update: (state) => {
      const unread = state.controls?.unread ?? 0;
      // The count sits next to the icon, readable without opening the menu.
      tray.setTitle(unread > 0 ? String(unread) : "");
      tray.setContextMenu(Menu.buildFromTemplate(menuTemplate(state, actions)));
    },
  };
}

/** Long titles would stretch the whole menu. */
const MAX_LISTENING_LABEL = 60;

/** What the user shares, whatever its source: the track (a click opens it) and the Jam they joined. */
export function listeningItems(listening: Listening | undefined, actions: Pick<MenuBarActions, "openTrack">): MenuItemConstructorOptions[] {
  if (!listening) return [];
  const items: MenuItemConstructorOptions[] = [];
  if (listening.title) {
    const track = listening.artist ? `${listening.title} — ${listening.artist}` : listening.title;
    const label = `En écoute : ${track}`;
    const { url } = listening;
    items.push({
      label: label.length > MAX_LISTENING_LABEL ? `${label.slice(0, MAX_LISTENING_LABEL - 1)}…` : label,
      enabled: url !== "",
      click: () => actions.openTrack(url),
    });
  }
  if (listening.jamAreaName) items.push({ label: `Dans la Jam : ${listening.jamAreaName}`, enabled: false });
  return items;
}

function menuTemplate({ space, controls, maps, openAtLogin }: MenuBarState, actions: MenuBarActions): MenuItemConstructorOptions[] {
  const ready = controls?.ready ?? false;
  const unread = controls?.unread ?? 0;
  return [
    { label: space ? `Dans l'espace ${space}` : "Pas encore dans un espace", enabled: false },
    { label: `Statut : ${controls?.status?.label ?? ""}`, enabled: false, visible: controls?.status !== undefined },
    ...listeningItems(controls?.listening, actions),
    { type: "separator" },
    {
      label: controls?.media.microphone ? "Couper le micro" : "Activer le micro",
      accelerator: SHORTCUTS.microphone,
      registerAccelerator: false,
      enabled: ready,
      click: actions.toggleMicrophone,
    },
    {
      label: controls?.media.camera ? "Couper la caméra" : "Activer la caméra",
      accelerator: SHORTCUTS.camera,
      registerAccelerator: false,
      enabled: ready,
      click: actions.toggleCamera,
    },
    {
      label: "Statut",
      enabled: controls?.statusReady ?? false,
      submenu: STATUS_CHOICES.map(({ request, name, label }) => ({
        label,
        type: "radio",
        checked: controls?.status?.name === name,
        click: () => actions.setStatus(request),
      })),
    },
    {
      label: unread === 1 ? "1 message non lu" : `${unread} messages non lus`,
      visible: unread > 0,
      click: actions.showWindow,
    },
    { type: "separator" },
    { label: "Changer de map", submenu: maps, enabled: maps.length > 0 },
    { label: "Afficher WorkAdventure", click: actions.showWindow },
    { label: "Revenir au launcher", click: actions.openLauncher },
    { type: "separator" },
    {
      label: "Ouvrir à l'ouverture de session",
      type: "checkbox",
      checked: openAtLogin,
      click: (item) => actions.setOpenAtLogin(item.checked),
    },
    { label: "Rechercher les mises à jour…", click: actions.checkForUpdates },
    { label: "À propos de WorkAdventure", click: actions.showAbout },
    { type: "separator" },
    { label: "Quitter WorkAdventure", click: actions.quit },
  ];
}
