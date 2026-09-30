-- Policies RLS Supabase — Hôtel Chicago
-- Reflète exactement la matrice CRUD de la section 9.3 du prompt d'origine.
--
-- IMPORTANT (voir DECISIONS.md) : le backend NestJS (apps/api) se connecte à
-- Supabase avec la clé service_role, qui CONTOURNE la RLS. L'enforcement
-- réel des permissions pour les clients de l'API passe par SupabaseAuthGuard
-- + RolesGuard (apps/api/src/common/guards). Cette RLS est une seconde ligne
-- de défense pour tout accès direct futur à Supabase (ex. un module de
-- synchronisation qui interrogerait PostgREST avec le jeton de l'utilisateur
-- plutôt que de passer par l'API).
--
-- À exécuter (SQL Editor Supabase, ou `psql "$DATABASE_URL" -f rls-policies.sql`)
-- une fois la migration initiale Prisma appliquée (les tables doivent exister).

-- ============================================================================
-- Fonction utilitaire : rôle métier de l'utilisateur courant
-- (le rôle vit dans la table Utilisateur, pas dans le jeton Supabase Auth)
-- ============================================================================
create or replace function public.role_utilisateur_courant()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from "Utilisateur"
  where "supabaseAuthId" = auth.uid()::text
  limit 1
$$;

-- ============================================================================
-- Activation de la RLS sur toutes les tables métier
-- ============================================================================
alter table "Utilisateur" enable row level security;
alter table "Chambre" enable row level security;
alter table "Client" enable row level security;
alter table "Reservation" enable row level security;
alter table "Facture" enable row level security;
alter table "Produit" enable row level security;
alter table "TauxChange" enable row level security;
alter table "MouvementStock" enable row level security;
alter table "CompteCafeteria" enable row level security;
alter table "SousCompte" enable row level security;
alter table "LigneCommande" enable row level security;
alter table "VenteCafeteria" enable row level security;

-- ============================================================================
-- Utilisateur — seul PATRON gère les comptes (section 9.3 : "Comptes
-- utilisateurs"). Un utilisateur peut lire sa propre ligne (profil).
-- ============================================================================
create policy "utilisateur_select" on "Utilisateur"
  for select
  using (
    public.role_utilisateur_courant() = 'PATRON'
    or "supabaseAuthId" = auth.uid()::text
  );

create policy "utilisateur_write_patron" on "Utilisateur"
  for insert
  with check (public.role_utilisateur_courant() = 'PATRON');

create policy "utilisateur_update_patron" on "Utilisateur"
  for update
  using (public.role_utilisateur_courant() = 'PATRON')
  with check (public.role_utilisateur_courant() = 'PATRON');
-- Pas de policy DELETE : aucune suppression physique (désactivation via `actif`).

-- ============================================================================
-- Chambre — Réceptionniste : lecture + modification du statut uniquement.
-- Patron : accès total. Aucun accès anon : le site public passe par l'API (/public/*).
-- Cafétaria : aucun accès (matrice 9.3).
-- ============================================================================
create policy "chambre_select" on "Chambre"
  for select
  using (
    public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON')
  );

create policy "chambre_insert_patron" on "Chambre"
  for insert
  with check (public.role_utilisateur_courant() = 'PATRON');

create policy "chambre_update" on "Chambre"
  for update
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'))
  with check (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

-- Contrairement à Reservation/Facture/VenteCafeteria, une Chambre n'est pas une
-- donnée financière : la matrice 9.3 autorise explicitement PATRON à la
-- "Supprimer" (ex. chambre retirée du service). ChambresService.remove()
-- refuse déjà la suppression si des réservations existent encore (contrainte FK).
create policy "chambre_delete_patron" on "Chambre"
  for delete
  using (public.role_utilisateur_courant() = 'PATRON');

-- Trigger complémentaire : un RECEPTIONNISTE ne peut modifier QUE le statut
-- (et les photos) d'une chambre, jamais numero/type/prixParNuit/devise —
-- la RLS seule ne peut pas restreindre au niveau colonne.
create or replace function public.controle_ecriture_chambre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.role_utilisateur_courant();
begin
  if v_role = 'RECEPTIONNISTE' then
    if TG_OP in ('INSERT', 'DELETE') then
      raise exception 'Seul PATRON peut créer ou supprimer une chambre.';
    end if;
    if TG_OP = 'UPDATE' then
      if NEW."numero" is distinct from OLD."numero"
         or NEW."type" is distinct from OLD."type"
         or NEW."prixParNuit" is distinct from OLD."prixParNuit"
         or NEW."devise" is distinct from OLD."devise" then
        raise exception 'RECEPTIONNISTE ne peut modifier que le statut ou les photos d''une chambre, jamais son prix ou son type.';
      end if;
    end if;
  end if;
  -- NEW est NULL sur un trigger DELETE (seul OLD existe alors) : renvoyer NEW
  -- sans condition annulerait silencieusement TOUTE suppression de chambre,
  -- quel que soit le rôle — bug réel trouvé en testant le vrai endpoint DELETE
  -- (Phase 2), où PATRON se voyait refuser une suppression qu'il devrait pouvoir faire.
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger trg_controle_ecriture_chambre
  before insert or update or delete on "Chambre"
  for each row execute function public.controle_ecriture_chambre();

-- ============================================================================
-- Client — créé par la réception ou via une pré-réservation du site public.
-- ============================================================================
create policy "client_select" on "Client"
  for select
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

create policy "client_insert" on "Client"
  for insert
  with check (
    public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON')
  );

create policy "client_update" on "Client"
  for update
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'))
  with check (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

-- ============================================================================
-- Reservation — Réceptionniste + Patron gèrent tout. Cafétaria : aucun accès.
-- Les demandes du site public passent par l'API (POST /public/reservations), jamais
-- par un accès direct anon.
-- ============================================================================
create policy "reservation_select" on "Reservation"
  for select
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

create policy "reservation_insert_staff" on "Reservation"
  for insert
  with check (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

create policy "reservation_update" on "Reservation"
  for update
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'))
  with check (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));
-- Pas de policy DELETE : annulation tracée uniquement (statut = 'ANNULEE').

-- ============================================================================
-- Facture — Réceptionniste crée/imprime, Patron lit/annule. Jamais de
-- suppression physique (section 9, section 17).
-- ============================================================================
create policy "facture_select" on "Facture"
  for select
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

create policy "facture_insert" on "Facture"
  for insert
  with check (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));

create policy "facture_update" on "Facture"
  for update
  using (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'))
  with check (public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'PATRON'));
-- Pas de policy DELETE.
-- Note : la restriction plus fine ("qui peut annuler avec motif" = PATRON
-- seul, section 9.3) est appliquée par le RolesGuard de l'endpoint NestJS
-- `POST /factures/:id/annuler` (Phase 2), pas par cette RLS de table.

-- ============================================================================
-- Produit (menu) — Réceptionniste : aucun accès. Cafétaria : lecture seule.
-- Patron : accès total. Aucun accès anon : le menu public passe par l'API.
-- ============================================================================
create policy "produit_select" on "Produit"
  for select
  using (
    public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON')
  );

create policy "produit_insert_patron" on "Produit"
  for insert
  with check (public.role_utilisateur_courant() = 'PATRON');

create policy "produit_update_patron" on "Produit"
  for update
  using (public.role_utilisateur_courant() = 'PATRON')
  with check (public.role_utilisateur_courant() = 'PATRON');

create policy "produit_delete_patron" on "Produit"
  for delete
  using (public.role_utilisateur_courant() = 'PATRON');

-- ============================================================================
-- TauxChange — lu par tous les rôles internes (et le site public si activé),
-- écrit uniquement par PATRON (section 7, section 9.4). Jamais modifié/supprimé
-- une fois créé : c'est un historique.
-- ============================================================================
create policy "tauxchange_select" on "TauxChange"
  for select
  using (
    public.role_utilisateur_courant() in ('RECEPTIONNISTE', 'CAFETARIA', 'PATRON')
  );

create policy "tauxchange_insert_patron" on "TauxChange"
  for insert
  with check (public.role_utilisateur_courant() = 'PATRON');
-- Pas de policy UPDATE/DELETE : historique immuable.

-- ============================================================================
-- MouvementStock — Réceptionniste : aucun accès. Cafétaria : créer + lire.
-- Patron : lecture + ajustements (nouvelles lignes AJUSTEMENT, jamais
-- d'édition rétroactive : c'est un journal, append-only).
-- ============================================================================
create policy "mouvementstock_select" on "MouvementStock"
  for select
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "mouvementstock_insert" on "MouvementStock"
  for insert
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));
-- Pas de policy UPDATE/DELETE : journal de stock append-only.

-- ============================================================================
-- CompteCafeteria / SousCompte / LigneCommande / VenteCafeteria —
-- Réceptionniste : aucun accès (matrice 9.3). Cafétaria : gère tout le cycle
-- de vie (ouverture, sous-comptes, lignes, encaissement). Patron : accès
-- total en lecture/écriture, jamais de suppression physique d'une vente
-- (annulation tracée uniquement, section 9.2).
-- ============================================================================
create policy "comptecafeteria_select" on "CompteCafeteria"
  for select
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "comptecafeteria_insert" on "CompteCafeteria"
  for insert
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "comptecafeteria_update" on "CompteCafeteria"
  for update
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'))
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "souscompte_select" on "SousCompte"
  for select
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "souscompte_insert" on "SousCompte"
  for insert
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "lignecommande_select" on "LigneCommande"
  for select
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "lignecommande_insert" on "LigneCommande"
  for insert
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "ventecafeteria_select" on "VenteCafeteria"
  for select
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "ventecafeteria_insert" on "VenteCafeteria"
  for insert
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));

create policy "ventecafeteria_update" on "VenteCafeteria"
  for update
  using (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'))
  with check (public.role_utilisateur_courant() in ('CAFETARIA', 'PATRON'));
-- Pas de policy DELETE sur CompteCafeteria/SousCompte/LigneCommande/VenteCafeteria :
-- aucune suppression physique d'une vente ou d'une commande (section 9.2, section 17).
