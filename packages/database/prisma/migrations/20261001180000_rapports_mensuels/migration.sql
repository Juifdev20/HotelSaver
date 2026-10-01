-- Rapports mensuels PDF par département (cafétaria, réception), remis au patron.
-- Chaque régénération crée une nouvelle version ; les anciennes restent (statut REMPLACE).

-- CreateEnum
CREATE TYPE "DepartementRapport" AS ENUM ('CAFETERIA', 'RECEPTION');
CREATE TYPE "StatutRapport" AS ENUM ('ACTIF', 'REMPLACE');

-- CreateTable
CREATE TABLE "RapportMensuel" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "departement" "DepartementRapport" NOT NULL,
    "periode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "numero" TEXT NOT NULL,
    "provisoire" BOOLEAN NOT NULL DEFAULT false,
    "statut" "StatutRapport" NOT NULL DEFAULT 'ACTIF',
    "fichier" TEXT NOT NULL,
    "genereParId" TEXT NOT NULL,
    "genereParNom" TEXT NOT NULL,
    "genereLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiffres" JSONB NOT NULL,
    "concordant" BOOLEAN NOT NULL DEFAULT true,
    "empreinte" TEXT NOT NULL,

    CONSTRAINT "RapportMensuel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RapportMensuel_hotelId_departement_periode_version_key" ON "RapportMensuel"("hotelId", "departement", "periode", "version");
CREATE UNIQUE INDEX "RapportMensuel_hotelId_numero_key" ON "RapportMensuel"("hotelId", "numero");
CREATE INDEX "RapportMensuel_hotelId_periode_idx" ON "RapportMensuel"("hotelId", "periode");

-- AddForeignKey
ALTER TABLE "RapportMensuel" ADD CONSTRAINT "RapportMensuel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Le schéma public est exposé par PostgREST : sans RLS, la clé anon (publique) pourrait lire et
-- écrire la table — les montants mensuels y figurent. L'API passe par le rôle postgres (hors RLS) :
-- aucune policy nécessaire (même règle que 20261001100000_rls_tables_sensibles).
ALTER TABLE "RapportMensuel" ENABLE ROW LEVEL SECURITY;
