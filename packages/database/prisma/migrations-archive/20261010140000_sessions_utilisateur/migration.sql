-- Sessions vues par l'API : permet de révoquer l'accès d'un employé (mot de passe changé, compte désactivé) même s'il garde un jeton de rafraîchissement.
CREATE TABLE "SessionUtilisateur" (
    "sessionId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoqueLe" TIMESTAMP(3),

    CONSTRAINT "SessionUtilisateur_pkey" PRIMARY KEY ("sessionId")
);

CREATE INDEX "SessionUtilisateur_utilisateurId_idx" ON "SessionUtilisateur"("utilisateurId");

ALTER TABLE "SessionUtilisateur" ADD CONSTRAINT "SessionUtilisateur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comme toutes les tables : RLS sans policy (la clé anon publique ne doit rien pouvoir lire ni écrire).
ALTER TABLE "SessionUtilisateur" ENABLE ROW LEVEL SECURITY;
