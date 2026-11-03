import { app, Menu, type MenuItemConstructorOptions } from "electron";

export interface MenuActions {
  onOpenLauncher: () => void;
  onSignOut: () => void;
  onCheckForUpdates: () => void;
  onShowAbout: () => void;
}

export function buildMenu({ onOpenLauncher, onSignOut, onCheckForUpdates, onShowAbout }: MenuActions): Menu {
  const about: MenuItemConstructorOptions = { label: "À propos de WorkAdventure", click: onShowAbout };
  const sessionItems: MenuItemConstructorOptions[] = [
    { label: "Revenir au launcher", accelerator: "CmdOrCtrl+Shift+L", click: onOpenLauncher },
    { label: "Se déconnecter", click: onSignOut },
    { type: "separator" },
    { label: "Rechercher les mises à jour…", click: onCheckForUpdates },
  ];
  const appMenu: MenuItemConstructorOptions =
    process.platform === "darwin"
      ? {
          label: app.name,
          submenu: [
            about,
            { type: "separator" },
            ...sessionItems,
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }
      : {
          label: "Fichier",
          submenu: [about, { type: "separator" }, ...sessionItems, { type: "separator" }, { role: "quit" }],
        };

  return Menu.buildFromTemplate([appMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]);
}
