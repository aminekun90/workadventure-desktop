# Git et publication

- Conventional Commits en **français** : `feat(scope): …`, `fix(…)`, `refactor(…)`, `chore(release): x.y.z`.
- Commits **structurels séparés des fonctionnels** (déplacement de styles, renommages d'un côté ; logique de
  l'autre). Fusion des PR en **merge commit** (`gh pr merge --merge`) pour garder ce découpage.
- **Jamais de push direct sur `main`** : branche → PR → CI `check` verte → merge.
- Aucune signature d'outil IA (trailer `Co-authored-by`, « Generated with … ») nulle part : commits, PR,
  releases. Identité de commit : l'adresse `noreply` GitHub du dépôt, jamais un e-mail personnel.
- `yarn run check` vert avant tout commit ; lockfile committé avec tout changement de dépendance.

## Versions
- `0.x.y-beta.n` → pre-release (canal beta) ; sans suffixe → release stable.
- Une version installée en beta suit les betas ; une stable ne voit que les stables.
- Publier : skill `release` (bump via PR, tag annoté `vX.Y.Z…`, la CI construit les 3 OS, publie la release
  une fois complète, puis notes de version à écrire).
