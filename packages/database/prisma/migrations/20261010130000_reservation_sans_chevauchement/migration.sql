-- Deux réservations CONFIRMEE / EN_COURS ne peuvent plus se chevaucher sur la même chambre, même si deux postes les créent au même
-- instant (le contrôle applicatif « lit puis écrit » laissait passer la course). C'est la base elle-même qui refuse.
-- Départ exclu (une chambre libérée le matin peut être réservée le soir) : intervalle [arrivée, départ[.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Reservation" a
    JOIN "Reservation" b
      ON a."chambreId" = b."chambreId" AND a."id" < b."id"
     AND a."statut" IN ('CONFIRMEE', 'EN_COURS') AND b."statut" IN ('CONFIRMEE', 'EN_COURS')
     AND a."dateArrivee" < b."dateDepart" AND b."dateArrivee" < a."dateDepart"
  ) THEN
    -- Des chevauchements existent déjà (données antérieures) : on ne bloque pas le déploiement, on prévient. À corriger à la main puis rejouer cet ADD CONSTRAINT.
    RAISE WARNING 'Contrainte reservation_chambre_sans_chevauchement NON créée : des réservations se chevauchent déjà.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_chambre_sans_chevauchement') THEN
    ALTER TABLE "Reservation"
      ADD CONSTRAINT reservation_chambre_sans_chevauchement
      EXCLUDE USING gist ("chambreId" WITH =, tsrange("dateArrivee", "dateDepart", '[)') WITH &&)
      WHERE ("statut" IN ('CONFIRMEE', 'EN_COURS'));
  END IF;
END $$;
