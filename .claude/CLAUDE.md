# WorkAdventure Desktop

Client desktop Electron (Windows, macOS, Linux) de l'instance WorkAdventure de goyan.fr.
Raison d'être : les navigateurs (Safari surtout) mettent en veille les onglets en arrière-plan et le
WebSocket du pusher décroche. Ici Chromium est embarqué : **timers et connexion restent actifs** en arrière-plan,
mais le rendu s'arrête quand la fenêtre est cachée et le Mac peut dormir (voir `electron-gotchas.md`, batterie).

Dépôt public. Les règles détaillées sont dans `.claude/rules/` (chargées automatiquement) ;
les procédures dans `.claude/skills/`.

## Commandes

```bash
./run.sh                 # installe, compile, lance le launcher (profil dev séparé)
./run.sh --beta          # rejoint directement la beta ; --prod, --url=…, --launcher, --skip-build
yarn run check           # lint + typecheck + tests, obligatoire avant tout commit (`yarn check` = commande interne de yarn)
yarn build               # tsc + copie des assets du renderer dans dist/
yarn package             # installeur de l'OS courant dans release/
```

Node ≥ 22.21.1, yarn 1 (lockfile committé). Vitest pour les tests (`tests/`).

## Architecture — un dossier par processus Electron

| Dossier | Rôle |
|-|-|
| `src/main/` | processus principal : fenêtres, navigation, permissions, IPC, maps, session, avatar, mises à jour, logs |
| `src/preload/` | un preload par page, **CommonJS sandboxé** (`.cts`) : ne peut importer que `electron` |
| `src/renderer/` | pages locales : `launcher/`, `toolbar/`, `about/` + `theme.css`, `skyline.ts`, `dom.ts`, `update-status.ts` |
| `src/shared/` | modèle (`config.ts`, zod) et contrats IPC (`*-api.ts`) ; le renderer n'en importe **que des types** |

Fenêtres :
- **Launcher** (`launcher-window.ts`) : choix d'espace, statut en direct, test caméra/micro, woka.
- **WorkAdventure** (`workadventure-window.ts`) : la fenêtre porte la **barre d'outils** locale ; la page WA
  tourne dans une `WebContentsView` en dessous, avec un preload minimal (`preload/workadventure.cts`).
- **À propos** (`about-window.ts`) : versions, mises à jour, logs.
- **Hors fenêtres** (`desktop-integration.ts`) : icône de barre de menu (`menu-bar.ts`), raccourcis globaux,
  coupure micro/caméra au verrouillage, pastille de non-lus, lancement à l'ouverture de session (`system.ts`),
  liens `workadventure://` (`deep-links.ts`). L'état vient de la page WA via `workadventure-controls.ts`.

Points d'entrée pour modifier :
- espaces de goyan : `INSTANCES` + `instanceIdSchema` dans `src/shared/config.ts` ; espaces ajoutés ou masqués
  par l'utilisateur : `src/shared/spaces.ts` (fichier `spaces.json` du profil)
- domaines de confiance : `TRUSTED_DOMAINS` dans `src/main/navigation.ts`
- permissions : `GRANTED_PERMISSIONS` dans `src/main/permissions.ts`
- maps masquées : `HIDDEN_MAP_PATTERNS` dans `src/main/maps.ts`
- arrière-plan : switches Chromium en tête de `src/main/main.ts`

## Vérifier un changement d'interface

Ne jamais déclarer une UI « finie » sans l'avoir vue : skill `verify-ui` (lancement avec ports de debug,
capture CDP, lecture de l'état DOM). Le test unitaire ne prouve pas le rendu.

## Contexte infra

- Instances : `wa.goyan.fr` (prod), `wa-beta.goyan.fr` (beta), login Authentik `auth.goyan.fr`, Jitsi `meet.goyan.fr`.
- Front WA = fork `goyan/workadventure`, branche `infogene` (PR vers `infogene`, merge = beta auto ;
  la prod est décidée par un releaser). Voir `INFOGENE.md` du fork avant toute PR dessus.
- Infra (compose, cartes) : dépôt privé `goyan/workadventure-selfhost`.
