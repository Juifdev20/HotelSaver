# assets/ — Ressources graphiques statiques

Voir section 5.1 du prompt d'origine (`hotel-chicago-prompt-claude-code.md`)
pour l'arborescence complète attendue et la distinction avec le contenu
dynamique stocké dans Supabase Storage (photos de chambres, photos du menu —
jamais ici).

## Deux identités à ne pas confondre

- **HotelSaver (application)** : `icons/hotelsaver-icone.png` — badge bleu
  « H + étoiles » sur coins transparents, fourni par le patron (1024×1024).
  C'est le logo de la PLATEFORME : icône Play Store, splash, connexion,
  en-têtes, favicons, panel Super-Admin. Fichier statique versionné ici.
- **Logo d'un hôtel (tenant)** : `HotelBranding.logoUrl` en base, servi par
  `GET /public/hotel` — jamais un fichier de ce dossier. `logo/logo-couleur.png`
  (monogramme doré-roux) est le logo de **l'Hôtel Chicago**, c'est-à-dire du
  tenant : il ne doit PAS apparaître dans le chrome générique des applis.

## État actuel

| Fichier | Statut |
|---|---|
| `icons/hotelsaver-icone.png` | ✅ Logo maître HotelSaver (1024×1024, alpha) |
| `icons/hotelsaver-foreground.png` | ✅ Généré — avant-plan icône adaptative (artwork 62 %) |
| `icons/hotelsaver-background.png` | ✅ Généré — dégradé prolongé du badge |
| `icons/hotelsaver-favicon.png` | ✅ Généré — 64×64 |
| `icons/desktop/icon.png` + `icon.ico` | ✅ Générés (512 PNG / ICO 256 encapsulé PNG) |
| `icons/mobile/*` | ✅ Copiés dans `apps/mobile/assets/` par le script |
| `logo/logo-couleur.png` | ✅ Logo de l'hôtel Chicago (fond blanc plein, tenant) |
| `logo/logo-couleur.svg` | ❌ Manquant — demander une version vectorielle |
| `logo/logo-monochrome-*.svg` | ❌ Manquant |
| `logo/favicon.svg` | ❌ Manquant |
| `icons/hotelsaver-symbole.png` | ❌ Manquant — variante « symbole seul » (sans wordmark) |
| `site-public/hero/hero-01.jpg …` | ❌ Manquant (photos de l'hôtel pour le carrousel) |
| `site-public/og-image.jpg` | ❌ Manquant |

## Régénérer les dérivés

`node assets/scripts/generer-icones-hotelsaver.cjs` — produit/redéploie tout
ce qui est coché « Généré » ci-dessus vers `apps/mobile/assets`,
`apps/*/public` et `apps/desktop/resources`. Dépendance : `pngjs` (résolu
depuis le store virtuel pnpm).

Choix assumés (voir `DECISIONS.md`) :
- pas d'icône adaptative **monochrome** : le badge n'a pas de silhouette
  exploitable — prévoir la variante « symbole seul » si les icônes thémées
  Android sont voulues un jour ;
- le logo hôtel `logo-couleur.png` a un fond blanc intégré (section 12.6) :
  à poser uniquement sur un fond clair. Ne pas le redessiner ni fabriquer
  une version transparente par approximation.
