-- ============================================================================
-- HotelSaver — activer la RLS (sécurité par ligne) sur toutes les tables
-- À COLLER dans Supabase : « SQL Editor » > « New query » > « Run ».
-- Sans danger : rejouable autant de fois que voulu, ne supprime ni ne modifie
-- aucune donnée, et l'API HotelSaver continue de fonctionner (elle se connecte
-- avec le rôle postgres, qui contourne la RLS).
-- ============================================================================

-- ÉTAPE 1 — AVANT : liste des tables SANS protection (doit montrer au moins
-- MenuDuJour, MenuDuJourItem, InventairePhysique, InventairePhysiqueItem).
SELECT c.relname AS table_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;

-- ÉTAPE 2 — Active la RLS partout où elle manque.
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
    RAISE NOTICE 'RLS activée sur %', t.relname;
  END LOOP;
END $$;

-- ÉTAPE 3 — APRÈS : doit renvoyer 0 ligne (toutes les tables sont protégées).
SELECT c.relname AS table_encore_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- ÉTAPE 4 (facultative) — Le rôle de l'API doit bien contourner la RLS : doit
-- afficher « true » pour postgres.
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'postgres';
