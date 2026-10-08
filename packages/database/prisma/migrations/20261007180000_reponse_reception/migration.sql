-- Réponse du réceptionniste visible par le client sur sa page de suivi
-- public — voix de l'hôtel dans l'échange demande → confirmation.
ALTER TABLE "Reservation" ADD COLUMN "reponseReception" TEXT;
