-- Date de création d'une réservation (13/11/2026) : l'acompte pris à l'enregistrement du client est compté dans la recette du jour
-- (tableau de bord réception et patron). Les réservations déjà existantes sont datées au plus tôt de leur dernière modification et de
-- leur arrivée, et jamais « aujourd'hui » : elles ne gonflent donc pas la recette du jour de la mise en service. Voir DECISIONS.md.

ALTER TABLE "Reservation" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Reservation"
SET "createdAt" = LEAST("updatedAt", "dateArrivee", CURRENT_TIMESTAMP - INTERVAL '1 day');
