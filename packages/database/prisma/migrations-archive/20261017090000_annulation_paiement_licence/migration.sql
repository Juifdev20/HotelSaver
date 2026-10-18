-- Annulation d'un paiement d'abonnement saisi à la main (17/10/2026) : la ligne reste (traçabilité),
-- marquée annulée elle ne compte plus nulle part. Colonnes nullables : les paiements existants restent valides.

-- AlterTable
ALTER TABLE "PaiementLicence" ADD COLUMN "annuleLe" TIMESTAMP(3);
ALTER TABLE "PaiementLicence" ADD COLUMN "annuleParSuperAdminId" TEXT;
ALTER TABLE "PaiementLicence" ADD COLUMN "motifAnnulation" TEXT;
