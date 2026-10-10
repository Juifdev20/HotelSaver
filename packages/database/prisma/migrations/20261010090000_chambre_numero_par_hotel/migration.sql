-- Le numéro de chambre n'est unique que PAR HÔTEL : deux hôtels doivent pouvoir avoir chacun leur chambre « 101 ».
-- (L'ancien index unique était global : le deuxième hôtel à créer « 101 » aurait reçu « existe déjà ».)
DROP INDEX IF EXISTS "Chambre_numero_key";
CREATE UNIQUE INDEX "Chambre_hotelId_numero_key" ON "Chambre"("hotelId", "numero");
