---
name: verify-ui
description: Vérifier visuellement et fonctionnellement l'interface (launcher, barre d'outils, À propos, page WA) en pilotant l'app via le protocole DevTools — captures d'écran, état du DOM, clics de menu. À utiliser après toute modification d'interface, avant de la dire terminée.
---

# Vérifier l'interface

1. Lancer depuis les sources (profil dev séparé, ne touche pas l'app installée) :
   `./run.sh --skip-build --launcher --remote-debugging-port=9333 --inspect=9229` (après `yarn build`).
2. **État du DOM** d'une page : `node scripts/dev/cdp-eval.mjs '<expr>' <launcher|toolbar|about|wa-beta>`.
   Les ponts exposés : `launcherBridge`, `toolbarBridge`, `aboutBridge` (ex. entrer dans la beta :
   `window.launcherBridge.launch({choice:{kind:"instance",id:"beta"},skipLauncher:false})`).
3. **Menus et processus principal** : `CDP_PORT=9229 node scripts/dev/cdp-eval.mjs
   'process.mainModule.require("electron").Menu.getApplicationMenu().items[0].submenu.items.find(i => i.label.startsWith("À propos")).click()'`.
4. **Capture** : `node scripts/dev/cdp-shot.mjs launcher /tmp/launcher.png`, réduire avec
   `sips -Z 900 …` avant de la regarder. Barre d'outils seule : clip `44 1440`.
5. Logs : `LOG_LEVEL=debug`, les erreurs du renderer remontent dans les logs du main (`relayConsole`).
6. Toujours arrêter l'instance de test (`pkill -f "MacOS/Electron …/workadventure-desktop"`) ; ne jamais
   relancer l'app **installée** avec des ports de debug sans la relancer normalement ensuite.
