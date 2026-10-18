-- Dépenses par département (réception, cafétaria), saisies par le personnel,
-- consultées par le patron. Annulation tracée, jamais de suppression physique.

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "departement" "DepartementRapport" NOT NULL,
    "date" DATE NOT NULL,
    "motif" TEXT NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "creeParId" TEXT NOT NULL,
    "creeParNom" TEXT NOT NULL,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "annuleeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Depense_hotelId_departement_date_idx" ON "Depense"("hotelId", "departement", "date");

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Même règle que RapportMensuel : schéma public exposé par PostgREST, l'API passe par le rôle
-- postgres (hors RLS) — RLS activée sans policy pour fermer l'accès à la clé anon.
ALTER TABLE "Depense" ENABLE ROW LEVEL SECURITY;
