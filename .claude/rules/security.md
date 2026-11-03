# Sécurité — invariants à ne jamais casser

## Isolation de la page WorkAdventure
- La page WA est **distante** : `sandbox: true`, `contextIsolation: true`, pas de Node.
- Son preload (`src/preload/workadventure.cts`) suit `src/shared/content-api.ts` :
  - page → main : des signaux (`attention`, `focus`, `controls-ready`) et de **petites valeurs lues par le
    preload** (état micro/caméra depuis le `localStorage`, nombre de non-lus depuis le DOM), **validées par
    zod** dans `workadventure-controls.ts` et ignorées si l'expéditeur n'est pas une vue WA connue ;
  - main → page : des **commandes typées et fermées** (`ContentCommand` : bascules micro/caméra, statut parmi
    `STATUS_REQUESTS`), exécutées par les callbacks que WA enregistre lui-même via `window.WAD`. Jamais de
    donnée renvoyée à la page.
- Le code exécuté dans la page (`executeJavaScript`, shim de notifications) ne fait jamais sortir le
  jeton WA (`authToken`) : il reste dans la page.

## IPC
- Chaque canal vérifie l'expéditeur : `assertSender(event, URL_DE_LA_PAGE_LOCALE)` (launcher, barre,
  À propos). Les signaux de la page WA sont ignorés si l'expéditeur n'est pas une vue WA connue.
- Tout payload venant d'un renderer est validé avec **zod** à la frontière (`src/main/ipc.ts`).
- Les liens ouverts depuis une page locale sont une **liste fermée** (`ABOUT_LINKS`), jamais une URL libre.

## Listes blanches (fail-safe)
- Navigation in-app : `*.goyan.fr` en https uniquement (+ origine exacte d'une URL de dev).
  Tout le reste part dans le navigateur par défaut, et seulement en `http(s)`/`mailto`.
- Permissions : `GRANTED_PERMISSIONS`, accordées aux seuls domaines de confiance.
- Maps masquées : liste de **refus** assumée (une map en trop est sans danger, une map cachée à tort non).

## Données distantes
- Avatar : URLs https de `*.goyan.fr`, PNG, ≤ 256 Ko, sinon refus.
- Mise à jour macOS : zip vérifié contre le **SHA-512 du manifeste** avant extraction.
- Cookies rendus persistants : uniquement ceux des domaines de confiance, portée d'origine conservée.
- Liens `workadventure://` : convertis en https et ouverts seulement s'ils visent un domaine de confiance.

## Divers
- Jamais de secret en dur ni committé (dépôt public). `.env*` ignorés.
- Ne jamais laisser l'app installée tourner avec `--remote-debugging-port` / `--inspect` : n'importe
  quel processus local pourrait piloter la session.
