-- Café : annuler un compte créé par erreur (19/10/2026). Jamais d'effacement : le compte passe ANNULE (trace : qui, quand, motif)
-- et ses articles retournent en stock. Voir DECISIONS.md.
ALTER TYPE "StatutCompte" ADD VALUE IF NOT EXISTS 'ANNULE';

ALTER TABLE "CompteCafeteria"
  ADD COLUMN IF NOT EXISTS "annuleLe" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "annulePar" TEXT,
  ADD COLUMN IF NOT EXISTS "motifAnnulation" TEXT;
