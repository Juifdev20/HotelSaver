-- CreateEnum
CREATE TYPE "MethodePaiementLicence" AS ENUM ('VIREMENT', 'MOBILE_MONEY', 'ESPECES', 'AUTRE');

-- CreateTable
CREATE TABLE "PaiementLicence" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "methode" "MethodePaiementLicence" NOT NULL,
    "periodeCouverteJusquau" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "enregistreParSuperAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaiementLicence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaiementLicence_hotelId_idx" ON "PaiementLicence"("hotelId");

-- AddForeignKey
ALTER TABLE "PaiementLicence" ADD CONSTRAINT "PaiementLicence_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementLicence" ADD CONSTRAINT "PaiementLicence_enregistreParSuperAdminId_fkey" FOREIGN KEY ("enregistreParSuperAdminId") REFERENCES "SuperAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
