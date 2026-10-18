-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RECEPTIONNISTE', 'CAFETARIA', 'PATRON');

-- CreateEnum
CREATE TYPE "StatutChambre" AS ENUM ('LIBRE', 'OCCUPEE', 'RESERVEE', 'NETTOYAGE');

-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('OUVERT', 'FERME');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('CASH', 'MOBILE_MONEY', 'FACTURE_CHAMBRE');

-- CreateEnum
CREATE TYPE "Devise" AS ENUM ('USD', 'CDF');

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "supabaseAuthId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chambre" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prixParNuit" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "statut" "StatutChambre" NOT NULL DEFAULT 'LIBRE',
    "photos" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Chambre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "chambreId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dateArrivee" TIMESTAMP(3) NOT NULL,
    "dateDepart" TIMESTAMP(3) NOT NULL,
    "acompte" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL,
    "origine" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "montantChambre" DECIMAL(65,30) NOT NULL,
    "deviseChambre" "Devise" NOT NULL,
    "montantTotalUSD" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montantTotalCDF" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "modePaiement" "ModePaiement" NOT NULL,
    "deviseRegleeParClient" "Devise",
    "montantRegleParClient" DECIMAL(65,30),
    "tauxChangeApplique" DECIMAL(65,30),
    "numeroRecu" TEXT NOT NULL,
    "imprimeLe" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produit" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "prix" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "photo" TEXT,
    "stockActuel" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "seuilAlerte" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TauxChange" (
    "id" TEXT NOT NULL,
    "cdfParUsd" DECIMAL(65,30) NOT NULL,
    "definiPar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TauxChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" DECIMAL(65,30) NOT NULL,
    "type" TEXT NOT NULL,
    "motif" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompteCafeteria" (
    "id" TEXT NOT NULL,
    "tableOuNom" TEXT NOT NULL,
    "statut" "StatutCompte" NOT NULL DEFAULT 'OUVERT',
    "ouvertPar" TEXT NOT NULL,
    "ouvertLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fermeLe" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompteCafeteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SousCompte" (
    "id" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SousCompte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneCommande" (
    "id" TEXT NOT NULL,
    "sousCompteId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" DECIMAL(65,30) NOT NULL,
    "prixUnitaire" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LigneCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenteCafeteria" (
    "id" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "montantTotalUSD" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montantTotalCDF" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "modePaiement" "ModePaiement" NOT NULL,
    "deviseRegleeParClient" "Devise",
    "montantRegleParClient" DECIMAL(65,30),
    "tauxChangeApplique" DECIMAL(65,30),
    "reservationLieeId" TEXT,
    "numeroRecu" TEXT NOT NULL,
    "imprimeLe" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VenteCafeteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_supabaseAuthId_key" ON "Utilisateur"("supabaseAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "Chambre_numero_key" ON "Chambre"("numero");

-- CreateIndex
CREATE INDEX "Chambre_statut_idx" ON "Chambre"("statut");

-- CreateIndex
CREATE INDEX "Reservation_chambreId_idx" ON "Reservation"("chambreId");

-- CreateIndex
CREATE INDEX "Reservation_clientId_idx" ON "Reservation"("clientId");

-- CreateIndex
CREATE INDEX "Reservation_dateArrivee_dateDepart_idx" ON "Reservation"("dateArrivee", "dateDepart");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_reservationId_key" ON "Facture"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_numeroRecu_key" ON "Facture"("numeroRecu");

-- CreateIndex
CREATE INDEX "MouvementStock_produitId_idx" ON "MouvementStock"("produitId");

-- CreateIndex
CREATE INDEX "CompteCafeteria_statut_idx" ON "CompteCafeteria"("statut");

-- CreateIndex
CREATE INDEX "SousCompte_compteId_idx" ON "SousCompte"("compteId");

-- CreateIndex
CREATE INDEX "LigneCommande_sousCompteId_idx" ON "LigneCommande"("sousCompteId");

-- CreateIndex
CREATE INDEX "LigneCommande_produitId_idx" ON "LigneCommande"("produitId");

-- CreateIndex
CREATE UNIQUE INDEX "VenteCafeteria_numeroRecu_key" ON "VenteCafeteria"("numeroRecu");

-- CreateIndex
CREATE INDEX "VenteCafeteria_compteId_idx" ON "VenteCafeteria"("compteId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_chambreId_fkey" FOREIGN KEY ("chambreId") REFERENCES "Chambre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SousCompte" ADD CONSTRAINT "SousCompte_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteCafeteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_sousCompteId_fkey" FOREIGN KEY ("sousCompteId") REFERENCES "SousCompte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenteCafeteria" ADD CONSTRAINT "VenteCafeteria_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteCafeteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
