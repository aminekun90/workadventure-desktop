# Pièges Electron rencontrés (et leur parade)

- **Batterie** : ne jamais remettre `backgroundThrottling: false`, `disable-renderer-backgrounding`,
  `disable-backgrounding-occluded-windows` ni `powerSaveBlocker`. Ils faisaient redessiner le jeu à 120 i/s
  fenêtre cachée et empêchaient le Mac de dormir (batterie vidée en 30 min). Pour la connexion, seuls comptent
  `disable-background-timer-throttling` et `--disable-features=IntensiveWakeUpThrottling` (vérifié : fenêtre
  réduite = 0 image/s, timers toujours actifs).
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
- **Document Picture-in-Picture ne marche pas** (Electron 45) : `requestWindow()` résout, mais la fenêtre fait
  0×0 et se ferme en ~36 ms ; le bouton PiP de WA est donc inopérant ici. La mini-fenêtre passe par `window.open`.
- **App réduite ou cachée = WA retire ses vidéos** (`visibilityState: hidden`). `setBackgroundThrottling(false)`
  les garderait mais coûte ~90 % de CPU réduit (contre ~6 %) : interdit. Pendant une conversation, le shim de la
  page fait lire `visible` à WA (`keepVisible`) ; Chromium continue de ralentir la page. Le preload, dans son
  monde isolé, lit toujours le vrai état.
- **Page WA `visible` quand l'app est juste en arrière-plan** : seuls réduire, cacher ou recouvrir entièrement la
  fenêtre la rendent `hidden`.
- **Partage d'écran** : WA passe par `getDisplayMedia` (on n'expose pas `getDesktopCapturerSources`), donc par
  `setDisplayMediaRequestHandler` + sélecteur système macOS, qui ne demande pas l'autorisation « Enregistrement de
  l'écran » à l'app. Le shim de la page enveloppe `getDisplayMedia` pour la barre de réunion ; WA arrête un partage
  par `track.stop()`, qui n'émet pas `ended` : le shim surveille `readyState`. `setContentProtection(true)` exclut
  bien la barre d'une capture macOS (vérifié avec `screencapture` sur sa zone).
- **Niveaux « toujours au premier plan »** (macOS : `floating` < `status` < … < `screen-saver`) : la fenêtre
  d'annotation est `floating`, la barre de réunion et la mini-fenêtre `status`, sinon le stylo prend les clics de
  la barre. Un clic simulé par CDP dans une page ne voit pas ce recouvrement : tester à la vraie souris.
- **`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`** transforme l'app macOS en app accessoire :
  elle **disparaît du Dock et de Cmd+Tab** et clignote à chaque appel (vérifié : `background only` passe à true).
  Toujours passer `skipTransformProcessType: true`.
- **Content protection** : la mini-fenêtre n'est exclue des captures que **pendant un partage** (sinon l'outil de
  capture de macOS ne la voit pas) ; la barre de réunion l'est toujours.
- **Fermer la fenêtre quitte l'app** (et donc la salle), même avec l'icône de barre de menu.
- **Profil dev séparé** (`WorkAdventure-dev`) : depuis les sources, l'app ne touche ni ne verrouille la
  session de l'app installée (verrou d'instance unique par profil).
- **`app.getPath("logs")`** dépend du nom de l'app : `app.setName()` avant tout appel.
- Licence **Pipoya** (wokas WA) : ne pas embarquer les images dans ce dépôt public ; les récupérer sur
  l'instance (`defaultWokaUrl`).
