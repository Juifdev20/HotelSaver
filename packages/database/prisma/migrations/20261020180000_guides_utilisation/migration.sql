-- Guide d'utilisation PDF (20/10/2026) : versions publiées depuis le super-admin, fichiers dans le bucket PRIVÉ « guides ».
-- Lecture par les comptes connectés selon leur rôle, par URL signée de 5 minutes. Voir DECISIONS.md.

CREATE TYPE "TypeGuide" AS ENUM ('COMPLET', 'PATRON', 'RECEPTION', 'CAFETERIA');

CREATE TABLE "GuideUtilisation" (
    "id" TEXT NOT NULL,
    "guide" "TypeGuide" NOT NULL,
    "version" INTEGER NOT NULL,
    "fichier" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "edition" TEXT,
    "publieLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publiePar" TEXT,
    CONSTRAINT "GuideUtilisation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuideUtilisation_guide_version_key" ON "GuideUtilisation"("guide", "version");

-- RLS sur toutes les tables (bloc de 20261017120000_base_initiale) : aucun accès direct pour anon / authenticated.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
