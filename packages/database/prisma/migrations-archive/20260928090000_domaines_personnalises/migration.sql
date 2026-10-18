-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN "domainePersonnalise" TEXT;
ALTER TABLE "Hotel" ADD COLUMN "domainePersonnaliseId" TEXT;
ALTER TABLE "Hotel" ADD COLUMN "domaineVerifie" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Hotel" ADD COLUMN "domaineAjouteLe" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_domainePersonnalise_key" ON "Hotel"("domainePersonnalise");
