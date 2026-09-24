# packages/ui — Design system partagé

Implémente la charte graphique de la section 12 du prompt d'origine
(`hotel-chicago-prompt-claude-code.md`), pour l'instant en version **web
uniquement** (React) — voir « Non fait » ci-dessous.

## Fait

- **Jetons** (`tokens.css`) : couleurs clair/sombre (section 12.1/12.2),
  espacements et rayons (section 12.4). Thème sombre activé via
  `data-theme="dark"` sur un ancêtre (généralement `<html>`).
- **Typographie** (`typography.css`, section 12.3) : classes `.hc-text-*`
  pour toute l'échelle de texte (Fraunces pour les titres pleine page,
  Public Sans pour le reste, IBM Plex Mono pour les nombres alignés).
  Ne charge pas la feuille Google Fonts elle-même — à faire une seule fois
  au niveau de l'app consommatrice (voir le commentaire en tête du fichier).
- **`formatMontant(montant, devise)`** — le seul endroit qui formate un
  montant dans toute l'interface (section 12.5) : `"45.00 $"` pour l'USD,
  `"20 000 FC"` pour le CDF (jamais de décimales, espace comme séparateur de
  milliers, jamais de symbole `$`).
- **`Button`** (variantes `primary`/`secondary`/`danger`, tailles
  `sm`/`md`/`lg`).
- **`StatusBadge`** (couleur + mot, jamais la couleur seule) — agnostique du
  domaine métier : prend un `tone` générique (`success`/`warning`/`danger`/
  `info`/`neutral`) et un `label`, le mapping depuis un statut métier
  (`StatutChambre.LIBRE` → `tone="success"`, etc.) se fait côté app
  consommatrice, pas ici.
- **`RoomCard`** (numéro, type, prix via `formatMontant`, statut via
  `StatusBadge`), cliquable si `onClick` est fourni (accessible au clavier).

## Non fait

- **`OrderLine`** et **`DashboardStat`** : reportés à quand les écrans
  Cafétaria/Dashboard de `apps/desktop` seront construits (pas encore le cas).
- **Versions React Native** de chaque composant (même API de props, rendu
  identique — section 12.5) : reportées à la Phase 5 (app mobile), qui
  n'existe pas encore.
- Le logo et les autres ressources graphiques statiques (`assets/`) sont
  fournis mais n'ont pas encore de consommateur ici (écran de connexion pas
  encore construit).

## Tests

`pnpm --filter ui test` — React Testing Library + jsdom, sur le rendu et le
comportement (texte affiché, classes appliquées, clics/clavier), jamais sur
l'apparence visuelle (aucun outil de capture d'écran disponible dans cet
environnement — voir `DECISIONS.md`).
