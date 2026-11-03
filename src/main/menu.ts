import { app, Menu, type MenuItemConstructorOptions } from "electron";

export interface MenuActions {
  onOpenLauncher: () => void;
  onSignOut: () => void;
}

export function buildMenu({ onOpenLauncher, onSignOut }: MenuActions): Menu {
  const sessionItems: MenuItemConstructorOptions[] = [
    { label: "Revenir au launcher", accelerator: "CmdOrCtrl+Shift+L", click: onOpenLauncher },
    { label: "Se déconnecter", click: onSignOut },
  ];
  const appMenu: MenuItemConstructorOptions =
    process.platform === "darwin"
      ? {
          label: app.name,
          submenu: [
            { role: "about" },
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
      : { label: "Fichier", submenu: [...sessionItems, { type: "separator" }, { role: "quit" }] };

  return Menu.buildFromTemplate([appMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]);
}
