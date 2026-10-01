-- Séparation des tâches : réglage par hôtel, désactivé par défaut.
ALTER TABLE "Hotel" ADD COLUMN "patronPeutOperer" BOOLEAN NOT NULL DEFAULT false;
