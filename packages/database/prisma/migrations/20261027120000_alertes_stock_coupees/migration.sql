-- Alertes de stock répétées toutes les 24 h tant que le stock n'est pas rechargé, que chaque utilisateur peut couper lui-même (27/10/2026).
-- produitId = id du produit, ou '*' pour toutes les alertes de stock. Voir DECISIONS.md.

CREATE TABLE "AlerteStockCoupee" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlerteStockCoupee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlerteStockCoupee_utilisateurId_produitId_key" ON "AlerteStockCoupee"("utilisateurId", "produitId");
CREATE INDEX "AlerteStockCoupee_hotelId_produitId_idx" ON "AlerteStockCoupee"("hotelId", "produitId");
ALTER TABLE "AlerteStockCoupee" ADD CONSTRAINT "AlerteStockCoupee_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlerteStockCoupee" ADD CONSTRAINT "AlerteStockCoupee_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS sur toute table du schéma public (aucun accès direct pour anon / authenticated ; l'API, rôle postgres, n'est pas concernée).
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
