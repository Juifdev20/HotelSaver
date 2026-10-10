import * as React from "react";
import { useState } from "react";
import { Button, StatusBadge, useTitrePage, type StatusTone } from "@hotel-chicago/ui";
import type { DonneesAjoutDomaine, DonneesCreationHotel, DonneesEnregistrementPaiement } from "@hotel-chicago/api-client";
import type { HotelAvecValidite, StatutLicence } from "@hotel-chicago/types";
import { FormulairePaiement } from "./FormulairePaiement";
import { FormulaireDomaine } from "./FormulaireDomaine";
import { DialogueConfirmation } from "./DialogueConfirmation";

export interface EcranHotelsProps {
  hotels: HotelAvecValidite[];
  chargement: boolean;
  erreur: string | null;
  creationEnCours: boolean;
  erreurCreation: string | null;
  onCreerHotel: (dto: DonneesCreationHotel) => void;
  /** Retourne `true` si le changement a été enregistré. */
  onChangerStatut: (id: string, statutLicence: StatutLicence) => Promise<boolean>;
  onEnregistrerPaiement: (hotelId: string, dto: DonneesEnregistrementPaiement) => Promise<boolean>;
  paiementEnCours: boolean;
  erreurPaiement: string | null;
  onAjouterDomaine: (hotelId: string, dto: DonneesAjoutDomaine) => Promise<boolean>;
  onVerifierDomaine: (hotelId: string) => Promise<void>;
  onRetirerDomaine: (hotelId: string) => Promise<boolean>;
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

const LIBELLE_STATUT: Record<string, string> = {
  ESSAI: "Essai",
  ACTIF: "Actif",
  SUSPENDU: "Suspendu",
  RESILIE: "Résilié",
};

/** Ce que le changement de licence provoque côté hôtel, dit en clair avant de confirmer. */
const CONSEQUENCE_STATUT: Record<string, string> = {
  ESSAI: "L'hôtel repasse en période d'essai.",
  ACTIF: "L'hôtel retrouve l'accès complet à l'application et à son site.",
  SUSPENDU: "L'hôtel et son personnel perdent l'accès à l'application et le site public de l'hôtel n'est plus disponible, jusqu'à la prochaine réactivation.",
  RESILIE: "L'hôtel et son personnel perdent l'accès à l'application et le site public de l'hôtel n'est plus disponible.",
};

function libelleStatut(statut: string): string {
  return LIBELLE_STATUT[statut] ?? statut;
}

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
  // Changement de licence : on CHOISIT dans la liste, puis « Appliquer » ouvre une confirmation (jamais d'effet au simple choix).
  const [choixStatut, setChoixStatut] = useState<Record<string, StatutLicence>>({});
  const [statutAConfirmer, setStatutAConfirmer] = useState<{ hotel: HotelAvecValidite; statut: StatutLicence } | null>(null);
  const [statutEnCours, setStatutEnCours] = useState(false);
  const [messageStatut, setMessageStatut] = useState<string | null>(null);

  useTitrePage("Hôtels", "HotelSaver Super-Admin");

  async function appliquerStatut() {
    if (!statutAConfirmer) return;
    const { hotel, statut } = statutAConfirmer;
    setStatutEnCours(true);
    setMessageStatut(null);
    const ok = await onChangerStatut(hotel.id, statut);
    setStatutEnCours(false);
    setStatutAConfirmer(null);
    if (ok) {
      setChoixStatut((courant) => {
        const { [hotel.id]: _retire, ...reste } = courant;
        return reste;
      });
      setMessageStatut(`Licence de « ${hotel.nom} » : ${libelleStatut(hotel.statutLicence)} → ${libelleStatut(statut)}. Enregistré.`);
    }
  }

  // Pendant un rechargement, la liste déjà affichée reste visible (elle ne disparaît pas sous les doigts).
  const afficherTableau = hotels.length > 0 || (!chargement && !erreur);

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
        <div className="marque">
          <img className="marque__logo" src="/logo-hotelsaver.png" alt="HotelSaver" />
          <h1 className="titre-page">Hôtels</h1>
        </div>
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

      {chargement && (
        <p role="status" className="chargement">
          {hotels.length === 0 ? "Chargement des hôtels…" : "Actualisation…"}
        </p>
      )}
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {messageStatut && (
        <p className="succes" role="status">
          {messageStatut}
        </p>
      )}

      {afficherTableau && (
        <div className="tableau-defilant">
          <table className="tableau">
            <caption className="visuellement-cache">Liste des hôtels</caption>
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Sous-domaine</th>
                <th scope="col">Statut</th>
                <th scope="col">Valide jusqu'au</th>
                <th scope="col">Domaine</th>
                <th scope="col">Créé le</th>
                <th scope="col">Changer le statut</th>
                <th scope="col">
                  <span className="visuellement-cache">Paiement</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((hotel) => {
                const choix = choixStatut[hotel.id] ?? hotel.statutLicence;
                return (
                  <tr key={hotel.id}>
                    <td>{hotel.nom}</td>
                    <td>{hotel.sousDomaine}</td>
                    <td>
                      <StatusBadge tone={TONE_PAR_STATUT[hotel.statutLicence] ?? "neutral"} label={libelleStatut(hotel.statutLicence)} />
                    </td>
                    <td>{new Date(hotel.valideJusquau).toLocaleDateString("fr-FR")}</td>
                    <td>
                      {hotel.domainePersonnalise ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Domaine de ${hotel.nom} : ${hotel.domainePersonnalise}, ${hotel.domaineVerifie ? "vérifié" : "en attente de vérification"}`}
                          onClick={() => setIdHotelPourDomaine(hotel.id)}
                        >
                          {hotel.domainePersonnalise} {hotel.domaineVerifie ? "✓" : "(en attente)"}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Configurer un domaine pour ${hotel.nom}`}
                          onClick={() => setIdHotelPourDomaine(hotel.id)}
                        >
                          Configurer un domaine
                        </Button>
                      )}
                    </td>
                    <td>{new Date(hotel.createdAt).toLocaleDateString("fr-FR")}</td>
                    <td>
                      <div className="cellule-statut">
                        <select
                          aria-label={`Nouveau statut de la licence de ${hotel.nom}`}
                          value={choix}
                          onChange={(e) => setChoixStatut((courant) => ({ ...courant, [hotel.id]: e.target.value as StatutLicence }))}
                        >
                          {STATUTS.map((st) => (
                            <option key={st} value={st}>
                              {libelleStatut(st)}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={choix === hotel.statutLicence || statutEnCours}
                          aria-label={`Appliquer le statut ${libelleStatut(choix)} à ${hotel.nom}`}
                          onClick={() => setStatutAConfirmer({ hotel, statut: choix })}
                        >
                          Appliquer
                        </Button>
                      </div>
                    </td>
                    <td>
                      <Button variant="secondary" size="sm" aria-label={`Enregistrer un paiement pour ${hotel.nom}`} onClick={() => setHotelPourPaiement(hotel)}>
                        Enregistrer un paiement
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {hotels.length === 0 && (
                <tr>
                  <td colSpan={8}>Aucun hôtel pour l'instant.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {statutAConfirmer && (
        <DialogueConfirmation
          titre={`Passer « ${statutAConfirmer.hotel.nom} » en ${libelleStatut(statutAConfirmer.statut)} ?`}
          message={
            <>
              <p>
                Statut actuel : {libelleStatut(statutAConfirmer.hotel.statutLicence)}. Nouveau statut : <strong>{libelleStatut(statutAConfirmer.statut)}</strong>.
              </p>
              <p>{CONSEQUENCE_STATUT[statutAConfirmer.statut] ?? ""}</p>
            </>
          }
          libelleConfirmer={`Passer en ${libelleStatut(statutAConfirmer.statut)}`}
          destructif={statutAConfirmer.statut === "SUSPENDU" || statutAConfirmer.statut === "RESILIE"}
          enCours={statutEnCours}
          onConfirmer={() => void appliquerStatut()}
          onAnnuler={() => setStatutAConfirmer(null)}
        />
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
            const retire = await onRetirerDomaine(hotelPourDomaine.id);
            if (retire) setIdHotelPourDomaine(null);
          }}
          onFermer={() => setIdHotelPourDomaine(null)}
        />
      )}
    </div>
  );
}
