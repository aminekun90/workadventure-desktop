# WorkAdventure Desktop

Client desktop (Windows, macOS, Linux) pour l'instance WorkAdventure de goyan.fr.

**Pourquoi un client ?** Safari et les navigateurs mettent en veille les onglets en arrière-plan : le
WebSocket vers le pusher décroche, on passe hors ligne et la page ne se reconnecte plus. Ce client
embarque Chromium : la connexion et les timers restent actifs en arrière-plan, mais le rendu du jeu
s'arrête quand la fenêtre est cachée et le Mac peut se mettre en veille (économie de batterie).

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
- **Ambiance dans la barre du haut** : régler directement météo, cycle jour/nuit et thème saisonnier (Auto, Automne, Noël, Aucun) ; la goutte active ou masque les effets météo. Les anciennes instances WA gardent leurs choix séparés Sol et Noël. Les icônes météo et jour/nuit suivent l'état affiché, avec des infobulles. La météo est commune au salon et demande les droits d'édition ; les autres choix restent personnels. Nécessite le pont d'ambiance du front WA ; les réglages sont désactivés si ce pont est absent.
- **Ton woka** s'affiche dans le launcher, capturé à chaque entrée en salle et au retour à l'accueil (woka par
  défaut de WorkAdventure tant qu'aucun n'est capturé, récupéré sur l'instance : les sprites Pipoya ne peuvent pas
  être redistribués dans ce dépôt).
- **Notifications** natives pour les appels de proximité et les messages du chat, activées par défaut (réglage
  « Notifications » de WorkAdventure). L'icône rebondit dans le Dock / la barre des tâches clignote ; un clic sur
  une notification de message ramène la fenêtre et ouvre la conversation.
- **Barre de menu macOS** (icône tasse) : couper/activer micro et caméra, statut (En ligne, Occupé, Ne pas
  déranger, De retour bientôt ; nécessite un front WA avec goyan/workadventure#62), ce que tu écoutes (app Spotify ou
  Musique du Mac, ou compte Spotify lié : téléphone, lecteur web, enceinte ; un clic ouvre le morceau) et la Jam
  rejointe, messages non lus, changer de map,
  afficher la fenêtre, revenir au launcher, ouvrir à l'ouverture de session, mises à jour, À propos.
- **Raccourcis globaux**, même quand l'app n'est pas au premier plan : <kbd>⌘</kbd><kbd>⇧</kbd><kbd>M</kbd>
  micro, <kbd>⌘</kbd><kbd>⇧</kbd><kbd>O</kbd> caméra.
- **Écran verrouillé ou Mac en veille** : micro et caméra coupés automatiquement (jamais rallumés seuls).
- **Mini-fenêtre** : pendant une conversation, passer à une autre fenêtre ou réduire WorkAdventure ouvre une petite fenêtre
  toujours au premier plan, sur tous les bureaux, avec les vidéos et les noms de la bulle, les boutons micro et
  caméra, et « Revenir ». Elle se ferme au retour dans WorkAdventure ou à la fin de la conversation ; fermée à la
  main (✕), elle ne revient qu'après un retour dans WorkAdventure. Couleurs et police suivent le thème choisi dans WA.
  Elle propose aussi le **statut** et un bouton **Spotify** : morceau et Jam, précédent, lecture/pause, suivant,
  position cliquable ; Spotify fermé, la lecture le lance. Elle rouvre là où on l'a laissée. Réglage « Mini-fenêtre
  pendant les conversations » dans le menu de la barre.
- **Barre de réunion** : pendant un partage d'écran, une barre en haut de l'écran garde micro, caméra, retour à
  WorkAdventure et « Arrêter » à portée. Elle et la mini-fenêtre **n'apparaissent pas dans le partage** (macOS et
  Windows ; Linux ne sait pas exclure une fenêtre d'une capture).
- **Annotations** : depuis la barre de réunion, **Stylo** (traits qui restent), **Laser** (trace qui s'efface),
  **Souris** (rend la souris aux autres apps en gardant les dessins) et **Effacer**. Les dessins sont posés dans une
  fenêtre transparente sur l'écran où est la souris, que le partage capture : les autres les voient. Tout s'arrête
  avec le partage.
- **Messages non lus** affichés sur l'icône du Dock et à côté de l'icône de barre de menu.
- **Écouter en même temps** qu'un collègue, sur son propre Spotify et **sans Premium**, avec Spicetify et l'extension
  [workadventure-spicetify](https://github.com/aminekun90/workadventure-spicetify). Si Spotify est installé, le launcher
  propose **une seule fois** de les installer (Installer / Non merci). L'app lui parle en local
  (`ws://127.0.0.1:47613`, app Spotify seulement) ; elle lit aussi par elle le morceau et sa position, sous Windows et
  Linux compris.
- **Liens `workadventure://`** : `workadventure://wa.goyan.fr/~/goyan/office.wam` ouvre cette salle dans l'app.
- **À propos** : fenêtre dédiée (versions de l'app, d'Electron, de Chromium, de Node et du système, statut et
  recherche de mises à jour, notes de version, « Copier les infos » pour un rapport de bug).
- **Mises à jour** : vérifiées au lancement (statut affiché dans le launcher), toutes les 4 h, 5 min après un
  échec (la cause est affichée : réseau, proxy, GitHub…) et via le menu
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
yarn run check        # lint + typecheck + tests (`yarn check` seul lance la vérification du lockfile de yarn)
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
- **Arrière-plan** : switches Chromium en tête de `src/main/main.ts` (timers non bridés, rendu en pause si caché)

## Sécurité

- La page WorkAdventure tourne dans sa propre vue sous la barre (sandbox, `contextIsolation`, aucun accès à Node).
  Son preload (`src/preload/workadventure.cts`) n'expose que deux signaux **sans donnée** (attention, focus) et
  corrige les notifications : Electron n'affiche pas celles d'un service worker, qu'utilise WorkAdventure pour le chat.
- Navigation limitée à `*.goyan.fr` en https ; tout autre lien s'ouvre dans le navigateur par défaut.
- Permissions en liste blanche, accordées uniquement aux domaines de confiance.
- Chaque canal IPC n'accepte que sa page locale (launcher ou barre) et valide chaque payload (zod).
- Seuls les cookies de session de `*.goyan.fr` sont rendus persistants (30 jours), en gardant leur portée d'origine.
- Avatar : URLs lues dans la page puis validées (https, `*.goyan.fr`, PNG, ≤ 256 Ko) ; le jeton WA ne quitte pas la page.
- Fuses Electron (`electronFuses` dans `electron-builder.yml`) : l'app packagée refuse `ELECTRON_RUN_AS_NODE`,
  `NODE_OPTIONS` et `--inspect`, et ne charge son code que depuis `app.asar`. Personne ne peut donc lui faire
  exécuter un autre code avec ses autorisations micro et caméra.

## Plateformes

| OS | Notes |
|-|-|
| macOS | autorisations caméra/micro demandées au premier usage ; partage d'écran via le sélecteur natif (macOS 15+) |
| Windows | installeur NSIS |
| Linux | AppImage et .deb ; sur Ubuntu ≥ 23.10, `run.sh` indique la commande pour activer la sandbox Chromium |

Icône : `build/icon.png`, logo WorkAdventure servi par l'instance (`/static/images/favicons/icon-512x512.png`).
Police des titres : Pixelify Sans, SIL Open Font License (`src/renderer/fonts/OFL.txt`).
Logs de l'app installée : `~/Library/Logs/WorkAdventure/main.log` (macOS), bouton « Ouvrir les logs » dans À propos.

Contribuer avec Claude Code : `.claude/` contient le contexte du projet, ses règles (sécurité, design, Git,
pièges Electron) et deux procédures (`release`, `verify-ui`) ; outils de vérification dans `scripts/dev/`.

Les installeurs ne sont pas encore signés (Gatekeeper / SmartScreen avertiront au premier lancement).
