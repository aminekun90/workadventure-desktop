import { app, type MenuItemConstructorOptions, type WebContents } from "electron";
import { logger } from "./logger.js";
import { createMenuBarItem } from "./menu-bar.js";
import { isOpenAtLogin, onStepAway, registerGlobalShortcuts, setOpenAtLogin, setUnreadBadge } from "./system.js";
import { controlsOf, muteAll, onControlsChange, sendCommand } from "./workadventure-controls.js";
import { mapMenuFor } from "./workadventure-window.js";

export interface DesktopIntegrationOptions {
  /** The WorkAdventure page currently shown, undefined on the launcher. */
  currentContent: () => WebContents | undefined;
  showWindow: () => void;
  openLauncher: () => void;
  checkForUpdates: () => void;
  showAbout: () => void;
}

export interface DesktopIntegration {
  enteredSpace: (label: string) => void;
  roomLoaded: (content: WebContents) => void;
  leftSpace: () => void;
}

/**
 * Everything that lives outside the windows: menu bar item, global microphone/camera shortcuts,
 * muting when the Mac is locked or asleep, and the unread badge on the Dock icon.
 */
export function startDesktopIntegration(options: DesktopIntegrationOptions): DesktopIntegration {
  let space: string | undefined;
  let maps: MenuItemConstructorOptions[] = [];

  const toggle = (command: "toggle-microphone" | "toggle-camera") => (): void => {
    const content = options.currentContent();
    if (content) sendCommand(content, command);
  };

  const menuBar = createMenuBarItem({
    toggleMicrophone: toggle("toggle-microphone"),
    toggleCamera: toggle("toggle-camera"),
    showWindow: options.showWindow,
    openLauncher: options.openLauncher,
    setOpenAtLogin: (openAtLogin) => {
      setOpenAtLogin(openAtLogin);
      refresh();
    },
    checkForUpdates: options.checkForUpdates,
    showAbout: options.showAbout,
    quit: () => app.quit(),
  });

  const refresh = (): void => {
    const content = options.currentContent();
    const controls = content && controlsOf(content);
    menuBar.update({ space, controls, maps, openAtLogin: isOpenAtLogin() });
    setUnreadBadge(controls?.unread ?? 0);
  };

  registerGlobalShortcuts({ toggleMicrophone: toggle("toggle-microphone"), toggleCamera: toggle("toggle-camera") });
  onStepAway(() => {
    const content = options.currentContent();
    if (!content) return;
    logger.info("Screen locked or Mac asleep: turning microphone and camera off");
    muteAll(content);
  });
  onControlsChange((content) => {
    if (content === options.currentContent()) refresh();
  });
  refresh();

  return {
    enteredSpace: (label) => {
      space = label;
      maps = [];
      refresh();
    },
    roomLoaded: (content) => {
      void mapMenuFor(content).then((items) => {
        maps = items;
        refresh();
      });
    },
    leftSpace: () => {
      space = undefined;
      maps = [];
      refresh();
    },
  };
}
