-- Plus aucun accès direct pour la clé anon (publique, embarquée dans les apps).
-- Le site public passe par l'API (/public/*, rôle postgres qui contourne la RLS) :
-- les policies « anon » de rls-policies.sql ne servent plus et exposaient les
-- chambres et produits (stock compris) de tous les hôtels, le taux de change, et
-- laissaient n'importe qui insérer des clients et des réservations en contournant
-- les contrôles de l'API (disponibilité, hôtel résolu, statut).

ALTER POLICY "chambre_select" ON "Chambre"
  USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE'::text, 'PATRON'::text]));

ALTER POLICY "produit_select" ON "Produit"
  USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA'::text, 'PATRON'::text]));

ALTER POLICY "tauxchange_select" ON "TauxChange"
  USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE'::text, 'CAFETARIA'::text, 'PATRON'::text]));

ALTER POLICY "client_insert" ON "Client"
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE'::text, 'PATRON'::text]));

DROP POLICY "reservation_insert_public" ON "Reservation";
