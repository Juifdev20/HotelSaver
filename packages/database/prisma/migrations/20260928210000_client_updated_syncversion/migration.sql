-- Phase 16 : rend Client pullable par GET /sync/pull — le pull incrémental
-- filtre sur "updatedAt" > curseur (même convention que les autres entités
-- synchronisées, section 10.3). Les lignes existantes récupèrent la valeur
-- par défaut puis le trigger @updatedAt prend le relais.
ALTER TABLE "Client"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "syncVersion" INTEGER NOT NULL DEFAULT 1;
