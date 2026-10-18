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

-- CreateIndex
CREATE UNIQUE INDEX "FormuleAbonnement_code_key" ON "FormuleAbonnement"("code");


-- Comme toutes les tables : RLS sans policy.
ALTER TABLE "FormuleAbonnement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParametresPlateforme" ENABLE ROW LEVEL SECURITY;

-- Valeurs de départ (celles de la page d'accueil) : le super-admin les modifie ensuite depuis son écran.
INSERT INTO "FormuleAbonnement" ("id","code","nom","description","prixMensuelUsd","maxChambres","fonctions","avantages","recommandee","actif","ordre","updatedAt") VALUES
 (gen_random_uuid()::text,'ESSENTIEL','Essentiel','Pour un petit hôtel qui démarre.',29,15,ARRAY['RECEPTION'],ARRAY['Réception et réservations','Facturation et reçus imprimés','Double devise USD / CDF','Application mobile et ordinateur'],false,true,1,CURRENT_TIMESTAMP),
 (gen_random_uuid()::text,'PRO','Pro','Pour un hôtel avec cafétaria et réservations en ligne.',59,40,ARRAY['RECEPTION','CAFETERIA','SITE_PUBLIC','ACOMPTE_EN_LIGNE'],ARRAY['Fonctionnement hors ligne et synchronisation','Site public de réservation à vos couleurs','Acompte payé en ligne par Mobile Money ou carte'],true,true,2,CURRENT_TIMESTAMP),
 (gen_random_uuid()::text,'PREMIUM','Premium','Pour les établissements qui veulent leur propre identité.',99,NULL,ARRAY['RECEPTION','CAFETERIA','SITE_PUBLIC','DOMAINE_PERSONNALISE','ACOMPTE_EN_LIGNE'],ARRAY['Accompagnement à la mise en route','Support prioritaire'],false,true,3,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "ParametresPlateforme" ("id","fonctionsEssai","updatedAt") VALUES ('plateforme',ARRAY['RECEPTION','CAFETERIA','SITE_PUBLIC','DOMAINE_PERSONNALISE','ACOMPTE_EN_LIGNE'],CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
