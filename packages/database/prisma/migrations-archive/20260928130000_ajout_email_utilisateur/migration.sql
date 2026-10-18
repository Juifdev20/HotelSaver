-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");
