# Audit ergonomie — application bureau HotelSaver

Date : 25/10/2026. Méthode : l'application bureau (dossier `apps/desktop`) a été lancée dans un vrai Chromium avec un hôtel bien rempli
(12 chambres, 11 séjours, 10 clients, 12 produits, dépenses, comptes ouverts), pour les trois rôles (patron, réception, cafétaria), puis
chaque écran a été photographié à 860, 960, 1100, 1280, 1440 et 1920 px de large. L'outil est conservé :
`apps/api/test/integration/captures-bureau.e2e-spec.ts` (mode d'emploi en tête du fichier) — il permet de refaire exactement les mêmes
photos après chaque correction. Les images « avant » sont dans `docs/ux-bureau/avant/`.

## Constat général

L'application a une bonne base (barre latérale, barre du haut, cartes, tableaux, badges de statut). Ce qui la fait paraître « téléphone »,
ce n'est pas un seul défaut mais une série de réflexes mobiles gardés sur grand écran : tout est empilé en une colonne étroite, les
formulaires s'ouvrent au milieu de la page et la moitié droite de l'écran reste vide.

## Défauts, du plus gênant au moins gênant

### A. Mise en page « téléphone » sur grand écran (cause principale du ressenti)

| N° | Défaut | Où | Photo |
|----|--------|----|-------|
| A1 | Formulaires en **une seule colonne étroite (≈ 520 px)**, collés à gauche ; plus de la moitié de l'écran vide. Tous les champs sont pleine largeur, empilés. | Nouvelle chambre, Nouveau produit, Nouveau mouvement de stock, Nouvelle réservation, Caisse, Retrait commande, Paramètres, Site de l'hôtel | `formulaire-*.png`, `caisse-vente-rapide.png`, `parametres.png`, `site-de-l-hotel.png` |
| A2 | **Les formulaires s'insèrent dans la page** au-dessus de la liste (la liste est repoussée vers le bas, il faut défiler pour revoir ce qu'on modifie). Un bureau utilise une fenêtre latérale ou une fenêtre centrée. | Chambres, Stock, Menu (nouveau produit) | `formulaire-nouvelle-chambre.png` |
| A3 | **Contenu limité à ≈ 1200 px et collé à gauche** : sur un écran 1920 px, 400 px vides à droite, la page paraît mal centrée. | Toutes les pages | `ecran-1920-reservations.png` |
| A4 | **Sous 900 px de large, l'application bascule entièrement en version téléphone** (barre du bas, menu hamburger, bandeau d'accueil différent). Aucune largeur minimale n'est fixée sur la fenêtre : un écran 1366 px réglé à 150 % d'affichage Windows (cas fréquent sur portable) donne ≈ 910 px utiles, soit à deux pas de la bascule ; en réduisant un peu la fenêtre on tombe dans l'interface téléphone. | Fenêtre | `fenetre-etroite-tableau-de-bord.png` |
| A5 | Entre 900 et 1100 px, les tableaux **débordent** : la dernière colonne est coupée sans barre de défilement (ex. colonne « Statut » des réservations). | Réservations, Stock, Facturation | `fenetre-960-reservations.png` |
| A6 | Le tableau de bord de la réception et de la cafétaria n'a que 2 cartes de chiffres sur 4 colonnes possibles : deux tiers de la rangée vides. | Tableau de bord réception / cafétaria | — |

### B. Écrans visiblement cassés ou mal finis

| N° | Défaut | Où | Photo |
|----|--------|----|-------|
| B1 | **Stock : champ de recherche enfermé dans une grande boîte blanche vide** (≈ 130 px de haut) ; le tableau est écrasé : les prix passent à la ligne (« 1.50 / $ »), les actions « Mouvement / Étiquette » sont coupées. | Stock | `stock.png` |
| B2 | **Dépenses : filtres désalignés** (« DU » et « AU » empilés à droite, boutons Tous / Réception / Cafétaria décalés, total sous les filtres). | Dépenses | `depenses.png` |
| B3 | **Inventaire : indicateur d'étapes incohérent** (première étape en barre bleue pleine largeur, les autres en pastilles noires). | Inventaire | `inventaire.png` |
| B4 | **Caisse : le message d'erreur rouge « Le nom de la table ou du client est obligatoire. » s'affiche dès l'ouverture**, avant toute saisie. | Caisse | `caisse-vente-rapide.png` |
| B5 | **Cuisine : cartes de commande minuscules** (texte 12 px, boutons « Prendre en charge » serrés) alors que c'est un écran regardé de loin, au comptoir. | Cuisine | `cuisine.png` |
| B6 | **Rapports mensuels : sélecteur « MOIS » minuscule** à droite, titres de cartes alignés à droite, grand vide sous les deux cartes. | Rapports mensuels | `rapports-mensuels.png` |
| B7 | **Retrait commande : champ avec contour noir épais** (focus par défaut du navigateur) et grande page vide autour d'un petit encadré. | Retrait commande | `retrait-commande.png` |
| B8 | **Compte cafétaria ouvert : disposition d'un téléphone** (cartes empilées, total à part, « Ajouter une personne » en bas) alors que l'écran est celui où le serveur passe le plus de temps. | Détail d'un compte | `compte-detail.png` |

### C. Cohérence et finition

| N° | Défaut |
|----|--------|
| C1 | **En-têtes de page non uniformes** : certains titres ont une icône (Cuisine, Retrait commande), d'autres non ; le bouton principal est tantôt en haut à droite, tantôt dans un formulaire, tantôt absent. |
| C2 | **Tableaux sans tri ni pagination** : on ne peut pas trier par date, par nom, par montant ; une longue liste (clients, réservations, reçus) devient interminable. Pas d'en-tête fixe. |
| C3 | **Fenêtres de confirmation et formulaires de styles différents** selon les écrans (inline, page entière, boîte centrée). |
| C4 | **Barre latérale** : 264 px fixes ; quand elle est plus longue que la fenêtre elle défile et peut masquer le haut (« Tableau de bord ») sans indice visuel de défilement ; sur un écran 720 px de haut on ne voit pas Rapports, Dépenses, Site, Guide sans défiler. |
| C5 | **Barre de recherche du haut** : « Rechercher une chambre, un client… » ne mène qu'à l'écran Chambres (pas de recherche de client, de réservation, de reçu). Le libellé promet plus que ce qui est fait. |
| C6 | **Raccourcis clavier absents** (nouvelle réservation, recherche, Échap pour fermer) alors que c'est ce qui fait gagner du temps à la réception. |
| C7 | **Message « Lecture seule — cette opération est réservée au personnel »** montré au patron en haut des écrans : bien intentionné mais bruyant, et il arrive avant le contenu. |
| C8 | **Densité** : lignes de 56 px, beaucoup de blanc ; sur un 1366×768 on voit 8 lignes de tableau au lieu de 14. Une option « compact » aiderait sur les petits écrans. |

## Plan proposé (dans cet ordre)

1. **Socle de mise en page bureau** (corrige A1, A3, A4, A5, C1) : un composant de page commun (titre, sous-titre, boutons d'action à droite, contenu centré avec
   largeur maximale adaptée), grille de formulaire à 2 colonnes, **fenêtre minimale 1024 × 640** pour que la version téléphone ne s'affiche plus jamais sur
   ordinateur, défilement horizontal propre des tableaux.
2. **Formulaires en fenêtre latérale ou centrée** (A2, C3) : nouvelle chambre, nouveau produit, mouvement de stock, nouvelle dépense — on garde la liste visible.
3. **Réparer les écrans cassés** (B1 à B8) un par un.
4. **Tableaux professionnels** (C2, C8) : tri par colonne, recherche, pagination, en-tête fixe, mode compact.
5. **Écrans de travail repensés pour le bureau** : Caisse + compte ouvert (deux colonnes : produits à gauche, ticket à droite), Réservation (formulaire + récapitulatif
   à droite), Cuisine (grandes cartes), Tableau de bord (4 cartes pour tous les rôles).
6. **Finition** : recherche globale, raccourcis clavier, barre latérale (C4, C5, C6, C7).
7. **Contrôle** : refaire toutes les photos aux 6 tailles et vérifier les 3 rôles ; tests de navigateur existants (`navigateur*.e2e-spec.ts`) relancés.

## État d'avancement (25/10/2026)

Corrigé et vérifié par de nouvelles photos aux tailles 960, 1280, 1440 et 1920 px :

- **A1, A2** — Les formulaires de chambre, de produit, de mouvement de stock et de dépense s'ouvrent dans un **panneau latéral** (composant `PanneauFormulaire`, champs sur deux colonnes, boutons toujours visibles, Échap ferme). Caisse, Paramètres, Site de l'hôtel, Rapports, Nouvelle réservation et compte cafétaria sont repensés en **deux colonnes**.
- **A3** — Les pages sont centrées (largeur maximale 1440 px).
- **A4** — Fenêtre minimale **880 × 560 px** ; taille de départ adaptée à l'écran (90 % de la zone utile, entre 1280 × 800 et 1600 × 1000) ; barre latérale réduite aux icônes d'office sous 1180 px ; la version téléphone ne s'affiche plus que sous 760 px (donc jamais dans l'application).
- **A6** — Les deux cartes de chiffres des employés se partagent la rangée.
- **B1, B2, B3, B5, B6, B7, B8** — Stock (recherche, prix sur une ligne), filtres de Dépenses, indicateur d'étapes de l'Inventaire, Cuisine (cartes plus grandes), Rapports, Retrait commande, compte cafétaria.
- **Variables CSS manquantes** : sept variables (`--hc-surface`, `--hc-text`, `--hc-radius`…) étaient utilisées sans être définies, d'où des fonds et des textes « vides » (inventaire, stock, cuisine). Elles sont maintenant définies.
- **C1** (partiel : icônes retirées des titres Cuisine et Retrait commande), **C2** (tri par clic sur l'en-tête : Réservations, Clients, Dépenses, Stock), **C5** (libellé honnête : « Rechercher une chambre »), **C6** (partiel : Ctrl+K place le curseur dans la recherche).

Correction de l'audit : **B4 n'était pas un défaut**. L'erreur rouge de la Caisse venait de l'outil de capture, qui avait cliqué sur « Ouvrir le compte » avant de photographier.

Reste à faire :

- **C3** — Quelques formulaires restent dans la page (modification d'un client, utilisateurs, taux de change, inventaire) : à passer en panneau latéral.
- **Pagination** et **mode compact** des tableaux (C2, C8) ; défilement horizontal des tableaux larges sur fenêtre étroite (le Stock garde des colonnes coupées sous 1400 px, avec défilement).
- **C4** (barre latérale), **C7** (message « Lecture seule »), autres raccourcis clavier.
- **Cuisine** en plein écran et **Caisse** avec catalogue à gauche et ticket à droite (la vente rapide et l'ajout de consommations ont déjà une disposition à deux colonnes).

### Mise à jour (suite, 25/10/2026)

- **C3** — Les formulaires « utilisateurs » (création et modification) et « fiche client » passent aussi en panneau latéral. Restent en place, volontairement : le taux de change (petite carte) et l'assistant d'inventaire (un parcours en trois étapes).
- **C2** — Pagination (25 lignes, 30 pour le stock) sous les tableaux Réservations, Clients, Dépenses et Stock.
- **C8** — Option **Affichage compact** dans Paramètres → Apparence (lignes de tableau et espacements réduits, gardée sur le poste).
- **C4** — La barre latérale garde toujours visible l'entrée de la page ouverte et un fondu en bas signale qu'il y a une suite.

### Mise à jour (fin, 25/10/2026)

- **Cuisine** : bouton **Plein écran** (cartes plus grandes, lisibles de loin) ; le bouton Échap ou « Quitter » ramène à la fenêtre normale.
- **Message « Lecture seule »** : bandeau bleu discret à la place du cadre en pointillés.
- **Caisse** : l'écran d'ajout de consommations avait déjà la bonne disposition de bureau (catalogue à gauche, sélection à droite) ; l'ouverture de compte est à deux colonnes.
- Reste ouvert : raccourcis clavier au-delà de Ctrl+K, et le défilement horizontal du Stock sous 1400 px.

### Facturation (25/10/2026)

L'écran de facturation d'un séjour est à deux colonnes : le récapitulatif du séjour (client, chambre, dates, prix, acompte, ventes liées) à gauche, le total, le mode de paiement, le détail du règlement et le bouton « Facturer et check-out » à droite, toujours en vue. La liste des séjours à facturer et le journal des reçus étaient déjà corrects.
