# Guide d'utilisation HotelSaver

Guide PDF (et, plus tard, pages protégées du site) pour les trois rôles : **patron**, **réceptionniste**, **cafétaria**.
Charte : bleu de la marque (`#053483` / `#1769E0`), étoiles dorées du logo (`#F5B400`), police Inter, A4 portrait, **aucun emoji**,
icônes SVG utiles seulement (`icones.mjs`).

## Fabriquer le PDF

```
node docs/guide/construire.mjs                    # guide complet  -> docs/guide/sortie/Guide-HotelSaver-complet.pdf
node docs/guide/construire.mjs --role patron      # commun + patron  (reception, cafetaria de même)
node docs/guide/construire.mjs --apercu           # + une image PNG par page (sortie/apercu-<nom>/) pour relire
```

Le PDF est un assemblage de pages fabriquées par `modele.mjs` (couverture, étapes avec téléphone, écran annoté, texte, encadrés…)
et habillées par `guide.css`. Le contenu vit dans `contenu/commun.mjs`, `patron.mjs`, `reception.mjs`, `cafetaria.mjs`
(un chapitre = un titre, quelques points, des pages). Le sommaire et les numéros de page sont automatiques.
`version.json` : couverture, édition, date et page finale.

## Mettre à jour après une nouvelle version de l'application

1. Modifier le texte du chapitre concerné dans `contenu/<role>.mjs` (ou ajouter un chapitre).
2. Refaire les captures de l'écran qui a changé (voir ci-dessous) et relancer `construire.mjs --apercu` pour relire.
3. Monter l'édition dans `version.json`.

## Les captures d'écran

Les images ne sont pas versionnées (`captures/` est ignoré) : elles se refont à la demande, à l'identique.
Elles sont prises sur l'application bureau compilée, en largeur « téléphone » (390 × 844, définition ×2), avec un hôtel fictif
(« Hôtel Grand Lac », noms inventés). Une vraie capture du téléphone peut remplacer n'importe quelle image : même nom de fichier.

```
pnpm --filter @hotel-chicago/desktop build            # une fois, et après chaque changement de l'interface
docs/guide/outils/hote.sh demarrer 40000 hotel_t      # hôtel fictif + serveur + application (base locale jetable « …_t »)
node docs/guide/captures-scripts/<role>.cjs           # (GUIDE_PORT_BASE=40000) écrit docs/guide/captures/brut/<role>-*.png
docs/guide/outils/hote.sh arreter 40000
```

Les scripts utilisent `outils/lib.cjs` (connexion par rôle, navigation, photo). Comptes fictifs : `gl-patron`, `gl-recep`, `gl-caf`
(mot de passe de démonstration `motdepasse-test`). L'hôte vit dans `apps/api/test/integration/guide-hote.ts`.
