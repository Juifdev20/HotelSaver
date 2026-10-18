-- Qui a encaissé la facture (19/10/2026) : la recette du réceptionniste compte SES encaissements, même pour une réservation
-- créée par le patron ou le site. Historique : repris de l'auteur de la réservation (l'ancienne règle), pour ne rien changer
-- aux recettes déjà affichées.
ALTER TABLE "Facture" ADD COLUMN "createdBy" TEXT;

UPDATE "Facture" f
SET "createdBy" = r."createdBy"
FROM "Reservation" r
WHERE r."id" = f."reservationId" AND f."createdBy" IS NULL;

CREATE INDEX "Facture_hotelId_createdBy_idx" ON "Facture"("hotelId", "createdBy");
