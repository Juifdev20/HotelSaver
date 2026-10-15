-- Connexion par numéro de téléphone (15/10/2026) : numéro RDC normalisé
-- (« +243XXXXXXXXX ») comme identifiant de connexion, e-mail optionnel.
-- Colonnes nullables : les comptes existants restent valides (connexion par e-mail).

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN "telephone" TEXT;
ALTER TABLE "SuperAdmin" ADD COLUMN "telephone" TEXT;
ALTER TABLE "SuperAdmin" ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_telephone_key" ON "Utilisateur"("telephone");
CREATE UNIQUE INDEX "SuperAdmin_telephone_key" ON "SuperAdmin"("telephone");
