-- CreateEnum
CREATE TYPE "MoyenPaiementEnLigne" AS ENUM ('MOBILE_MONEY', 'CARTE');

-- CreateEnum
CREATE TYPE "MotifRemboursement" AS ENUM ('ANNULATION_CLIENT', 'ANNULATION_HOTEL', 'NON_PRESENTATION', 'CHAMBRE_INDISPONIBLE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutRemboursement" AS ENUM ('A_FAIRE', 'EFFECTUE', 'CONSERVE');

-- CreateEnum
CREATE TYPE "ModeRemboursement" AS ENUM ('SCANLINKPAY', 'MOBILE_MONEY', 'ESPECES', 'AUTRE');

-- AlterTable
ALTER TABLE "PaiementAbonnement" ADD COLUMN     "commissionCentimes" INTEGER,
ADD COLUMN     "modeleCommission" TEXT,
ADD COLUMN     "totalCentimes" INTEGER;

-- CreateTable
CREATE TABLE "PaiementReservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "pourcentage" INTEGER NOT NULL,
    "moyen" "MoyenPaiementEnLigne" NOT NULL,
    "operateur" "OperateurMobileMoney",
    "telephoneMasque" TEXT,
    "statut" "StatutPaiementAbonnement" NOT NULL DEFAULT 'EN_ATTENTE',
    "messageErreur" TEXT,
    "modeleCommission" TEXT NOT NULL,
    "commissionCentimes" INTEGER,
    "totalCentimes" INTEGER,
    "urlPaiement" TEXT,
    "referenceDemande" TEXT,
    "referenceFournisseur" TEXT,
    "cleIdempotence" TEXT NOT NULL,
    "numeroScanLinkPayClient" TEXT,
    "derniereVerificationLe" TIMESTAMP(3),
    "confirmeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaiementReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remboursement" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "paiementReservationId" TEXT,
    "devise" "Devise" NOT NULL,
    "montantPaye" DECIMAL(65,30) NOT NULL,
    "montantARembourser" DECIMAL(65,30) NOT NULL,
    "motif" "MotifRemboursement" NOT NULL,
    "statut" "StatutRemboursement" NOT NULL DEFAULT 'A_FAIRE',
    "mode" "ModeRemboursement",
    "destinataireScanLinkPay" TEXT,
    "destinataireTelephone" TEXT,
    "clientNom" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "traiteParId" TEXT,
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remboursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaiementReservation_referenceFournisseur_key" ON "PaiementReservation"("referenceFournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementReservation_cleIdempotence_key" ON "PaiementReservation"("cleIdempotence");

-- CreateIndex
CREATE INDEX "PaiementReservation_hotelId_reservationId_idx" ON "PaiementReservation"("hotelId", "reservationId");

-- CreateIndex
CREATE INDEX "PaiementReservation_statut_createdAt_idx" ON "PaiementReservation"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "Remboursement_hotelId_statut_idx" ON "Remboursement"("hotelId", "statut");

-- CreateIndex
CREATE INDEX "Remboursement_reservationId_idx" ON "Remboursement"("reservationId");

-- AddForeignKey
ALTER TABLE "PaiementReservation" ADD CONSTRAINT "PaiementReservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remboursement" ADD CONSTRAINT "Remboursement_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remboursement" ADD CONSTRAINT "Remboursement_paiementReservationId_fkey" FOREIGN KEY ("paiementReservationId") REFERENCES "PaiementReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "acompteFraisPayesParClient" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "boutiqueScanLinkPayId" TEXT,
ADD COLUMN     "conditionsAnnulation" TEXT,
ADD COLUMN     "nomScanLinkPay" TEXT,
ADD COLUMN     "numeroScanLinkPay" TEXT,
ADD COLUMN     "pourcentageAcompte" INTEGER NOT NULL DEFAULT 0;


-- Comme toutes les tables : RLS sans policy.
ALTER TABLE "PaiementReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Remboursement" ENABLE ROW LEVEL SECURITY;
