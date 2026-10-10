-- Sécurité : active la RLS sur TOUTES les tables du schéma public qui ne l'ont pas
-- encore (trouvées sans RLS : MenuDuJour, MenuDuJourItem, InventairePhysique,
-- InventairePhysiqueItem, et peut-être SyncCorrespondance / Suppression).
-- Sans RLS, la clé anon (publique, embarquée dans les apps) peut lire et modifier
-- ces tables via PostgREST, tous hôtels confondus. RLS sans policy = aucun accès
-- direct pour anon/authenticated ; l'API (rôle postgres, rolbypassrls = true) n'est
-- pas affectée. Idempotent : rejouable sans risque, et couvre aussi les tables
-- ajoutées plus tard.
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
