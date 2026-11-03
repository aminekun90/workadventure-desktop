# Pièges Electron rencontrés (et leur parade)

- **Pas de top-level `await` dans `src/main/main.ts`** : Electron n'émet `ready` qu'une fois l'entrée ESM
  évaluée → `await app.whenReady()` au top-level = interblocage silencieux. Utiliser `.then(start)`.
- **Preload sandboxé = CommonJS isolé** : `import x = require("electron")` seulement, aucun module local.
  Les noms de canaux sont donc recopiés en littéraux, typés par `satisfies XxxChannel`.
- **`window.toolbar` existe déjà** (API `BarProp` du navigateur) : les ponts s'appellent `launcherBridge`,
  `toolbarBridge`, `aboutBridge`.
- **Notifications de service worker** (`registration.showNotification`) ne s'affichent jamais dans
  Electron (la promesse ne se résout pas). WA les utilise pour le chat → shim dans
  `preload/workadventure.cts`. Le fork WA a aussi un repli (PR goyan/workadventure#60).
- **`window.focus()` depuis une `WebContentsView`** ne remonte pas la fenêtre → signal `focusWindow`.
- **`loadURL` rejette `ERR_ABORTED`** quand WA redirige vers l'OpenID avant la fin du chargement : normal.
- **macOS sans Developer ID** : signature ad hoc (`identity: "-"`) + entitlement
  `disable-library-validation`. Squirrel.Mac refuse ces mises à jour → installeur maison `mac-update.ts`.
  Les notifications ne sont autorisées que si l'app tourne depuis un dossier **Applications**.
- **`window.WAD`** est l'API desktop prévue par WA (`play/src/front/Api/Desktop/index.ts`) : WA y enregistre
  ses bascules micro/caméra au montage. On n'expose que les membres que WA appelle ; ne pas exposer
  `getDesktopCapturerSources` sans implémenter tout le sélecteur (WA basculerait sur son propre picker).
  Le statut (`onStatusRequest`, `reportStatus`) n'existe que dans le front du fork avec goyan/workadventure#62 :
  sans lui, l'entrée « Statut » reste grisée.
- **Fermer la fenêtre quitte l'app** (et donc la salle), même avec l'icône de barre de menu.
- **Profil dev séparé** (`WorkAdventure-dev`) : depuis les sources, l'app ne touche ni ne verrouille la
  session de l'app installée (verrou d'instance unique par profil).
- **`app.getPath("logs")`** dépend du nom de l'app : `app.setName()` avant tout appel.
- Licence **Pipoya** (wokas WA) : ne pas embarquer les images dans ce dépôt public ; les récupérer sur
  l'instance (`defaultWokaUrl`).
