-- Les téléphones ne tirent que les lignes dont updatedAt a changé (/sync/pull incrémental) :
-- sans ce « toucher » unique, les réservations existantes n'arriveraient jamais dans le
-- miroir local avec leur jetonSuivi (ajouté par 20261007120000_suivi_reservation).
UPDATE "Reservation" SET "updatedAt" = CURRENT_TIMESTAMP;
