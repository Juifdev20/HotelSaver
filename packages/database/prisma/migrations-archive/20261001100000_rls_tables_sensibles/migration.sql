-- Sécurité : ces tables n'avaient PAS de RLS. Le schéma public étant exposé par
-- PostgREST, la clé anon (publique, embarquée dans les apps) pouvait les lire,
-- les modifier et les supprimer — comptes Super-Admin et paiements de licence
-- compris. On active la RLS sans aucune policy : anon et authenticated n'ont plus
-- aucun accès direct ; l'API NestJS passe par le rôle postgres, qui contourne la
-- RLS (vérifié : rolbypassrls = true), et reste donc inchangée.
ALTER TABLE "Hotel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HotelBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaiementLicence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SuperAdmin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
