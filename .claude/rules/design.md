# Design de l'interface

Identité : « le bureau reste allumé la nuit ». Couleurs reprises de l'interface WorkAdventure, pour que le
client fasse partie du produit. Tous les tokens sont dans `src/renderer/theme.css` : ne pas en inventer
ailleurs.

| Token | Valeur | Usage |
|-|-|-|
| `--night` / `--night-deep` | #141a29 / #0e1320 | fonds |
| `--slate` / `--slate-raised` | #1e2638 / #262f45 | panneaux, survol |
| `--line` | #2f3a55 | bordures, séparateurs |
| `--accent` | #4f5ff0 | action principale (bleu des boutons WA) |
| `--window-light` | #ffd36b | fenêtres allumées, attente, canal beta |
| `--online` / `--alert` | #47d18c / #ec7c62 | en ligne, erreur / hors ligne |

## Règles
- **Police pixel** (Pixelify Sans, OFL, `src/renderer/fonts/`) pour les **titres seulement** ; tout le reste
  en police système.
- Pas de libellés en MAJUSCULES espacées, pas de texte en dégradé, pas de méta-chaînes « A · B · C »,
  pas de monospace pour de petits libellés (réservé à la saisie d'URL).
- **Une seule animation décorative** : la ligne d'immeubles (`skyline.ts`) dont les fenêtres s'allument au
  chargement. Le woka marche sur place. Le reste ne bouge qu'en réponse à une action.
  `prefers-reduced-motion` coupe tout (règle globale dans `theme.css`).
- Boutons : `.button` (secondaire), `.button.primary` (une seule action principale par écran),
  `.button.quiet` (barre, liens). Pas d'autre variante.
- Unités en `rem`, jamais `px` (sauf constantes Electron côté main, ex. `TOOLBAR_HEIGHT`).
- Pas de style inline ; seule exception : variables CSS posées par le code (`--level`, `--sheet`, `--delay`).
- Textes en français, du point de vue de l'utilisateur, verbes d'action (« Entrer », « Ouvrir les logs »).
  Une erreur dit ce qui s'est passé et quoi faire.
- Toute modification visuelle se vérifie sur capture (skill `verify-ui`) avant d'être annoncée finie.
