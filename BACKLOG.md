# BACKLOG — HotelSaver

Mis à jour le 10/10/2026. L'application n'est pas encore en production : on peut tout corriger sans migration de données.

## Objectif
Plateforme multi-hôtels, **hors ligne partout** (mobile ET bureau), avec synchronisation fiable et isolation stricte entre hôtels.

## État
| # | Chantier | État |
|---|---|---|
| 1 | Isolation entre hôtels : tests à deux hôtels sur une vraie base (82 vérifications) | **fait** — 2 bugs trouvés et corrigés (n° de chambre global, inventaire avec le produit d'un autre hôtel) |
| 2 | Solidité de la synchronisation (pannes, doublons, conflits, horloges) | **fait** (serveur + moteur + mobile) |
| 3 | Socle offline partagé (base locale, règles d'argent, client hors ligne) | **fait** — `miroir-local`, `regles` |
| 4 | Bureau (Electron) hors ligne : base locale, synchro, écrans | **fait** — testé dans Chromium ; à essayer sur un poste Windows |
| 5 | Encaissement et facturation hors ligne (reçu provisoire `TEMP-`, vrai numéro après synchro) | **fait** (bureau) — mobile : voir plus bas |
| 6 | Connexion hors ligne, durée de grâce (14 j), effacement des données locales, tolérance d'horloge | **fait** (bureau) |
| 7 | Indicateur d'état de synchronisation honnête | **fait** (bureau + mobile) |
| 8 | README à jour | **fait** |
| 9 | **Mobile : check-in/out, facturation, encaissement hors ligne** | à faire — voir « Mobile » |

## Mobile : passer check-in/out, facturation et encaissement hors ligne
Aujourd'hui ces actions exigent la connexion (écrans `EcranReservationDetail`, `EcranFacturation`, `EcranCompteCafeteria`, `EcranCuisine`, `EcranStock`). Le serveur est prêt
(ordres `ActionReservation`/`ActionLigne`, créations `Facture`/`VenteCafeteria`). Deux voies :
1. **Recommandée** : écrire une `Persistance` pour `expo-sqlite` (une table `documents(collection, id, json)`, ~80 lignes, mêmes tests que `PersistanceIndexedDb`), puis brancher les écrans mobiles
   sur `ouvrirMiroir(...).client` comme le bureau (les mêmes méthodes `client.xxx()`), en retirant `stockage/*Mirroir.ts`. Supprime la double identité `id`/`remoteId` du mobile.
2. Étendre les miroirs actuels (nouvelles tables Facture/VenteCafeteria, numéros provisoires, `idsEnAttente` qui inclut les lignes visées par un ordre). Plus court mais garde la complexité.
Quoi qu'il en soit : un APK doit être reconstruit pour tester (voir `AGENTS.md`), et rien de cela ne peut être vérifié sans appareil — prévoir une séance de test sur le téléphone.

## Décisions prises (à confirmer au fil de l'eau)
- Encaissement hors ligne : **oui**, avec reçu provisoire.
- Durée hors ligne à supporter : **plusieurs jours**.
- Écrans du bureau : réception d'abord, puis cafétaria.

## À surveiller / idées
- **Copie locale non chiffrée** (profil de l'application) : sur un ordinateur partagé, utiliser « Effacer les données de cet appareil ». Chiffrement possible avec `safeStorage` d'Electron (clé dans le coffre Windows).
- Inventaire physique et menu du jour : encore en ligne seulement (le menu s'affiche hors ligne depuis la dernière copie).
- Annuler un reçu ou une vente : en ligne seulement (inverser de l'argent exige l'état réel du serveur).
- Tests de l'application Electron réelle (fenêtre, imprimante) : seul le renderer a été exercé (Chromium) ; relancer `apps/desktop/e2e` sur un poste Windows.
- Réglages `DELAI_GRACE_JOURS` (14) et `SEUIL_HORLOGE_SUSPECTE` (5 min) : constantes, à rendre configurables par hôtel si besoin.

- Filet automatique imposant `hotelId` à chaque requête Prisma (extension) en plus des tests.
- Numérotation des reçus : `max + 1` n'est pas atomique (deux postes simultanés) — à traiter avec l'encaissement hors ligne.
- `Utilisateur.email` est unique sur toute la plateforme : une personne ne peut pas travailler dans deux hôtels avec le même e-mail.
- Plus de 5000 suppressions entre deux synchros d'un même appareil : seules les 5000 plus anciennes sont transmises (ajouter une pagination des suppressions ou un "réinitialiser le miroir").
- Purge des anciennes `SyncCorrespondance` et `Suppression` (au-delà de la durée hors ligne maximale supportée).
