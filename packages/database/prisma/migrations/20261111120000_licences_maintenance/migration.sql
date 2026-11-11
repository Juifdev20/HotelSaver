-- Licences de 1, 2 ou 3 ans activées à la main par le super-admin, et frais de maintenance mensuels (11/11/2026). Voir DECISIONS.md.
-- LicenceHotel : la licence achetée hors de l'application. PaiementMaintenance : les frais mensuels (payés dans l'application ou saisis à la main).
-- PaiementAbonnement.objet distingue un abonnement d'une maintenance ; ParametresPlateforme reçoit les réglages (5 $, 2 jours de grâce, rappel 5 jours avant).
-- Aucune donnée existante n'est modifiée : tout est nouveau ou a une valeur par défaut.


-- CreateEnum
CREATE TYPE "ObjetPaiementAbonnement" AS ENUM ('ABONNEMENT', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "PaiementAbonnement" ADD COLUMN     "objet" "ObjetPaiementAbonnement" NOT NULL DEFAULT 'ABONNEMENT',
ADD COLUMN     "paiementMaintenanceId" TEXT;

-- AlterTable
ALTER TABLE "ParametresPlateforme" ADD COLUMN     "fraisMaintenanceUsd" DECIMAL(65,30) NOT NULL DEFAULT 5,
ADD COLUMN     "joursGraceMaintenance" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "joursPreavisMaintenance" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "LicenceHotel" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "annees" INTEGER NOT NULL,
    "debutLe" TIMESTAMP(3) NOT NULL,
    "finLe" TIMESTAMP(3) NOT NULL,
    "montant" DECIMAL(65,30),
    "devise" "Devise",
    "fraisMaintenanceUsd" DECIMAL(65,30),
    "note" TEXT,
    "paiementLicenceId" TEXT,
    "enregistreParSuperAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleLe" TIMESTAMP(3),
    "annuleParSuperAdminId" TEXT,
    "motifAnnulation" TEXT,

    CONSTRAINT "LicenceHotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaiementMaintenance" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "licenceId" TEXT,
    "mois" INTEGER NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "methode" "MethodePaiementLicence" NOT NULL,
    "periodeCouverteJusquau" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "enregistreParSuperAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleLe" TIMESTAMP(3),
    "annuleParSuperAdminId" TEXT,
    "motifAnnulation" TEXT,

    CONSTRAINT "PaiementMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenceHotel_paiementLicenceId_key" ON "LicenceHotel"("paiementLicenceId");

-- CreateIndex
CREATE INDEX "LicenceHotel_hotelId_idx" ON "LicenceHotel"("hotelId");

-- CreateIndex
CREATE INDEX "PaiementMaintenance_hotelId_idx" ON "PaiementMaintenance"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_paiementMaintenanceId_key" ON "PaiementAbonnement"("paiementMaintenanceId");

-- AddForeignKey
ALTER TABLE "PaiementAbonnement" ADD CONSTRAINT "PaiementAbonnement_paiementMaintenanceId_fkey" FOREIGN KEY ("paiementMaintenanceId") REFERENCES "PaiementMaintenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceHotel" ADD CONSTRAINT "LicenceHotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceHotel" ADD CONSTRAINT "LicenceHotel_paiementLicenceId_fkey" FOREIGN KEY ("paiementLicenceId") REFERENCES "PaiementLicence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementMaintenance" ADD CONSTRAINT "PaiementMaintenance_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementMaintenance" ADD CONSTRAINT "PaiementMaintenance_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "LicenceHotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS sur toute table du schéma public (aucun accès direct pour anon / authenticated ; l'API, rôle postgres, n'est pas concernée).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
