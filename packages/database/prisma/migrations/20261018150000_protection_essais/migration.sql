-- Protection contre les essais abusifs (18/10/2026) : essai limité, nettoyage des essais abandonnés, un essai par
-- numéro à vie, limite d'inscriptions par jour. Voir DECISIONS.md.

-- Jours d'essai propres à un hôtel (null = réglage global ; 0 = numéro qui a déjà eu un essai).
ALTER TABLE "Hotel" ADD COLUMN "joursEssai" INTEGER;

-- Réglages, modifiables dans le super-admin.
ALTER TABLE "ParametresPlateforme"
  ADD COLUMN "joursAvantSuppression" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "maxChambresEssai" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "maxProduitsEssai" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "maxPhotosGalerieEssai" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "maxInscriptionsParJour" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE "EssaiUtilise" (
    "telephoneEmpreinte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EssaiUtilise_pkey" PRIMARY KEY ("telephoneEmpreinte")
);

CREATE TABLE "InscriptionRecente" (
    "id" TEXT NOT NULL,
    "ipEmpreinte" TEXT NOT NULL,
    "appareilEmpreinte" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InscriptionRecente_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InscriptionRecente_ipEmpreinte_createdAt_idx" ON "InscriptionRecente"("ipEmpreinte", "createdAt");
CREATE INDEX "InscriptionRecente_appareilEmpreinte_createdAt_idx" ON "InscriptionRecente"("appareilEmpreinte", "createdAt");

CREATE TABLE "HotelSupprime" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "sousDomaine" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL,
    "supprimeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL,
    CONSTRAINT "HotelSupprime_pkey" PRIMARY KEY ("id")
);

-- Les hôtels créés avant cette migration n'ont pas d'empreinte : l'API l'écrit aussi au moment où elle supprime un
-- hôtel (empreinte salée, calculée côté API), donc leur numéro ne pourra pas refaire un essai après suppression.

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
