# WorkAdventure Desktop

Client desktop (Windows, macOS, Linux) pour l'instance WorkAdventure de goyan.fr.

**Pourquoi un client ?** Safari et les navigateurs mettent en veille les onglets en arrière-plan : le
WebSocket vers le pusher décroche, on passe hors ligne et la page ne se reconnecte plus. Ce client
embarque Chromium et **désactive toute mise en veille** (timers, rendu, fenêtres masquées, App Nap).

## Lancer

```bash
./run.sh              # launcher : choix de l'espace, statut en direct, test caméra/micro
./run.sh --beta       # rejoint directement wa-beta.goyan.fr (--prod pour la prod)
./run.sh --url=http://play.workadventure.localhost/   # dev local
./run.sh --help
```

Prérequis : Node ≥ 22.21.1 et yarn. Le script installe les dépendances, compile et lance. Depuis les sources,
l'app utilise son propre profil (`WorkAdventure-dev`) : elle ne touche pas la session de l'app installée.
Sous Windows, passer par Git Bash.

## Dans l'app

- **Barre du haut** : **Accueil** (retour au launcher, <kbd>⌘/Ctrl</kbd> <kbd>⇧</kbd> <kbd>L</kbd>), **Maps** (liste
  live de map-storage, sans les sauvegardes `-before-` ni les conversions `tmj-`), espace et hôte courants, recharger.
- **Session conservée** entre deux lancements ; menu **Se déconnecter** pour tout effacer.
- **Ton woka** s'affiche dans le launcher, capturé à chaque entrée en salle et au retour à l'accueil (woka par
  défaut de WorkAdventure tant qu'aucun n'est capturé, récupéré sur l'instance : les sprites Pipoya ne peuvent pas
  être redistribués dans ce dépôt).
- **Notifications** natives pour les appels de proximité et les messages du chat, activées par défaut (réglage
  « Notifications » de WorkAdventure). L'icône rebondit dans le Dock / la barre des tâches clignote ; un clic sur
  une notification de message ramène la fenêtre et ouvre la conversation.
- **À propos** : versions de l'app, d'Electron, de Chromium et de Node.
- **Mises à jour** : vérifiées au lancement (statut affiché dans le launcher), toutes les 4 h et via le menu
  « Rechercher les mises à jour… ». Téléchargées en fond depuis la release GitHub, puis bouton « Redémarrer
  pour la vX » dans la barre et le launcher. Une version beta suit les betas, une stable les stables.
  - Windows (NSIS) et Linux (AppImage) : electron-updater.
  - macOS : Squirrel.Mac exige un Developer ID, donc `src/main/mac-update.ts` télécharge le zip, vérifie son
    SHA-512, l'extrait à côté de l'app et la remplace au redémarrage. Si l'app n'est pas dans un dossier
    modifiable (lancée depuis le DMG), le bouton propose de télécharger le DMG.

## Publier une version

```bash
npm pkg set version=0.2.0-beta.1   # suffixe -beta.n → pre-release, sans suffixe → release stable
git commit -am "chore(release): 0.2.0-beta.1" && git tag v0.2.0-beta.1 && git push --follow-tags
```

La CI construit les 3 OS, envoie installeurs et manifestes (`latest*.yml`) sur une release brouillon, puis la
publie une fois complète : les apps installées la voient à leur prochaine vérification.

## Développer

```bash
yarn check            # lint + typecheck + tests
yarn package          # installeur pour l'OS courant, dans release/
```

| Dossier | Processus | Rôle |
|-|-|-|
| `src/main/` | main (Node) | fenêtres, navigation, permissions, IPC, maps, session, avatar |
| `src/preload/` | preload | ponts `launcherBridge` / `toolbarBridge`, un par page locale |
| `src/renderer/` | renderer | launcher et barre d'outils (HTML/CSS + modules TS), `theme.css` commun |
| `src/shared/` | les deux | modèle (espaces, choix, réglages) et contrats IPC |

Points d'entrée pour modifier :

- **Ajouter un espace** : `INSTANCES` et `instanceIdSchema` dans `src/shared/config.ts`
- **Domaines de confiance** (navigation in-app, permissions) : `TRUSTED_DOMAINS` dans `src/main/navigation.ts`
- **Permissions accordées** (caméra, partage d'écran…) : `GRANTED_PERMISSIONS` dans `src/main/permissions.ts`
- **Maps masquées** : `HIDDEN_MAP_PATTERNS` dans `src/main/maps.ts`
- **Durée de session conservée** : `PERSISTED_DAYS` dans `src/main/session-persistence.ts`
- **Anti-veille** : switches Chromium dans `src/main/main.ts`, `backgroundThrottling` dans `src/main/workadventure-window.ts`

## Sécurité

- La page WorkAdventure tourne dans sa propre vue sous la barre (sandbox, `contextIsolation`, aucun accès à Node).
  Son preload (`src/preload/workadventure.cts`) n'expose que deux signaux **sans donnée** (attention, focus) et
  corrige les notifications : Electron n'affiche pas celles d'un service worker, qu'utilise WorkAdventure pour le chat.
- Navigation limitée à `*.goyan.fr` en https ; tout autre lien s'ouvre dans le navigateur par défaut.
- Permissions en liste blanche, accordées uniquement aux domaines de confiance.
- Chaque canal IPC n'accepte que sa page locale (launcher ou barre) et valide chaque payload (zod).
- Seuls les cookies de session de `*.goyan.fr` sont rendus persistants (30 jours), en gardant leur portée d'origine.
- Avatar : URLs lues dans la page puis validées (https, `*.goyan.fr`, PNG, ≤ 256 Ko) ; le jeton WA ne quitte pas la page.

## Plateformes

| OS | Notes |
|-|-|
| macOS | autorisations caméra/micro demandées au premier usage ; partage d'écran via le sélecteur natif (macOS 15+) |
| Windows | installeur NSIS |
| Linux | AppImage et .deb ; sur Ubuntu ≥ 23.10, `run.sh` indique la commande pour activer la sandbox Chromium |

Icône : `build/icon.png`, logo WorkAdventure servi par l'instance (`/static/images/favicons/icon-512x512.png`).

Les installeurs ne sont pas encore signés (Gatekeeper / SmartScreen avertiront au premier lancement).
