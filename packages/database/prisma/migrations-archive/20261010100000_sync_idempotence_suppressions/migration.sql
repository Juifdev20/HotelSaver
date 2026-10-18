-- Synchronisation hors ligne : idempotence des envois et suppressions propagées aux appareils.

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
CREATE UNIQUE INDEX "SyncCorrespondance_hotelId_entiteType_localId_key" ON "SyncCorrespondance"("hotelId", "entiteType", "localId");
CREATE INDEX "SyncCorrespondance_createdAt_idx" ON "SyncCorrespondance"("createdAt");
ALTER TABLE "SyncCorrespondance" ADD CONSTRAINT "SyncCorrespondance_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "entiteType" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Suppression_hotelId_createdAt_idx" ON "Suppression"("hotelId", "createdAt");
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accès réservé à l'API (clé service_role), comme les autres tables sensibles.
ALTER TABLE "SyncCorrespondance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suppression" ENABLE ROW LEVEL SECURITY;
