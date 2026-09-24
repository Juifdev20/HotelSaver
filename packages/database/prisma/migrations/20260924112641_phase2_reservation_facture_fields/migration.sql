-- AlterTable
ALTER TABLE "Facture" ADD COLUMN     "deviseMonnaieRendue" "Devise",
ADD COLUMN     "montantMonnaieRendue" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "annuleLe" TIMESTAMP(3),
ADD COLUMN     "motifAnnulation" TEXT;
