# assets/ — Ressources graphiques statiques

Voir section 5.1 du prompt d'origine (`hotel-chicago-prompt-claude-code.md`)
pour l'arborescence complète attendue et la distinction avec le contenu
dynamique stocké dans Supabase Storage (photos de chambres, photos du menu —
jamais ici).

## État actuel

| Fichier attendu | Statut |
|---|---|
| `logo/logo-couleur.png` | ✅ Fourni par le patron (fond blanc plein, monogramme doré-roux) |
| `logo/logo-couleur.svg` | ❌ Manquant — demander une version vectorielle si disponible |
| `logo/logo-monochrome-clair.svg` | ❌ Manquant |
| `logo/logo-monochrome-sombre.svg` | ❌ Manquant |
| `logo/favicon.svg` | ❌ Manquant |
| `icons/desktop/*` | ❌ Manquant (icônes .icns/.ico/.png pour l'app Electron) |
| `icons/mobile/*` | ❌ Manquant (icônes pour l'app React Native) |
| `site-public/hero/hero-01.jpg … hero-06.jpg` | ❌ Manquant (photos de l'hôtel pour le carrousel) |
| `site-public/og-image.jpg` | ❌ Manquant |

Le fichier `logo-couleur.png` fourni a un fond blanc intégré (conforme à la
section 12.6) : à poser uniquement sur un fond clair. Ne pas le redessiner ni
fabriquer une version transparente par approximation — demander les fichiers
manquants au patron le moment venu (section 5.1). Voir `DECISIONS.md` pour le
détail.
