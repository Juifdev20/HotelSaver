-- Reçu provisoire (TEMP-…) remis au client quand l'encaissement a été fait hors ligne :
-- on garde son numéro pour retrouver le vrai reçu une fois synchronisé.
ALTER TABLE "Facture" ADD COLUMN "numeroProvisoire" TEXT;
ALTER TABLE "VenteCafeteria" ADD COLUMN "numeroProvisoire" TEXT;
CREATE INDEX "Facture_hotelId_numeroProvisoire_idx" ON "Facture"("hotelId", "numeroProvisoire");
CREATE INDEX "VenteCafeteria_hotelId_numeroProvisoire_idx" ON "VenteCafeteria"("hotelId", "numeroProvisoire");
