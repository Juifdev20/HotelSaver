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

-- CreateIndex
CREATE UNIQUE INDEX "HotelSite_hotelId_key" ON "HotelSite"("hotelId");

-- AddForeignKey
ALTER TABLE "HotelSite" ADD CONSTRAINT "HotelSite_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Le schéma public est exposé par PostgREST : sans RLS, la clé anon (publique)
-- pourrait lire ET écrire cette table. L'API passe par le rôle postgres, qui
-- contourne la RLS ; aucune policy n'est donc nécessaire.
ALTER TABLE "HotelSite" ENABLE ROW LEVEL SECURITY;
