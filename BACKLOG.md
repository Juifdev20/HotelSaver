# BACKLOG — HotelSaver

Mis à jour le 10/10/2026. L'application n'est pas encore en production : on peut tout corriger sans migration de données.

## Objectif
Plateforme multi-hôtels, **hors ligne partout** (mobile ET bureau), avec synchronisation fiable et isolation stricte entre hôtels.

## État
| # | Chantier | État |
|---|---|---|
| 1 | Isolation entre hôtels : tests à deux hôtels sur une vraie base (82 vérifications) | **fait** — 2 bugs trouvés et corrigés (n° de chambre global, inventaire avec le produit d'un autre hôtel) |
| 2 | Solidité de la synchronisation (pannes, doublons, conflits, horloges) | à faire |
| 3 | Socle offline partagé mobile + bureau | à faire |
| 4 | Bureau (Electron) hors ligne : base locale, synchro, écrans (réception puis cafétaria) | à faire |
| 5 | Encaissement et facturation hors ligne (reçu provisoire `TEMP-`, vrai numéro après synchro) | à faire |
| 6 | Connexion hors ligne, délai de grâce de licence, effacement des données locales, tolérance d'horloge | à faire |
| 7 | Indicateur d'état de synchronisation honnête (en attente, dernière synchro, conflits) partout | à faire |
| 8 | README à jour (il décrit encore l'état de la phase 1) | à faire |

## Décisions prises (à confirmer au fil de l'eau)
- Encaissement hors ligne : **oui**, avec reçu provisoire.
- Durée hors ligne à supporter : **plusieurs jours**.
- Écrans du bureau : réception d'abord, puis cafétaria.

## Idées / à regarder plus tard
- Filet automatique imposant `hotelId` à chaque requête Prisma (extension) en plus des tests.
- Numérotation des reçus : `max + 1` n'est pas atomique (deux postes simultanés) — à traiter avec l'encaissement hors ligne.
- `Utilisateur.email` est unique sur toute la plateforme : une personne ne peut pas travailler dans deux hôtels avec le même e-mail.
