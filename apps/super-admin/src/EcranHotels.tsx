import * as React from "react";
import { useState } from "react";
import { Button, StatusBadge, useTitrePage, type StatusTone } from "@hotel-chicago/ui";
import type { DonneesAjoutDomaine, DonneesCreationHotel, DonneesEnregistrementPaiement, PaiementLicenceSuperAdmin } from "@hotel-chicago/api-client";
import { formaterTelephoneRdc } from "@hotel-chicago/types";
import type { FormuleAdminVue, HotelAvecValidite, HotelSupprimeVue, StatutLicence } from "@hotel-chicago/types";
import { AIDE_FORMULES } from "./fonctions";
import { FormulairePaiement } from "./FormulairePaiement";
import { FormulaireDomaine } from "./FormulaireDomaine";
import { FormulairePatron } from "./FormulairePatron";
import { PaiementsHotel } from "./PaiementsHotel";
import { HotelsSupprimes } from "./HotelsSupprimes";
import { DialogueConfirmation } from "./DialogueConfirmation";
import { EnteteApp, type Onglet } from "./EnteteApp";
import { badgeAbonnement, dateFin, libelleFormule, type HotelListe } from "./etatHotel";

export interface EcranHotelsProps {
  hotels: HotelListe[];
  /** Catalogue des formules (pour nommer celle de chaque hôtel et la changer). */
  formules: FormuleAdminVue[];
  /** Retourne `true` si la formule a été enregistrée. `null` = aucune formule. */
  onChangerFormule: (hotelId: string, formule: string | null) => Promise<boolean>;
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
  /** Numéro de connexion et/ou nouveau mot de passe du patron (15/10/2026). */
  onModifierPatron: (hotelId: string, dto: { telephone?: string; motDePasse?: string }) => Promise<boolean>;
  /** Paiements d'un hôtel et annulation d'une saisie manuelle (17/10/2026). */
  onListerPaiements: (hotelId: string) => Promise<PaiementLicenceSuperAdmin[]>;
  onAnnulerPaiement: (hotelId: string, paiementId: string, motif: string) => Promise<PaiementLicenceSuperAdmin[]>;
  /** Hôtels supprimés automatiquement (essais abandonnés, 18/10/2026). */
  onListerSupprimes: () => Promise<HotelSupprimeVue[]>;
  patronEnCours: boolean;
  erreurPatron: string | null;
  onDeconnexion: () => void;
  onChangerOnglet: (onglet: Onglet) => void;
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

/** Mise en garde propre à certains statuts. SUSPENDU posé ici est TOUJOURS une suspension manuelle (marquée côté serveur). */
const AVERTISSEMENT_STATUT: Record<string, string> = {
  SUSPENDU:
    "C'est une suspension manuelle : l'hôtel ne pourra pas rouvrir son accès en payant son abonnement dans l'application. Vous pourrez le réactiver ici (changement de statut ou paiement enregistré à la main).",
  ACTIF:
    "Le statut ne prolonge pas l'abonnement : si la date de fin est dépassée de plus de 3 jours, l'accès reste bloqué jusqu'au prochain paiement (en ligne ou enregistré à la main).",
};

/** Nom de la formule choisie dans le sélecteur ("" = Aucune). */
function nomChoixFormule(code: string, formules: FormuleAdminVue[]): string {
  return code ? libelleFormule(code, formules) : "Aucune";
}

/** Plafond de chambres de la formule de l'hôtel, comparé à son nombre de chambres quand le serveur le donne. */
function texteChambres(hotel: HotelListe, formules: FormuleAdminVue[]): string {
  const formule = hotel.formule ? formules.find((f) => f.code === hotel.formule) : undefined;
  const nombre = hotel.nombreChambres;
  if (!formule) return typeof nombre === "number" ? `${nombre} chambre${nombre > 1 ? "s" : ""}` : "";
  if (formule.maxChambres === null) return typeof nombre === "number" ? `${nombre} chambres (illimité)` : "Chambres illimitées";
  if (typeof nombre === "number") return `${nombre} / ${formule.maxChambres} chambres${nombre > formule.maxChambres ? " : plafond dépassé" : ""}`;
  return `Plafond : ${formule.maxChambres} chambres`;
}

function libelleStatut(statut: string): string {
  return LIBELLE_STATUT[statut] ?? statut;
}

export function EcranHotels({
  hotels,
  formules,
  onChangerFormule,
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
  onModifierPatron,
  onListerPaiements,
  onListerSupprimes,
  onAnnulerPaiement,
  patronEnCours,
  erreurPatron,
  onDeconnexion,
  onChangerOnglet,
}: EcranHotelsProps) {
  const [hotelPourPatron, setHotelPourPatron] = useState<HotelAvecValidite | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [hotelPourPaiement, setHotelPourPaiement] = useState<HotelListe | null>(null);
  const [hotelPourHistorique, setHotelPourHistorique] = useState<HotelListe | null>(null);
  const [voirSupprimes, setVoirSupprimes] = useState(false);
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
  const [statutAConfirmer, setStatutAConfirmer] = useState<{ hotel: HotelListe; statut: StatutLicence } | null>(null);
  const [statutEnCours, setStatutEnCours] = useState(false);
  const [messageStatut, setMessageStatut] = useState<string | null>(null);

  // Changement de formule : même principe que la licence (choisir, puis « Appliquer » ouvre une confirmation). "" = Aucune.
  const [choixFormule, setChoixFormule] = useState<Record<string, string>>({});
  const [formuleAConfirmer, setFormuleAConfirmer] = useState<{ hotel: HotelListe; formule: string } | null>(null);
  const [formuleEnCours, setFormuleEnCours] = useState(false);

  useTitrePage("Hôtels", "HotelSaver Super-Admin");

  async function appliquerFormule() {
    if (!formuleAConfirmer) return;
    const { hotel, formule } = formuleAConfirmer;
    setFormuleEnCours(true);
    setMessageStatut(null);
    const ok = await onChangerFormule(hotel.id, formule || null);
    setFormuleEnCours(false);
    setFormuleAConfirmer(null);
    if (ok) {
      setChoixFormule((courant) => {
        const { [hotel.id]: _retire, ...reste } = courant;
        return reste;
      });
      setMessageStatut(`Formule de « ${hotel.nom} » : ${libelleFormule(hotel.formule, formules)} → ${formule ? libelleFormule(formule, formules) : "Aucune"}. Enregistré, sans paiement.`);
    }
  }

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
      <EnteteApp titre="Hôtels" onglet="hotels" onChangerOnglet={onChangerOnglet}>
        <Button variant="secondary" onClick={() => setFormulaireOuvert((v) => !v)}>
          {formulaireOuvert ? "Annuler" : "Nouvel hôtel"}
        </Button>
        <Button variant="secondary" onClick={onDeconnexion}>
          Déconnexion
        </Button>
      </EnteteApp>

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

      <aside className="encart" aria-label="Aide">
        <p>{AIDE_FORMULES}</p>
      </aside>

      <div className="actions-liste">
        <Button variant="secondary" size="sm" onClick={() => setVoirSupprimes(true)}>
          Hôtels supprimés
        </Button>
      </div>

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
                <th scope="col">Patron</th>
                <th scope="col">Licence</th>
                <th scope="col">Abonnement</th>
                <th scope="col">Formule</th>
                <th scope="col">Changer la formule</th>
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
                const badge = badgeAbonnement(hotel);
                return (
                  <tr key={hotel.id}>
                    <td>{hotel.nom}</td>
                    <td>{hotel.sousDomaine}</td>
                    <td>
                      <Button variant="secondary" size="sm" onClick={() => setHotelPourPatron(hotel)}>
                        {hotel.patron?.telephone ? formaterTelephoneRdc(hotel.patron.telephone) : "Numéro à poser"}
                      </Button>
                    </td>
                    <td>
                      <StatusBadge tone={TONE_PAR_STATUT[hotel.statutLicence] ?? "neutral"} label={libelleStatut(hotel.statutLicence)} />
                    </td>
                    <td>
                      <StatusBadge tone={badge.tone} label={badge.libelle} />
                      <span className="hotel-aide">{badge.aide}</span>
                    </td>
                    <td>
                      {libelleFormule(hotel.formule, formules)}
                      <span className="hotel-aide">{texteChambres(hotel, formules)}</span>
                    </td>
                    <td>
                      <div className="cellule-statut">
                        <select
                          aria-label={`Nouvelle formule de ${hotel.nom}`}
                          value={choixFormule[hotel.id] ?? hotel.formule ?? ""}
                          onChange={(e) => setChoixFormule((courant) => ({ ...courant, [hotel.id]: e.target.value }))}
                        >
                          <option value="">Aucune</option>
                          {formules
                            .filter((f) => f.actif || f.code === hotel.formule)
                            .map((f) => (
                              <option key={f.code} value={f.code}>
                                {f.nom}
                                {f.actif ? "" : " (retirée de la vente)"}
                              </option>
                            ))}
                          {hotel.formule && !formules.some((f) => f.code === hotel.formule) && <option value={hotel.formule}>{hotel.formule}</option>}
                        </select>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={(choixFormule[hotel.id] ?? hotel.formule ?? "") === (hotel.formule ?? "") || formuleEnCours}
                          aria-label={`Appliquer la formule ${nomChoixFormule(choixFormule[hotel.id] ?? hotel.formule ?? "", formules)} à ${hotel.nom}`}
                          onClick={() => setFormuleAConfirmer({ hotel, formule: choixFormule[hotel.id] ?? hotel.formule ?? "" })}
                        >
                          Appliquer
                        </Button>
                      </div>
                    </td>
                    <td>
                      {dateFin(hotel)}
                      {hotel.suppressionLe && (
                        <span className="suppression-prevue" title="Essai jamais payé : suppression automatique (Réglages de la plateforme)">
                          Suppression le {new Date(hotel.suppressionLe).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </td>
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
                      <div className="actions-paiement">
                        <Button variant="secondary" size="sm" aria-label={`Enregistrer un paiement pour ${hotel.nom}`} onClick={() => setHotelPourPaiement(hotel)}>
                          Enregistrer un paiement
                        </Button>
                        <Button variant="secondary" size="sm" aria-label={`Voir les paiements de ${hotel.nom}`} onClick={() => setHotelPourHistorique(hotel)}>
                          Paiements
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {hotels.length === 0 && (
                <tr>
                  <td colSpan={12}>Aucun hôtel pour l'instant.</td>
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
              {AVERTISSEMENT_STATUT[statutAConfirmer.statut] && <p className="avertissement">{AVERTISSEMENT_STATUT[statutAConfirmer.statut]}</p>}
              {statutAConfirmer.hotel.statutLicence === "SUSPENDU" && statutAConfirmer.hotel.suspensionManuelle && statutAConfirmer.statut !== "SUSPENDU" && (
                <p>Cela lève la suspension manuelle : l'hôtel pourra de nouveau payer son abonnement dans l'application.</p>
              )}
            </>
          }
          libelleConfirmer={`Passer en ${libelleStatut(statutAConfirmer.statut)}`}
          destructif={statutAConfirmer.statut === "SUSPENDU" || statutAConfirmer.statut === "RESILIE"}
          enCours={statutEnCours}
          onConfirmer={() => void appliquerStatut()}
          onAnnuler={() => setStatutAConfirmer(null)}
        />
      )}

      {formuleAConfirmer && (
        <DialogueConfirmation
          titre={`Donner la formule « ${nomChoixFormule(formuleAConfirmer.formule, formules)} » à « ${formuleAConfirmer.hotel.nom} » ?`}
          message={
            <>
              <p>
                Formule actuelle : {libelleFormule(formuleAConfirmer.hotel.formule, formules) === "—" ? "Aucune" : libelleFormule(formuleAConfirmer.hotel.formule, formules)}. Nouvelle formule :{" "}
                <strong>{nomChoixFormule(formuleAConfirmer.formule, formules)}</strong>.
              </p>
              <p className="avertissement">
                Cela se fait sans paiement : c'est un geste commercial. La date de fin de l'abonnement ne change pas ; ce sont les fonctions et le plafond de chambres de la formule qui s'appliquent tout de suite.
              </p>
              {!formuleAConfirmer.formule && <p>Sans formule, l'hôtel retrouve le régime de l'essai ou, s'il a déjà payé, garde toutes les fonctions.</p>}
            </>
          }
          libelleConfirmer={formuleAConfirmer.formule ? "Changer la formule" : "Retirer la formule"}
          enCours={formuleEnCours}
          onConfirmer={() => void appliquerFormule()}
          onAnnuler={() => setFormuleAConfirmer(null)}
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

      {voirSupprimes && <HotelsSupprimes charger={onListerSupprimes} onFermer={() => setVoirSupprimes(false)} />}

      {hotelPourHistorique && (
        <PaiementsHotel
          hotelNom={hotelPourHistorique.nom}
          charger={() => onListerPaiements(hotelPourHistorique.id)}
          annuler={(paiementId, motif) => onAnnulerPaiement(hotelPourHistorique.id, paiementId, motif)}
          onFermer={() => setHotelPourHistorique(null)}
        />
      )}

      {hotelPourPatron && (
        <FormulairePatron
          hotel={hotelPourPatron}
          enCours={patronEnCours}
          erreur={erreurPatron}
          onSoumettre={async (dto) => {
            const succes = await onModifierPatron(hotelPourPatron.id, dto);
            if (succes) setHotelPourPatron(null);
          }}
          onFermer={() => setHotelPourPatron(null)}
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
