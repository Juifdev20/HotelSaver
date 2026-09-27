import * as React from "react";
import { useState } from "react";
import { Button, StatusBadge, type StatusTone } from "@hotel-chicago/ui";
import type { DonneesAjoutDomaine, DonneesCreationHotel, DonneesEnregistrementPaiement } from "@hotel-chicago/api-client";
import type { HotelAvecValidite, StatutLicence } from "@hotel-chicago/types";
import { FormulairePaiement } from "./FormulairePaiement";
import { FormulaireDomaine } from "./FormulaireDomaine";

export interface EcranHotelsProps {
  hotels: HotelAvecValidite[];
  chargement: boolean;
  erreur: string | null;
  creationEnCours: boolean;
  erreurCreation: string | null;
  onCreerHotel: (dto: DonneesCreationHotel) => void;
  onChangerStatut: (id: string, statutLicence: StatutLicence) => void;
  onEnregistrerPaiement: (hotelId: string, dto: DonneesEnregistrementPaiement) => Promise<boolean>;
  paiementEnCours: boolean;
  erreurPaiement: string | null;
  onAjouterDomaine: (hotelId: string, dto: DonneesAjoutDomaine) => Promise<boolean>;
  onVerifierDomaine: (hotelId: string) => Promise<void>;
  onRetirerDomaine: (hotelId: string) => Promise<void>;
  domaineEnCours: boolean;
  erreurDomaine: string | null;
  onDeconnexion: () => void;
}

const TONE_PAR_STATUT: Record<string, StatusTone> = {
  ESSAI: "info",
  ACTIF: "success",
  SUSPENDU: "warning",
  RESILIE: "danger",
};

const STATUTS: StatutLicence[] = ["ESSAI", "ACTIF", "SUSPENDU", "RESILIE"] as unknown as StatutLicence[];

export function EcranHotels({
  hotels,
  chargement,
  erreur,
  creationEnCours,
  erreurCreation,
  onCreerHotel,
  onChangerStatut,
  onEnregistrerPaiement,
  paiementEnCours,
  erreurPaiement,
  onAjouterDomaine,
  onVerifierDomaine,
  onRetirerDomaine,
  domaineEnCours,
  erreurDomaine,
  onDeconnexion,
}: EcranHotelsProps) {
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [hotelPourPaiement, setHotelPourPaiement] = useState<HotelAvecValidite | null>(null);
  // Par id, pas par objet : l'hôtel affiché doit refléter les données à
  // jour après chaque action (ajout/vérification/retrait), sans fermer la
  // modale entre chaque étape (voir FormulaireDomaine).
  const [idHotelPourDomaine, setIdHotelPourDomaine] = useState<string | null>(null);
  const hotelPourDomaine = hotels.find((h) => h.id === idHotelPourDomaine) ?? null;
  const [nom, setNom] = useState("");
  const [sousDomaine, setSousDomaine] = useState("");
  const [emailContact, setEmailContact] = useState("");
  const [telephoneContact, setTelephoneContact] = useState("");
  const [adresse, setAdresse] = useState("");

  function soumettreCreation(e: React.FormEvent) {
    e.preventDefault();
    onCreerHotel({
      nom: nom.trim(),
      sousDomaine: sousDomaine.trim(),
      emailContact: emailContact.trim() || undefined,
      telephoneContact: telephoneContact.trim() || undefined,
      adresse: adresse.trim() || undefined,
    });
  }

  return (
    <div className="page">
      <header className="entete">
        <h1 className="titre-page">Hôtels</h1>
        <div className="entete-actions">
          <Button variant="secondary" onClick={() => setFormulaireOuvert((v) => !v)}>
            {formulaireOuvert ? "Annuler" : "Nouvel hôtel"}
          </Button>
          <Button variant="secondary" onClick={onDeconnexion}>
            Déconnexion
          </Button>
        </div>
      </header>

      {formulaireOuvert && (
        <form className="carte" onSubmit={soumettreCreation} style={{ marginBottom: 24 }}>
          <p className="sous-titre">
            Onboarding manuel — statut ACTIF direct (jamais le formulaire public d'inscription).
          </p>

          <label className="label" htmlFor="nom">
            Nom de l'hôtel
          </label>
          <input id="nom" className="champ" value={nom} onChange={(e) => setNom(e.target.value)} />

          <label className="label" htmlFor="sous-domaine">
            Sous-domaine
          </label>
          <input
            id="sous-domaine"
            className="champ"
            value={sousDomaine}
            onChange={(e) => setSousDomaine(e.target.value.toLowerCase())}
            placeholder="hotel-chicago"
          />

          <label className="label" htmlFor="email-contact">
            Email de contact (optionnel)
          </label>
          <input id="email-contact" className="champ" value={emailContact} onChange={(e) => setEmailContact(e.target.value)} />

          <label className="label" htmlFor="telephone-contact">
            Téléphone (optionnel)
          </label>
          <input
            id="telephone-contact"
            className="champ"
            value={telephoneContact}
            onChange={(e) => setTelephoneContact(e.target.value)}
          />

          <label className="label" htmlFor="adresse">
            Adresse (optionnelle)
          </label>
          <input id="adresse" className="champ" value={adresse} onChange={(e) => setAdresse(e.target.value)} />

          {erreurCreation && (
            <p className="erreur" role="alert">
              {erreurCreation}
            </p>
          )}

          <Button type="submit" disabled={creationEnCours} style={{ marginTop: 16 }}>
            {creationEnCours ? "Création…" : "Créer l'hôtel"}
          </Button>
        </form>
      )}

      {chargement && <p>Chargement…</p>}
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      {!chargement && !erreur && (
        <table className="tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Sous-domaine</th>
              <th>Statut</th>
              <th>Valide jusqu'au</th>
              <th>Domaine</th>
              <th>Créé le</th>
              <th>Changer le statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hotels.map((hotel) => (
              <tr key={hotel.id}>
                <td>{hotel.nom}</td>
                <td>{hotel.sousDomaine}</td>
                <td>
                  <StatusBadge tone={TONE_PAR_STATUT[hotel.statutLicence] ?? "neutral"} label={hotel.statutLicence} />
                </td>
                <td>{new Date(hotel.valideJusquau).toLocaleDateString("fr-FR")}</td>
                <td>
                  {hotel.domainePersonnalise ? (
                    <Button variant="secondary" size="sm" onClick={() => setIdHotelPourDomaine(hotel.id)}>
                      {hotel.domainePersonnalise} {hotel.domaineVerifie ? "✓" : "(en attente)"}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setIdHotelPourDomaine(hotel.id)}>
                      Configurer un domaine
                    </Button>
                  )}
                </td>
                <td>{new Date(hotel.createdAt).toLocaleDateString("fr-FR")}</td>
                <td>
                  <select
                    value={hotel.statutLicence}
                    onChange={(e) => onChangerStatut(hotel.id, e.target.value as StatutLicence)}
                  >
                    {STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Button variant="secondary" size="sm" onClick={() => setHotelPourPaiement(hotel)}>
                    Enregistrer un paiement
                  </Button>
                </td>
              </tr>
            ))}
            {hotels.length === 0 && (
              <tr>
                <td colSpan={7}>Aucun hôtel pour l'instant.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {hotelPourPaiement && (
        <FormulairePaiement
          hotel={hotelPourPaiement}
          enCours={paiementEnCours}
          erreur={erreurPaiement}
          onSoumettre={async (dto) => {
            const succes = await onEnregistrerPaiement(hotelPourPaiement.id, dto);
            if (succes) setHotelPourPaiement(null);
          }}
          onFermer={() => setHotelPourPaiement(null)}
        />
      )}

      {hotelPourDomaine && (
        <FormulaireDomaine
          hotel={hotelPourDomaine}
          enCours={domaineEnCours}
          erreur={erreurDomaine}
          onAjouter={(domaine) => onAjouterDomaine(hotelPourDomaine.id, { domaine })}
          onVerifier={() => onVerifierDomaine(hotelPourDomaine.id)}
          onRetirer={async () => {
            await onRetirerDomaine(hotelPourDomaine.id);
            setIdHotelPourDomaine(null);
          }}
          onFermer={() => setIdHotelPourDomaine(null)}
        />
      )}
    </div>
  );
}
