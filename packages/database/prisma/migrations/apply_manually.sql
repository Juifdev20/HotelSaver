-- Migration : StatutLigne + MenuDuJour
-- À coller dans Supabase Dashboard → SQL Editor → New query

-- 1. Enum StatutLigne
DO $$ BEGIN
  CREATE TYPE "StatutLigne" AS ENUM ('EN_ATTENTE', 'EN_PREPARATION', 'PRET', 'SERVI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colonnes sur LigneCommande
ALTER TABLE "LigneCommande"
  ADD COLUMN IF NOT EXISTS "statut" "StatutLigne" NOT NULL DEFAULT 'EN_ATTENTE',
  ADD COLUMN IF NOT EXISTS "prisEnChargeA" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pretA" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "note" TEXT;

-- 3. Index sur statut
CREATE INDEX IF NOT EXISTS "LigneCommande_statut_idx" ON "LigneCommande"("statut");

-- 4. Table MenuDuJour
CREATE TABLE IF NOT EXISTS "MenuDuJour" (
  "id"        TEXT NOT NULL,
  "hotelId"   TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "actif"     BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuDuJour_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuDuJour_hotelId_date_key" UNIQUE ("hotelId", "date"),
  CONSTRAINT "MenuDuJour_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "MenuDuJour_hotelId_idx" ON "MenuDuJour"("hotelId");

-- 5. Table MenuDuJourItem
CREATE TABLE IF NOT EXISTS "MenuDuJourItem" (
  "id"             TEXT NOT NULL,
  "menuId"         TEXT NOT NULL,
  "produitId"      TEXT NOT NULL,
  "prixSpecial"    DECIMAL(65,30),
  "deviseSpeciale" "Devise",
  CONSTRAINT "MenuDuJourItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuDuJourItem_menuId_produitId_key" UNIQUE ("menuId", "produitId"),
  CONSTRAINT "MenuDuJourItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "MenuDuJour"("id") ON DELETE CASCADE,
  CONSTRAINT "MenuDuJourItem_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id")
);
CREATE INDEX IF NOT EXISTS "MenuDuJourItem_menuId_idx" ON "MenuDuJourItem"("menuId");

-- ─────────────────────────────────────────────────────────────
-- Migration : Inventaire physique + prixAchat sur Produit
-- ─────────────────────────────────────────────────────────────

-- 6. Prix d'achat sur Produit (facultatif)
ALTER TABLE "Produit" ADD COLUMN IF NOT EXISTS "prixAchat" DECIMAL(65,30);

-- 7. Table InventairePhysique
CREATE TABLE IF NOT EXISTS "InventairePhysique" (
  "id"        TEXT NOT NULL,
  "hotelId"   TEXT NOT NULL,
  "dateDebut" DATE NOT NULL,
  "dateFin"   DATE NOT NULL,
  "titre"     TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pdfUrl"    TEXT,
  CONSTRAINT "InventairePhysique_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventairePhysique_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InventairePhysique_hotelId_idx" ON "InventairePhysique"("hotelId");

-- 8. Table InventairePhysiqueItem
CREATE TABLE IF NOT EXISTS "InventairePhysiqueItem" (
  "id"             TEXT NOT NULL,
  "inventaireId"   TEXT NOT NULL,
  "produitId"      TEXT NOT NULL,
  "stockTheorique" DECIMAL(65,30) NOT NULL,
  "stockPhysique"  DECIMAL(65,30) NOT NULL,
  "ecart"          DECIMAL(65,30) NOT NULL,
  "note"           TEXT,
  CONSTRAINT "InventairePhysiqueItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventairePhysiqueItem_inventaireId_fkey" FOREIGN KEY ("inventaireId") REFERENCES "InventairePhysique"("id") ON DELETE CASCADE,
  CONSTRAINT "InventairePhysiqueItem_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id")
);
CREATE INDEX IF NOT EXISTS "InventairePhysiqueItem_inventaireId_idx" ON "InventairePhysiqueItem"("inventaireId");

-- ─────────────────────────────────────────────────────────────
-- Migration : suivi cuisine optionnel par hôtel
-- ─────────────────────────────────────────────────────────────

-- 9. Suivi cuisine (file de production EN_ATTENTE → SERVI) : désactivé par
-- défaut — les hôtels avec plats préparés l'activent dans Paramètres.
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "cuisineActivee" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────
-- Migration : commande en ligne depuis le site public de l'hôtel
-- ─────────────────────────────────────────────────────────────

-- 10. Canal de commande en ligne : désactivé par défaut — le patron l'active
-- dans Paramètres ; le site public n'expose l'onglet « Cuisine » que si activé.
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "commandeWebActivee" BOOLEAN NOT NULL DEFAULT false;

-- 11. Carte en ligne opt-in par produit (photo/déjà existant, description libre).
ALTER TABLE "Produit" ADD COLUMN IF NOT EXISTS "commandableEnLigne" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Produit" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- 12. Commandes passées depuis le site : même convention que Reservation.origine
-- ("SITE_PUBLIC"), plus les coordonnées du client pour l'identifier au comptoir.
ALTER TABLE "CompteCafeteria" ADD COLUMN IF NOT EXISTS "origine" TEXT;
ALTER TABLE "CompteCafeteria" ADD COLUMN IF NOT EXISTS "contactClient" TEXT;
ALTER TABLE "CompteCafeteria" ADD COLUMN IF NOT EXISTS "noteClient" TEXT;

-- ─────────────────────────────────────────────────────────────
-- Migration : type de produit (plat préparé vs article de stock)
-- ─────────────────────────────────────────────────────────────

-- 13. Un PLAT est préparé (photo/description, publiable sur le site « Cuisine »,
-- passe en file de production si la cuisine interne est active, pas de stock
-- compté) ; un ARTICLE est un produit de comptoir stocké (servi directement,
-- jamais en cuisine ni sur le site). Défaut ARTICLE : les produits existants
-- étaient tous des articles de stock.
DO $$ BEGIN
  CREATE TYPE "TypeProduit" AS ENUM ('ARTICLE', 'PLAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Produit" ADD COLUMN IF NOT EXISTS "typeProduit" "TypeProduit" NOT NULL DEFAULT 'ARTICLE';

-- 14. Portions disponibles d'un PLAT (préparées pour le service) : NULL =
-- illimité (cuisine à la commande) ; sinon décrémenté à chaque vente et le
-- plat passe « Épuisé » à 0. Sans objet pour un ARTICLE (stock géré par
-- MouvementStock).
ALTER TABLE "Produit" ADD COLUMN IF NOT EXISTS "portionsDisponibles" INTEGER;

-- ─────────────────────────────────────────────────────────────
-- Migration : réception moderne (notes réservation + fiche client complète)
-- ─────────────────────────────────────────────────────────────

-- 15. Demandes spéciales du client sur la réservation (lit bébé, étage…).
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- 16. Registre de police / fidélisation : type + numéro de pièce d'identité
-- et notes libres sur la fiche client.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "typePiece" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "numeroPiece" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "notes" TEXT;
