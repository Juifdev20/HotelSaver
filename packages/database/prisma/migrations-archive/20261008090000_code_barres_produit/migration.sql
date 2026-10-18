-- Code-barres des produits de comptoir (scan à la caisse cafétaria). Unique par hôtel ;
-- NULL autorisé plusieurs fois (Postgres ne compare pas les NULL dans un index unique).

-- AlterTable
ALTER TABLE "Produit" ADD COLUMN "codeBarres" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Produit_hotelId_codeBarres_key" ON "Produit"("hotelId", "codeBarres");
