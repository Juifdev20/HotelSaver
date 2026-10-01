-- Encaissement par personne : une personne peut régler sa part sans fermer tout le compte.
ALTER TABLE "SousCompte" ADD COLUMN "payeLe" TIMESTAMP(3);
ALTER TABLE "VenteCafeteria" ADD COLUMN "sousCompteId" TEXT;
