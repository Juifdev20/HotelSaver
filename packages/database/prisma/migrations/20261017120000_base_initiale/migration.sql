-- Migration de base unique (17/10/2026) : remplace les 34 migrations archivées dans prisma/migrations-archive/.
-- Appliquée sur des projets Supabase VIDES (Hotelsaver Test, Hotelsaver Prod). Voir DECISIONS.md.
-- Partie 1 : générée par `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RECEPTIONNISTE', 'CAFETARIA', 'PATRON');

-- CreateEnum
CREATE TYPE "StatutChambre" AS ENUM ('LIBRE', 'OCCUPEE', 'RESERVEE', 'NETTOYAGE');

-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('OUVERT', 'FERME');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('CASH', 'MOBILE_MONEY', 'FACTURE_CHAMBRE');

-- CreateEnum
CREATE TYPE "Devise" AS ENUM ('USD', 'CDF');

-- CreateEnum
CREATE TYPE "StatutLicence" AS ENUM ('ESSAI', 'ACTIF', 'SUSPENDU', 'RESILIE');

-- CreateEnum
CREATE TYPE "TypeProduit" AS ENUM ('ARTICLE', 'PLAT');

-- CreateEnum
CREATE TYPE "StatutLigne" AS ENUM ('EN_ATTENTE', 'EN_PREPARATION', 'PRET', 'SERVI');

-- CreateEnum
CREATE TYPE "DepartementRapport" AS ENUM ('CAFETERIA', 'RECEPTION');

-- CreateEnum
CREATE TYPE "StatutRapport" AS ENUM ('ACTIF', 'REMPLACE');

-- CreateEnum
CREATE TYPE "MethodePaiementLicence" AS ENUM ('VIREMENT', 'MOBILE_MONEY', 'ESPECES', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutPaiementAbonnement" AS ENUM ('EN_ATTENTE', 'REUSSI', 'ECHEC', 'EXPIRE');

-- CreateEnum
CREATE TYPE "OperateurMobileMoney" AS ENUM ('VODACOM', 'ORANGE', 'AIRTEL', 'AFRICELL');

-- CreateEnum
CREATE TYPE "MoyenPaiementEnLigne" AS ENUM ('MOBILE_MONEY', 'CARTE');

-- CreateEnum
CREATE TYPE "MotifRemboursement" AS ENUM ('ANNULATION_CLIENT', 'ANNULATION_HOTEL', 'NON_PRESENTATION', 'CHAMBRE_INDISPONIBLE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutRemboursement" AS ENUM ('A_FAIRE', 'EFFECTUE', 'CONSERVE');

-- CreateEnum
CREATE TYPE "ModeRemboursement" AS ENUM ('SCANLINKPAY', 'MOBILE_MONEY', 'ESPECES', 'AUTRE');

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "sousDomaine" TEXT NOT NULL,
    "statutLicence" "StatutLicence" NOT NULL DEFAULT 'ESSAI',
    "formule" TEXT,
    "suspensionManuelle" BOOLEAN NOT NULL DEFAULT false,
    "numeroScanLinkPay" TEXT,
    "boutiqueScanLinkPayId" TEXT,
    "nomScanLinkPay" TEXT,
    "pourcentageAcompte" INTEGER NOT NULL DEFAULT 0,
    "acompteFraisPayesParClient" BOOLEAN NOT NULL DEFAULT true,
    "conditionsAnnulation" TEXT,
    "patronPeutOperer" BOOLEAN NOT NULL DEFAULT false,
    "cuisineActivee" BOOLEAN NOT NULL DEFAULT false,
    "commandeWebActivee" BOOLEAN NOT NULL DEFAULT false,
    "emailContact" TEXT,
    "telephoneContact" TEXT,
    "adresse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "domainePersonnalise" TEXT,
    "domainePersonnaliseId" TEXT,
    "domaineVerifie" BOOLEAN NOT NULL DEFAULT false,
    "domaineAjouteLe" TIMESTAMP(3),

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBranding" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "policeAffichage" TEXT NOT NULL DEFAULT 'Fraunces',
    "policeCorps" TEXT NOT NULL DEFAULT 'Public Sans',
    "policeMono" TEXT NOT NULL DEFAULT 'IBM Plex Mono',
    "palette" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSite" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "slogan" TEXT,
    "presentation" TEXT,
    "couvertureUrl" TEXT,
    "galerie" TEXT[],
    "services" JSONB NOT NULL DEFAULT '[]',
    "whatsapp" TEXT,
    "horaireArrivee" TEXT,
    "horaireDepart" TEXT,
    "reception24h" BOOLEAN NOT NULL DEFAULT false,
    "lienCarte" TEXT,
    "reseaux" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "roles" "Role"[],
    "lien" JSONB NOT NULL DEFAULT '{}',
    "cleDedup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLue" (
    "notificationId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "luLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLue_pkey" PRIMARY KEY ("notificationId","utilisateurId")
);

-- CreateTable
CREATE TABLE "AppareilPush" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "plateforme" TEXT NOT NULL,
    "jeton" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereVueLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppareilPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "supabaseAuthId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telephone" TEXT,
    "email" TEXT,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaiementLicence" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "methode" "MethodePaiementLicence" NOT NULL,
    "periodeCouverteJusquau" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "enregistreParSuperAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleLe" TIMESTAMP(3),
    "annuleParSuperAdminId" TEXT,
    "motifAnnulation" TEXT,

    CONSTRAINT "PaiementLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaiementAbonnement" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "formule" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "operateur" "OperateurMobileMoney" NOT NULL,
    "telephoneMasque" TEXT NOT NULL,
    "statut" "StatutPaiementAbonnement" NOT NULL DEFAULT 'EN_ATTENTE',
    "messageErreur" TEXT,
    "modeleCommission" TEXT,
    "commissionCentimes" INTEGER,
    "totalCentimes" INTEGER,
    "referenceDemande" TEXT,
    "referenceFournisseur" TEXT,
    "cleIdempotence" TEXT NOT NULL,
    "paiementLicenceId" TEXT,
    "derniereVerificationLe" TIMESTAMP(3),
    "confirmeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaiementAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "supabaseAuthId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "telephone" TEXT,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionUtilisateur" (
    "sessionId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoqueLe" TIMESTAMP(3),

    CONSTRAINT "SessionUtilisateur_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "Chambre" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prixParNuit" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "statut" "StatutChambre" NOT NULL DEFAULT 'LIBRE',
    "photos" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Chambre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "typePiece" TEXT,
    "numeroPiece" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "chambreId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dateArrivee" TIMESTAMP(3) NOT NULL,
    "dateDepart" TIMESTAMP(3) NOT NULL,
    "acompte" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL,
    "origine" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "note" TEXT,
    "jetonSuivi" TEXT NOT NULL,
    "heureArriveePrevue" TEXT,
    "demandeClient" TEXT,
    "preEnregistreLe" TIMESTAMP(3),
    "reponseReception" TEXT,
    "arriveeLe" TIMESTAMP(3),
    "departLe" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "montantChambre" DECIMAL(65,30) NOT NULL,
    "deviseChambre" "Devise" NOT NULL,
    "montantTotalUSD" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montantTotalCDF" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "modePaiement" "ModePaiement" NOT NULL,
    "deviseRegleeParClient" "Devise",
    "montantRegleParClient" DECIMAL(65,30),
    "tauxChangeApplique" DECIMAL(65,30),
    "deviseMonnaieRendue" "Devise",
    "montantMonnaieRendue" DECIMAL(65,30),
    "numeroRecu" TEXT NOT NULL,
    "numeroProvisoire" TEXT,
    "imprimeLe" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produit" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "prix" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "typeProduit" "TypeProduit" NOT NULL DEFAULT 'ARTICLE',
    "photo" TEXT,
    "stockActuel" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "seuilAlerte" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "prixAchat" DECIMAL(65,30),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "commandableEnLigne" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "portionsDisponibles" INTEGER,
    "codeBarres" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TauxChange" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "cdfParUsd" DECIMAL(65,30) NOT NULL,
    "definiPar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TauxChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" DECIMAL(65,30) NOT NULL,
    "type" TEXT NOT NULL,
    "motif" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompteCafeteria" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "tableOuNom" TEXT NOT NULL,
    "statut" "StatutCompte" NOT NULL DEFAULT 'OUVERT',
    "origine" TEXT,
    "contactClient" TEXT,
    "noteClient" TEXT,
    "ouvertPar" TEXT NOT NULL,
    "ouvertLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fermeLe" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompteCafeteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SousCompte" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "payeLe" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SousCompte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneCommande" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "sousCompteId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" DECIMAL(65,30) NOT NULL,
    "prixUnitaire" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "statut" "StatutLigne" NOT NULL DEFAULT 'EN_ATTENTE',
    "prisEnChargeA" TIMESTAMP(3),
    "pretA" TIMESTAMP(3),
    "note" TEXT,
    "venteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LigneCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenteCafeteria" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "montantTotalUSD" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "montantTotalCDF" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "modePaiement" "ModePaiement" NOT NULL,
    "deviseRegleeParClient" "Devise",
    "montantRegleParClient" DECIMAL(65,30),
    "tauxChangeApplique" DECIMAL(65,30),
    "deviseMonnaieRendue" "Devise",
    "montantMonnaieRendue" DECIMAL(65,30),
    "reservationLieeId" TEXT,
    "sousCompteId" TEXT,
    "numeroRecu" TEXT NOT NULL,
    "numeroProvisoire" TEXT,
    "lotEncaissement" TEXT,
    "imprimeLe" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VenteCafeteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RapportMensuel" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "departement" "DepartementRapport" NOT NULL,
    "periode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "numero" TEXT NOT NULL,
    "provisoire" BOOLEAN NOT NULL DEFAULT false,
    "statut" "StatutRapport" NOT NULL DEFAULT 'ACTIF',
    "fichier" TEXT NOT NULL,
    "genereParId" TEXT NOT NULL,
    "genereParNom" TEXT NOT NULL,
    "genereLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiffres" JSONB NOT NULL,
    "concordant" BOOLEAN NOT NULL DEFAULT true,
    "empreinte" TEXT NOT NULL,

    CONSTRAINT "RapportMensuel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "departement" "DepartementRapport" NOT NULL,
    "date" DATE NOT NULL,
    "motif" TEXT NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "creeParId" TEXT NOT NULL,
    "creeParNom" TEXT NOT NULL,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "annuleeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuDuJour" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuDuJour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuDuJourItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "prixSpecial" DECIMAL(65,30),
    "deviseSpeciale" "Devise",

    CONSTRAINT "MenuDuJourItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventairePhysique" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "titre" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,

    CONSTRAINT "InventairePhysique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventairePhysiqueItem" (
    "id" TEXT NOT NULL,
    "inventaireId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "stockTheorique" DECIMAL(65,30) NOT NULL,
    "stockPhysique" DECIMAL(65,30) NOT NULL,
    "ecart" DECIMAL(65,30) NOT NULL,
    "note" TEXT,

    CONSTRAINT "InventairePhysiqueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCorrespondance" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "entiteType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "remoteId" TEXT,
    "syncVersion" INTEGER,
    "enfants" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCorrespondance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "entiteType" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormuleAbonnement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "prixMensuelUsd" DECIMAL(65,30) NOT NULL,
    "maxChambres" INTEGER,
    "fonctions" TEXT[],
    "avantages" TEXT[],
    "recommandee" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormuleAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametresPlateforme" (
    "id" TEXT NOT NULL DEFAULT 'plateforme',
    "tauxCdf" INTEGER NOT NULL DEFAULT 2800,
    "moisOffertsAnnuel" INTEGER NOT NULL DEFAULT 2,
    "joursEssai" INTEGER NOT NULL DEFAULT 14,
    "joursGrace" INTEGER NOT NULL DEFAULT 3,
    "fonctionsEssai" TEXT[],
    "fraisAbonnementPayesParClient" BOOLEAN NOT NULL DEFAULT true,
    "contactTelephone" TEXT NOT NULL DEFAULT '+243828497218',
    "contactWhatsapp" TEXT NOT NULL DEFAULT '+243828497218',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametresPlateforme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaiementReservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "devise" "Devise" NOT NULL,
    "pourcentage" INTEGER NOT NULL,
    "moyen" "MoyenPaiementEnLigne" NOT NULL,
    "operateur" "OperateurMobileMoney",
    "telephoneMasque" TEXT,
    "statut" "StatutPaiementAbonnement" NOT NULL DEFAULT 'EN_ATTENTE',
    "messageErreur" TEXT,
    "modeleCommission" TEXT NOT NULL,
    "commissionCentimes" INTEGER,
    "totalCentimes" INTEGER,
    "urlPaiement" TEXT,
    "referenceDemande" TEXT,
    "referenceFournisseur" TEXT,
    "cleIdempotence" TEXT NOT NULL,
    "numeroScanLinkPayClient" TEXT,
    "derniereVerificationLe" TIMESTAMP(3),
    "confirmeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaiementReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remboursement" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "paiementReservationId" TEXT,
    "devise" "Devise" NOT NULL,
    "montantPaye" DECIMAL(65,30) NOT NULL,
    "montantARembourser" DECIMAL(65,30) NOT NULL,
    "motif" "MotifRemboursement" NOT NULL,
    "statut" "StatutRemboursement" NOT NULL DEFAULT 'A_FAIRE',
    "mode" "ModeRemboursement",
    "destinataireScanLinkPay" TEXT,
    "destinataireTelephone" TEXT,
    "clientNom" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "traiteParId" TEXT,
    "traiteLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remboursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_sousDomaine_key" ON "Hotel"("sousDomaine");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_domainePersonnalise_key" ON "Hotel"("domainePersonnalise");

-- CreateIndex
CREATE UNIQUE INDEX "HotelBranding_hotelId_key" ON "HotelBranding"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelSite_hotelId_key" ON "HotelSite"("hotelId");

-- CreateIndex
CREATE INDEX "Notification_hotelId_createdAt_idx" ON "Notification"("hotelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_hotelId_cleDedup_key" ON "Notification"("hotelId", "cleDedup");

-- CreateIndex
CREATE UNIQUE INDEX "AppareilPush_jeton_key" ON "AppareilPush"("jeton");

-- CreateIndex
CREATE INDEX "AppareilPush_hotelId_idx" ON "AppareilPush"("hotelId");

-- CreateIndex
CREATE INDEX "AppareilPush_utilisateurId_idx" ON "AppareilPush"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_supabaseAuthId_key" ON "SuperAdmin"("supabaseAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_telephone_key" ON "SuperAdmin"("telephone");

-- CreateIndex
CREATE INDEX "PaiementLicence_hotelId_idx" ON "PaiementLicence"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_referenceFournisseur_key" ON "PaiementAbonnement"("referenceFournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_cleIdempotence_key" ON "PaiementAbonnement"("cleIdempotence");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_paiementLicenceId_key" ON "PaiementAbonnement"("paiementLicenceId");

-- CreateIndex
CREATE INDEX "PaiementAbonnement_hotelId_createdAt_idx" ON "PaiementAbonnement"("hotelId", "createdAt");

-- CreateIndex
CREATE INDEX "PaiementAbonnement_statut_createdAt_idx" ON "PaiementAbonnement"("statut", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_supabaseAuthId_key" ON "Utilisateur"("supabaseAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_telephone_key" ON "Utilisateur"("telephone");

-- CreateIndex
CREATE INDEX "Utilisateur_hotelId_idx" ON "Utilisateur"("hotelId");

-- CreateIndex
CREATE INDEX "SessionUtilisateur_utilisateurId_idx" ON "SessionUtilisateur"("utilisateurId");

-- CreateIndex
CREATE INDEX "Chambre_statut_idx" ON "Chambre"("statut");

-- CreateIndex
CREATE INDEX "Chambre_hotelId_idx" ON "Chambre"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "Chambre_hotelId_numero_key" ON "Chambre"("hotelId", "numero");

-- CreateIndex
CREATE INDEX "Client_hotelId_idx" ON "Client"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_jetonSuivi_key" ON "Reservation"("jetonSuivi");

-- CreateIndex
CREATE INDEX "Reservation_chambreId_idx" ON "Reservation"("chambreId");

-- CreateIndex
CREATE INDEX "Reservation_clientId_idx" ON "Reservation"("clientId");

-- CreateIndex
CREATE INDEX "Reservation_dateArrivee_dateDepart_idx" ON "Reservation"("dateArrivee", "dateDepart");

-- CreateIndex
CREATE INDEX "Reservation_hotelId_idx" ON "Reservation"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_reservationId_key" ON "Facture"("reservationId");

-- CreateIndex
CREATE INDEX "Facture_hotelId_idx" ON "Facture"("hotelId");

-- CreateIndex
CREATE INDEX "Facture_hotelId_numeroProvisoire_idx" ON "Facture"("hotelId", "numeroProvisoire");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_hotelId_numeroRecu_key" ON "Facture"("hotelId", "numeroRecu");

-- CreateIndex
CREATE INDEX "Produit_hotelId_idx" ON "Produit"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "Produit_hotelId_codeBarres_key" ON "Produit"("hotelId", "codeBarres");

-- CreateIndex
CREATE INDEX "TauxChange_hotelId_idx" ON "TauxChange"("hotelId");

-- CreateIndex
CREATE INDEX "MouvementStock_produitId_idx" ON "MouvementStock"("produitId");

-- CreateIndex
CREATE INDEX "MouvementStock_hotelId_idx" ON "MouvementStock"("hotelId");

-- CreateIndex
CREATE INDEX "CompteCafeteria_statut_idx" ON "CompteCafeteria"("statut");

-- CreateIndex
CREATE INDEX "CompteCafeteria_hotelId_idx" ON "CompteCafeteria"("hotelId");

-- CreateIndex
CREATE INDEX "SousCompte_compteId_idx" ON "SousCompte"("compteId");

-- CreateIndex
CREATE INDEX "SousCompte_hotelId_idx" ON "SousCompte"("hotelId");

-- CreateIndex
CREATE INDEX "LigneCommande_venteId_idx" ON "LigneCommande"("venteId");

-- CreateIndex
CREATE INDEX "LigneCommande_sousCompteId_idx" ON "LigneCommande"("sousCompteId");

-- CreateIndex
CREATE INDEX "LigneCommande_produitId_idx" ON "LigneCommande"("produitId");

-- CreateIndex
CREATE INDEX "LigneCommande_hotelId_idx" ON "LigneCommande"("hotelId");

-- CreateIndex
CREATE INDEX "LigneCommande_statut_idx" ON "LigneCommande"("statut");

-- CreateIndex
CREATE INDEX "VenteCafeteria_compteId_idx" ON "VenteCafeteria"("compteId");

-- CreateIndex
CREATE INDEX "VenteCafeteria_hotelId_idx" ON "VenteCafeteria"("hotelId");

-- CreateIndex
CREATE INDEX "VenteCafeteria_hotelId_numeroProvisoire_idx" ON "VenteCafeteria"("hotelId", "numeroProvisoire");

-- CreateIndex
CREATE UNIQUE INDEX "VenteCafeteria_hotelId_numeroRecu_key" ON "VenteCafeteria"("hotelId", "numeroRecu");

-- CreateIndex
CREATE INDEX "RapportMensuel_hotelId_periode_idx" ON "RapportMensuel"("hotelId", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "RapportMensuel_hotelId_departement_periode_version_key" ON "RapportMensuel"("hotelId", "departement", "periode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RapportMensuel_hotelId_numero_key" ON "RapportMensuel"("hotelId", "numero");

-- CreateIndex
CREATE INDEX "Depense_hotelId_departement_date_idx" ON "Depense"("hotelId", "departement", "date");

-- CreateIndex
CREATE INDEX "MenuDuJour_hotelId_idx" ON "MenuDuJour"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuDuJour_hotelId_date_key" ON "MenuDuJour"("hotelId", "date");

-- CreateIndex
CREATE INDEX "MenuDuJourItem_menuId_idx" ON "MenuDuJourItem"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuDuJourItem_menuId_produitId_key" ON "MenuDuJourItem"("menuId", "produitId");

-- CreateIndex
CREATE INDEX "InventairePhysique_hotelId_idx" ON "InventairePhysique"("hotelId");

-- CreateIndex
CREATE INDEX "InventairePhysiqueItem_inventaireId_idx" ON "InventairePhysiqueItem"("inventaireId");

-- CreateIndex
CREATE INDEX "SyncCorrespondance_createdAt_idx" ON "SyncCorrespondance"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCorrespondance_hotelId_entiteType_localId_key" ON "SyncCorrespondance"("hotelId", "entiteType", "localId");

-- CreateIndex
CREATE INDEX "Suppression_hotelId_createdAt_idx" ON "Suppression"("hotelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormuleAbonnement_code_key" ON "FormuleAbonnement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementReservation_referenceFournisseur_key" ON "PaiementReservation"("referenceFournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementReservation_cleIdempotence_key" ON "PaiementReservation"("cleIdempotence");

-- CreateIndex
CREATE INDEX "PaiementReservation_hotelId_reservationId_idx" ON "PaiementReservation"("hotelId", "reservationId");

-- CreateIndex
CREATE INDEX "PaiementReservation_statut_createdAt_idx" ON "PaiementReservation"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "Remboursement_hotelId_statut_idx" ON "Remboursement"("hotelId", "statut");

-- CreateIndex
CREATE INDEX "Remboursement_reservationId_idx" ON "Remboursement"("reservationId");

-- AddForeignKey
ALTER TABLE "HotelBranding" ADD CONSTRAINT "HotelBranding_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSite" ADD CONSTRAINT "HotelSite_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLue" ADD CONSTRAINT "NotificationLue_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppareilPush" ADD CONSTRAINT "AppareilPush_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppareilPush" ADD CONSTRAINT "AppareilPush_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementLicence" ADD CONSTRAINT "PaiementLicence_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementLicence" ADD CONSTRAINT "PaiementLicence_enregistreParSuperAdminId_fkey" FOREIGN KEY ("enregistreParSuperAdminId") REFERENCES "SuperAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementAbonnement" ADD CONSTRAINT "PaiementAbonnement_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementAbonnement" ADD CONSTRAINT "PaiementAbonnement_paiementLicenceId_fkey" FOREIGN KEY ("paiementLicenceId") REFERENCES "PaiementLicence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionUtilisateur" ADD CONSTRAINT "SessionUtilisateur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chambre" ADD CONSTRAINT "Chambre_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_chambreId_fkey" FOREIGN KEY ("chambreId") REFERENCES "Chambre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produit" ADD CONSTRAINT "Produit_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TauxChange" ADD CONSTRAINT "TauxChange_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompteCafeteria" ADD CONSTRAINT "CompteCafeteria_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SousCompte" ADD CONSTRAINT "SousCompte_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SousCompte" ADD CONSTRAINT "SousCompte_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteCafeteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_sousCompteId_fkey" FOREIGN KEY ("sousCompteId") REFERENCES "SousCompte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenteCafeteria" ADD CONSTRAINT "VenteCafeteria_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenteCafeteria" ADD CONSTRAINT "VenteCafeteria_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteCafeteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RapportMensuel" ADD CONSTRAINT "RapportMensuel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuDuJour" ADD CONSTRAINT "MenuDuJour_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuDuJourItem" ADD CONSTRAINT "MenuDuJourItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "MenuDuJour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuDuJourItem" ADD CONSTRAINT "MenuDuJourItem_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventairePhysique" ADD CONSTRAINT "InventairePhysique_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventairePhysiqueItem" ADD CONSTRAINT "InventairePhysiqueItem_inventaireId_fkey" FOREIGN KEY ("inventaireId") REFERENCES "InventairePhysique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventairePhysiqueItem" ADD CONSTRAINT "InventairePhysiqueItem_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCorrespondance" ADD CONSTRAINT "SyncCorrespondance_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementReservation" ADD CONSTRAINT "PaiementReservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remboursement" ADD CONSTRAINT "Remboursement_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remboursement" ADD CONSTRAINT "Remboursement_paiementReservationId_fkey" FOREIGN KEY ("paiementReservationId") REFERENCES "PaiementReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================================================================
-- Ce que Prisma ne sait pas exprimer (état final des 34 migrations précédentes, archivées dans prisma/migrations-archive/)
-- =====================================================================================================================

-- Deux réservations CONFIRMEE / EN_COURS ne peuvent pas se chevaucher sur la même chambre, même créées au même instant
-- par deux postes : c'est la base qui refuse. Départ exclu ([arrivée, départ[) : une chambre libérée le matin se
-- réserve le soir.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_chambre_sans_chevauchement
  EXCLUDE USING gist ("chambreId" WITH =, tsrange("dateArrivee", "dateDepart", '[)') WITH &&)
  WHERE ("statut" IN ('CONFIRMEE', 'EN_COURS'));

-- Rôle de l'utilisateur Supabase connecté (clé anon/authenticated). L'API, elle, se connecte en rôle postgres et
-- contourne la RLS : ces policies ne protègent que l'accès direct à PostgREST.
CREATE OR REPLACE FUNCTION public.role_utilisateur_courant()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role::text
  from "Utilisateur"
  where "supabaseAuthId" = auth.uid()::text
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.controle_ecriture_chambre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- NEW est NULL sur un DELETE : le renvoyer annulerait silencieusement toute suppression.
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$function$;

CREATE TRIGGER trg_controle_ecriture_chambre
  BEFORE INSERT OR DELETE OR UPDATE ON public."Chambre"
  FOR EACH ROW EXECUTE FUNCTION controle_ecriture_chambre();

-- Policies (accès direct PostgREST par rôle). Aucune pour anon : le site public passe par l'API.
CREATE POLICY chambre_delete_patron ON "Chambre" FOR DELETE USING (role_utilisateur_courant() = 'PATRON');
CREATE POLICY chambre_insert_patron ON "Chambre" FOR INSERT WITH CHECK (role_utilisateur_courant() = 'PATRON');
CREATE POLICY chambre_select ON "Chambre" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY chambre_update ON "Chambre" FOR UPDATE
  USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']))
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));

CREATE POLICY client_insert ON "Client" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY client_select ON "Client" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY client_update ON "Client" FOR UPDATE
  USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']))
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));

CREATE POLICY comptecafeteria_insert ON "CompteCafeteria" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY comptecafeteria_select ON "CompteCafeteria" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY comptecafeteria_update ON "CompteCafeteria" FOR UPDATE
  USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']))
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));

CREATE POLICY facture_insert ON "Facture" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY facture_select ON "Facture" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY facture_update ON "Facture" FOR UPDATE
  USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']))
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));

CREATE POLICY lignecommande_insert ON "LigneCommande" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY lignecommande_select ON "LigneCommande" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));

CREATE POLICY mouvementstock_insert ON "MouvementStock" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY mouvementstock_select ON "MouvementStock" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));

CREATE POLICY produit_delete_patron ON "Produit" FOR DELETE USING (role_utilisateur_courant() = 'PATRON');
CREATE POLICY produit_insert_patron ON "Produit" FOR INSERT WITH CHECK (role_utilisateur_courant() = 'PATRON');
CREATE POLICY produit_select ON "Produit" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY produit_update_patron ON "Produit" FOR UPDATE
  USING (role_utilisateur_courant() = 'PATRON')
  WITH CHECK (role_utilisateur_courant() = 'PATRON');

CREATE POLICY reservation_insert_staff ON "Reservation" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY reservation_select ON "Reservation" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));
CREATE POLICY reservation_update ON "Reservation" FOR UPDATE
  USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']))
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'PATRON']));

CREATE POLICY souscompte_insert ON "SousCompte" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY souscompte_select ON "SousCompte" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));

CREATE POLICY tauxchange_insert_patron ON "TauxChange" FOR INSERT WITH CHECK (role_utilisateur_courant() = 'PATRON');
CREATE POLICY tauxchange_select ON "TauxChange" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['RECEPTIONNISTE', 'CAFETARIA', 'PATRON']));

CREATE POLICY utilisateur_select ON "Utilisateur" FOR SELECT
  USING (role_utilisateur_courant() = 'PATRON' OR "supabaseAuthId" = auth.uid()::text);
CREATE POLICY utilisateur_update_patron ON "Utilisateur" FOR UPDATE
  USING (role_utilisateur_courant() = 'PATRON')
  WITH CHECK (role_utilisateur_courant() = 'PATRON');
CREATE POLICY utilisateur_write_patron ON "Utilisateur" FOR INSERT WITH CHECK (role_utilisateur_courant() = 'PATRON');

CREATE POLICY ventecafeteria_insert ON "VenteCafeteria" FOR INSERT WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY ventecafeteria_select ON "VenteCafeteria" FOR SELECT USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));
CREATE POLICY ventecafeteria_update ON "VenteCafeteria" FOR UPDATE
  USING (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']))
  WITH CHECK (role_utilisateur_courant() = ANY (ARRAY['CAFETARIA', 'PATRON']));

-- Données de départ : formules et réglages de la plateforme (éditables ensuite dans le super-admin).
INSERT INTO "FormuleAbonnement" ("id","code","nom","description","prixMensuelUsd","maxChambres","fonctions","avantages","recommandee","actif","ordre","updatedAt") VALUES
 (gen_random_uuid()::text,'ESSENTIEL','Essentiel','Pour un petit hôtel qui démarre.',29,15,ARRAY['RECEPTION'],ARRAY['Réception et réservations','Facturation et reçus imprimés','Double devise USD / CDF','Application mobile et ordinateur'],false,true,1,CURRENT_TIMESTAMP),
 (gen_random_uuid()::text,'PRO','Pro','Pour un hôtel avec cafétaria et réservations en ligne.',59,40,ARRAY['RECEPTION','CAFETERIA','SITE_PUBLIC','ACOMPTE_EN_LIGNE'],ARRAY['Fonctionnement hors ligne et synchronisation','Site public de réservation à vos couleurs','Acompte payé en ligne par Mobile Money ou carte'],true,true,2,CURRENT_TIMESTAMP),
 (gen_random_uuid()::text,'PREMIUM','Premium','Pour les établissements qui veulent leur propre identité.',99,NULL,ARRAY['RECEPTION','CAFETERIA','SITE_PUBLIC','DOMAINE_PERSONNALISE','ACOMPTE_EN_LIGNE'],ARRAY['Accompagnement à la mise en route','Support prioritaire'],false,true,3,CURRENT_TIMESTAMP);
INSERT INTO "ParametresPlateforme" ("id","fonctionsEssai","updatedAt")
  VALUES ('plateforme',ARRAY['RECEPTION','CAFETERIA','SITE_PUBLIC','DOMAINE_PERSONNALISE','ACOMPTE_EN_LIGNE'],CURRENT_TIMESTAMP);

-- En dernier : RLS sur TOUTES les tables du schéma public. RLS sans policy = aucun accès direct pour anon /
-- authenticated (la clé anon est publique, embarquée dans les apps) ; l'API (rôle postgres, rolbypassrls) n'est pas
-- concernée. Idempotent ; à rejouer dans toute migration qui ajoute une table.
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
