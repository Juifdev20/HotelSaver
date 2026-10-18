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

-- CreateIndex
CREATE UNIQUE INDEX "Notification_hotelId_cleDedup_key" ON "Notification"("hotelId", "cleDedup");
CREATE INDEX "Notification_hotelId_createdAt_idx" ON "Notification"("hotelId", "createdAt");
CREATE UNIQUE INDEX "AppareilPush_jeton_key" ON "AppareilPush"("jeton");
CREATE INDEX "AppareilPush_hotelId_idx" ON "AppareilPush"("hotelId");
CREATE INDEX "AppareilPush_utilisateurId_idx" ON "AppareilPush"("utilisateurId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationLue" ADD CONSTRAINT "NotificationLue_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppareilPush" ADD CONSTRAINT "AppareilPush_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppareilPush" ADD CONSTRAINT "AppareilPush_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Le schéma public est exposé par PostgREST : sans RLS, la clé anon (publique) pourrait lire et
-- écrire ces tables — jetons push compris. L'API passe par le rôle postgres (hors RLS) : aucune
-- policy n'est nécessaire (même règle que 20261001100000_rls_tables_sensibles).
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationLue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppareilPush" ENABLE ROW LEVEL SECURITY;