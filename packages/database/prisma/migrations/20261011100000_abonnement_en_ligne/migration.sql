-- CreateEnum
CREATE TYPE "StatutPaiementAbonnement" AS ENUM ('EN_ATTENTE', 'REUSSI', 'ECHEC', 'EXPIRE');

-- CreateEnum
CREATE TYPE "OperateurMobileMoney" AS ENUM ('VODACOM', 'ORANGE', 'AIRTEL', 'AFRICELL');

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "formule" TEXT,
ADD COLUMN     "suspensionManuelle" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaiementLicence" ALTER COLUMN "enregistreParSuperAdminId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PaiementAbonnement" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "formule" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "operateur" "OperateurMobileMoney" NOT NULL,
    "telephoneMasque" TEXT NOT NULL,
    "statut" "StatutPaiementAbonnement" NOT NULL DEFAULT 'EN_ATTENTE',
    "messageErreur" TEXT,
    "referenceDemande" TEXT,
    "referenceFournisseur" TEXT,
    "cleIdempotence" TEXT NOT NULL,
    "paiementLicenceId" TEXT,
    "derniereVerificationLe" TIMESTAMP(3),
    "confirmeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaiementAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_referenceFournisseur_key" ON "PaiementAbonnement"("referenceFournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_cleIdempotence_key" ON "PaiementAbonnement"("cleIdempotence");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_paiementLicenceId_key" ON "PaiementAbonnement"("paiementLicenceId");

-- CreateIndex
CREATE INDEX "PaiementAbonnement_hotelId_createdAt_idx" ON "PaiementAbonnement"("hotelId", "createdAt");

-- CreateIndex
CREATE INDEX "PaiementAbonnement_statut_createdAt_idx" ON "PaiementAbonnement"("statut", "createdAt");

-- AddForeignKey
ALTER TABLE "PaiementAbonnement" ADD CONSTRAINT "PaiementAbonnement_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementAbonnement" ADD CONSTRAINT "PaiementAbonnement_paiementLicenceId_fkey" FOREIGN KEY ("paiementLicenceId") REFERENCES "PaiementLicence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Comme toutes les tables : RLS sans policy (la clé anon publique ne doit rien pouvoir lire ni écrire).
ALTER TABLE "PaiementAbonnement" ENABLE ROW LEVEL SECURITY;
