-- Fiabilisation des chiffres (15/10/2026) :
-- 1. LigneCommande.venteId + VenteCafeteria.lotEncaissement : savoir quels articles un reçu a
--    réglés, pour les remettre en stock si le reçu est annulé.
-- 2. Reservation.arriveeLe / departLe : heures réelles de check-in / check-out, préférées aux
--    dates prévues pour l'occupation des rapports.
-- Colonnes nullables : les données existantes restent valides (non rattachées / non horodatées).

-- AlterTable
ALTER TABLE "LigneCommande" ADD COLUMN "venteId" TEXT;
ALTER TABLE "VenteCafeteria" ADD COLUMN "lotEncaissement" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "arriveeLe" TIMESTAMP(3);
ALTER TABLE "Reservation" ADD COLUMN "departLe" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LigneCommande_venteId_idx" ON "LigneCommande"("venteId");
