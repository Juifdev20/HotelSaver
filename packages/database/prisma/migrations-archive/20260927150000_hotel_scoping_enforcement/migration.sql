-- Phase 2 : chaque service NestJS fournit désormais hotelId explicitement
-- (voir DECISIONS.md) — le DEFAULT temporaire posé en Phase 1 (filet de
-- sécurité pendant la transition) n'a plus lieu d'être et masquerait
-- silencieusement un site de création oublié le jour où un deuxième hôtel
-- existera.

-- DropDefault (les 12 tables)
ALTER TABLE "Utilisateur" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "Chambre" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "Reservation" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "Facture" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "Produit" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "TauxChange" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "MouvementStock" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "CompteCafeteria" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "SousCompte" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "LigneCommande" ALTER COLUMN "hotelId" DROP DEFAULT;
ALTER TABLE "VenteCafeteria" ALTER COLUMN "hotelId" DROP DEFAULT;

-- Numérotation des reçus par hôtel plutôt que globale (genererNumeroRecu
-- filtre désormais par hotelId dans factures.service.ts et cafeteria.service.ts).
DROP INDEX "Facture_numeroRecu_key";
CREATE UNIQUE INDEX "Facture_hotelId_numeroRecu_key" ON "Facture"("hotelId", "numeroRecu");

DROP INDEX "VenteCafeteria_numeroRecu_key";
CREATE UNIQUE INDEX "VenteCafeteria_hotelId_numeroRecu_key" ON "VenteCafeteria"("hotelId", "numeroRecu");
