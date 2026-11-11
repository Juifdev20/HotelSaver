-- Preuve d'achat des licences et contrat (11/11/2026). Voir DECISIONS.md.
-- LicenceHotel reçoit le numéro du contrat, le texte figé avec son empreinte, l'acceptation du patron dans l'application et l'exemplaire papier signé (numérisé).
-- PaiementMaintenance reçoit le numéro de son reçu. ParametresPlateforme reçoit l'identité de l'éditeur imprimée sur les documents.
-- Deux séquences donnent des numéros qui ne se répètent jamais. Aucune donnée existante n'est modifiée.

-- AlterTable
ALTER TABLE "LicenceHotel" ADD COLUMN     "accepteAppareil" TEXT,
ADD COLUMN     "accepteIp" TEXT,
ADD COLUMN     "accepteLe" TIMESTAMP(3),
ADD COLUMN     "accepteParNom" TEXT,
ADD COLUMN     "accepteParUtilisateurId" TEXT,
ADD COLUMN     "contratEmpreinte" TEXT,
ADD COLUMN     "contratTexte" TEXT,
ADD COLUMN     "contratVersion" INTEGER,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "scanChemin" TEXT,
ADD COLUMN     "scanEmpreinte" TEXT,
ADD COLUMN     "scanEnvoyeLe" TIMESTAMP(3),
ADD COLUMN     "scanEnvoyeParSuperAdminId" TEXT,
ADD COLUMN     "scanTaille" INTEGER,
ADD COLUMN     "scanType" TEXT;

-- AlterTable
ALTER TABLE "PaiementMaintenance" ADD COLUMN     "numeroRecu" TEXT;

-- AlterTable
ALTER TABLE "ParametresPlateforme" ADD COLUMN     "editeurAdresse" TEXT,
ADD COLUMN     "editeurEmail" TEXT,
ADD COLUMN     "editeurFonction" TEXT,
ADD COLUMN     "editeurNif" TEXT,
ADD COLUMN     "editeurNom" TEXT NOT NULL DEFAULT 'HotelSaver',
ADD COLUMN     "editeurRccm" TEXT,
ADD COLUMN     "editeurRepresentant" TEXT,
ADD COLUMN     "editeurTelephone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LicenceHotel_numero_key" ON "LicenceHotel"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementMaintenance_numeroRecu_key" ON "PaiementMaintenance"("numeroRecu");

-- Numéros de contrat (LIC-…) et de reçu de maintenance (MNT-…) : une séquence chacune, sans doublon même en cas de demandes simultanées.
CREATE SEQUENCE IF NOT EXISTS "licence_numero_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "recu_maintenance_numero_seq" START 1;
