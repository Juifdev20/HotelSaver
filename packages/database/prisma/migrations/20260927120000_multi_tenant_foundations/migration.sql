-- CreateEnum
CREATE TYPE "StatutLicence" AS ENUM ('ESSAI', 'ACTIF', 'SUSPENDU', 'RESILIE');

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "sousDomaine" TEXT NOT NULL,
    "statutLicence" "StatutLicence" NOT NULL DEFAULT 'ESSAI',
    "emailContact" TEXT,
    "telephoneContact" TEXT,
    "adresse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBranding" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "policeAffichage" TEXT NOT NULL DEFAULT 'Fraunces',
    "policeCorps" TEXT NOT NULL DEFAULT 'Public Sans',
    "policeMono" TEXT NOT NULL DEFAULT 'IBM Plex Mono',
    "palette" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBranding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_sousDomaine_key" ON "Hotel"("sousDomaine");

-- CreateIndex
CREATE UNIQUE INDEX "HotelBranding_hotelId_key" ON "HotelBranding"("hotelId");

-- AddForeignKey
ALTER TABLE "HotelBranding" ADD CONSTRAINT "HotelBranding_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed : le tenant #1 (Hôtel Chicago), déjà en production, statutLicence = ACTIF
-- (pas ESSAI : ce n'est pas un essai, c'est une migration de données réelles).
INSERT INTO "Hotel" ("id", "nom", "sousDomaine", "statutLicence", "emailContact", "telephoneContact", "adresse", "createdAt", "updatedAt")
VALUES (
    'd4b39c38-fc2c-45d5-9f57-c94d8357719d',
    'Hôtel Chicago',
    'chicago',
    'ACTIF',
    NULL,
    NULL,
    'Kasindi, RDC',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Seed : charte graphique Hôtel Chicago (section 12 du prompt maître HotelSaver),
-- valeurs reprises telles quelles de apps/mobile/src/tokens.ts (clair) et
-- packages/ui/src/tokens.css :root[data-theme="dark"] (sombre).
INSERT INTO "HotelBranding" ("id", "hotelId", "logoUrl", "policeAffichage", "policeCorps", "policeMono", "palette", "createdAt", "updatedAt")
VALUES (
    '03a3a62b-45cf-4d0d-bfed-a67f0d3fe909',
    'd4b39c38-fc2c-45d5-9f57-c94d8357719d',
    NULL,
    'Fraunces',
    'Public Sans',
    'IBM Plex Mono',
    '{
      "light": {
        "navy": "#0F2742",
        "navyForte": "#0A1A2E",
        "bleu": "#1769E0",
        "bleuHover": "#1258C0",
        "bleuClair": "#EAF3FF",
        "bleuTresClair": "#F5F9FF",
        "surface100": "#F6F8FC",
        "surface200": "#FFFFFF",
        "surface300": "#F9FBFE",
        "bordure": "#E4EAF2",
        "encre": "#142033",
        "encreAttenuee": "#667085",
        "encreFaible": "#98A2B3",
        "surAccent": "#FFFFFF",
        "succes": "#12B76A",
        "succesClair": "#ECFDF3",
        "alerte": "#F79009",
        "alerteClair": "#FFFAEB",
        "danger": "#F04438",
        "dangerClair": "#FEF3F2",
        "info": "#2E90FA",
        "infoClair": "#EFF8FF",
        "violet": "#7F56D9",
        "violetClair": "#F4F3FF",
        "neutre": "#667085",
        "surStatut": "#FFFFFF",
        "iconeSombre": "#344054"
      },
      "dark": {
        "surface100": "#0B1220",
        "surface200": "#162337",
        "surface300": "#111C2E",
        "bordure": "#1F2C42",
        "encre": "#F8FAFC",
        "encreAttenuee": "#98A2B3",
        "encreFaible": "#7B8794",
        "bleu": "#3B82F6",
        "bleuHover": "#5B93F5",
        "bleuClair": "#16233F",
        "bleuTresClair": "#111C2E",
        "succesClair": "#0C2A1E",
        "alerteClair": "#2E2410",
        "dangerClair": "#2E1615",
        "infoClair": "#0D2338",
        "violetClair": "#221A3A"
      },
      "espacements": { "s1": 4, "s2": 8, "s3": 12, "s4": 16, "s5": 24, "s6": 32, "s7": 48 },
      "rayons": { "sm": 8, "md": 10, "lg": 16, "pill": 999 }
    }'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable: Utilisateur
ALTER TABLE "Utilisateur" ADD COLUMN "hotelId" TEXT;
UPDATE "Utilisateur" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Utilisateur" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Utilisateur" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Utilisateur_hotelId_idx" ON "Utilisateur"("hotelId");

-- AlterTable: Chambre
ALTER TABLE "Chambre" ADD COLUMN "hotelId" TEXT;
UPDATE "Chambre" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Chambre" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Chambre" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "Chambre" ADD CONSTRAINT "Chambre_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Chambre_hotelId_idx" ON "Chambre"("hotelId");

-- AlterTable: Client
ALTER TABLE "Client" ADD COLUMN "hotelId" TEXT;
UPDATE "Client" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Client" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Client" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "Client" ADD CONSTRAINT "Client_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Client_hotelId_idx" ON "Client"("hotelId");

-- AlterTable: Reservation
ALTER TABLE "Reservation" ADD COLUMN "hotelId" TEXT;
UPDATE "Reservation" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Reservation" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Reservation" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Reservation_hotelId_idx" ON "Reservation"("hotelId");

-- AlterTable: Facture
ALTER TABLE "Facture" ADD COLUMN "hotelId" TEXT;
UPDATE "Facture" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Facture" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Facture" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Facture_hotelId_idx" ON "Facture"("hotelId");

-- AlterTable: Produit
ALTER TABLE "Produit" ADD COLUMN "hotelId" TEXT;
UPDATE "Produit" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Produit" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "Produit" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "Produit" ADD CONSTRAINT "Produit_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Produit_hotelId_idx" ON "Produit"("hotelId");

-- AlterTable: TauxChange
ALTER TABLE "TauxChange" ADD COLUMN "hotelId" TEXT;
UPDATE "TauxChange" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "TauxChange" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "TauxChange" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "TauxChange" ADD CONSTRAINT "TauxChange_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TauxChange_hotelId_idx" ON "TauxChange"("hotelId");

-- AlterTable: MouvementStock
ALTER TABLE "MouvementStock" ADD COLUMN "hotelId" TEXT;
UPDATE "MouvementStock" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "MouvementStock" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "MouvementStock" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MouvementStock_hotelId_idx" ON "MouvementStock"("hotelId");

-- AlterTable: CompteCafeteria
ALTER TABLE "CompteCafeteria" ADD COLUMN "hotelId" TEXT;
UPDATE "CompteCafeteria" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "CompteCafeteria" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "CompteCafeteria" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "CompteCafeteria" ADD CONSTRAINT "CompteCafeteria_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CompteCafeteria_hotelId_idx" ON "CompteCafeteria"("hotelId");

-- AlterTable: SousCompte
ALTER TABLE "SousCompte" ADD COLUMN "hotelId" TEXT;
UPDATE "SousCompte" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "SousCompte" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "SousCompte" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "SousCompte" ADD CONSTRAINT "SousCompte_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SousCompte_hotelId_idx" ON "SousCompte"("hotelId");

-- AlterTable: LigneCommande
ALTER TABLE "LigneCommande" ADD COLUMN "hotelId" TEXT;
UPDATE "LigneCommande" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "LigneCommande" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "LigneCommande" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "LigneCommande_hotelId_idx" ON "LigneCommande"("hotelId");

-- AlterTable: VenteCafeteria
ALTER TABLE "VenteCafeteria" ADD COLUMN "hotelId" TEXT;
UPDATE "VenteCafeteria" SET "hotelId" = 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "VenteCafeteria" ALTER COLUMN "hotelId" SET DEFAULT 'd4b39c38-fc2c-45d5-9f57-c94d8357719d';
ALTER TABLE "VenteCafeteria" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "VenteCafeteria" ADD CONSTRAINT "VenteCafeteria_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "VenteCafeteria_hotelId_idx" ON "VenteCafeteria"("hotelId");
