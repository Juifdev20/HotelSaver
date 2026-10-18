-- Suivi de la réservation par le client depuis le site de l'hôtel + pré-enregistrement en ligne.
-- jetonSuivi : secret du lien « Ma réservation ». Les réservations existantes reçoivent chacune
-- un jeton aléatoire (gen_random_uuid, Postgres 13+) ; les nouvelles le reçoivent de Prisma.

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "jetonSuivi" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "Reservation" ALTER COLUMN "jetonSuivi" DROP DEFAULT;
ALTER TABLE "Reservation" ADD COLUMN "heureArriveePrevue" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "demandeClient" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "preEnregistreLe" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_jetonSuivi_key" ON "Reservation"("jetonSuivi");
