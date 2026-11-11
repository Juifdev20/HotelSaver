import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";
import type { DonneesActivationLicence, DonneesMaintenanceManuelle } from "@hotel-chicago/api-client";
import { dateAbonnement } from "@hotel-chicago/regles";
import { Devise, MethodePaiementLicence } from "@hotel-chicago/types";
import type { FichierDocumentVue, LicenceHotelVue, LicencesHotelVue, PaiementMaintenanceVue } from "@hotel-chicago/types";

const LIBELLE_METHODE: Record<string, string> = { VIREMENT: "Virement", MOBILE_MONEY: "Mobile Money", ESPECES: "Espèces", AUTRE: "Autre" };
const date = (iso: string) => dateAbonnement(iso);
const somme = (m: number, devise: string | null) => `${m.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${devise === "CDF" ? "FC" : "$"}`;
const nombre = (saisie: string): number | null => {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
};

/** Documents de preuve d'une licence (11/11/2026) : chaque appel renvoie un fichier à télécharger. */
export interface DocumentsLicence {
  contrat: (licenceId: string) => Promise<FichierDocumentVue>;
  recu: (licenceId: string) => Promise<FichierDocumentVue>;
  dossier: (licenceId: string) => Promise<FichierDocumentVue>;
  signe: (licenceId: string) => Promise<FichierDocumentVue>;
  recuMaintenance: (paiementId: string) => Promise<FichierDocumentVue>;
  envoyerSigne: (licenceId: string, fichier: File) => Promise<void>;
}

/** Enregistre sur l'ordinateur un document reçu de l'API (contenu en base64). */
export function telechargerDocument(f: FichierDocumentVue): void {
  const octets = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([octets], { type: f.type }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = f.nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface LicenceHotelProps {
  hotelNom: string;
  charger: () => Promise<LicencesHotelVue>;
  activer: (dto: DonneesActivationLicence) => Promise<LicencesHotelVue>;
  annuler: (licenceId: string, motif: string) => Promise<LicencesHotelVue>;
  enregistrerMaintenance: (dto: DonneesMaintenanceManuelle) => Promise<LicencesHotelVue>;
  annulerMaintenance: (paiementId: string, motif: string) => Promise<LicencesHotelVue>;
  documents: DocumentsLicence;
  /** Appelée après chaque changement : la liste des hôtels se met à jour (badge, échéance). */
  onChange: () => void;
  onFermer: () => void;
}

type Annulation = { type: "licence"; licence: LicenceHotelVue } | { type: "maintenance"; paiement: PaiementMaintenanceVue };

/**
 * Licence d'un hôtel (11/11/2026) : activer une licence de 1, 2 ou 3 ans après réception de l'argent en main propre, voir où en est la
 * maintenance mensuelle, enregistrer une maintenance reçue à la main, annuler une saisie erronée (motif obligatoire, jamais effacée).
 */
export function LicenceHotel({ hotelNom, charger, activer, annuler, enregistrerMaintenance, annulerMaintenance, documents, onChange, onFermer }: LicenceHotelProps) {
  const idTitre = useId();
  const ref = useDialogue<HTMLDivElement>({ onEchap: onFermer });
  const [vue, setVue] = useState<LicencesHotelVue | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // activation
  const [annees, setAnnees] = useState<1 | 2 | 3>(1);
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [frais, setFrais] = useState("");
  const [note, setNote] = useState("");
  // maintenance à la main
  const [maintenanceOuverte, setMaintenanceOuverte] = useState(false);
  const [mois, setMois] = useState<1 | 3 | 6 | 12>(1);
  const [montantM, setMontantM] = useState("");
  const [deviseM, setDeviseM] = useState<Devise>(Devise.USD);
  const [methodeM, setMethodeM] = useState<MethodePaiementLicence>(MethodePaiementLicence.ESPECES);
  const [noteM, setNoteM] = useState("");
  // annulation
  const [aAnnuler, setAAnnuler] = useState<Annulation | null>(null);
  const [motif, setMotif] = useState("");

  useEffect(() => {
    charger().then(setVue).catch((e: Error) => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function executer(action: () => Promise<LicencesHotelVue>, succes: string) {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      setVue(await action());
      setMessage(succes);
      onChange();
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'opération a échoué.");
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function soumettreActivation(e: React.FormEvent) {
    e.preventDefault();
    const m = montant.trim() === "" ? undefined : nombre(montant);
    if (m === null) return setErreur("Le montant reçu doit être un nombre (2 décimales au plus), ou laissé vide.");
    const f = frais.trim() === "" ? null : nombre(frais);
    if (f !== null && f < 0.5) return setErreur("Les frais de maintenance de cet hôtel doivent être d'au moins 0,50 $.");
    const ok = await executer(
      () => activer({ annees, ...(m !== undefined && { montant: m, devise }), fraisMaintenanceUsd: f, ...(note.trim() && { note: note.trim() }) }),
      `Licence de ${annees} an${annees > 1 ? "s" : ""} activée : l'hôtel a toutes les fonctions.`
    );
    if (ok) {
      setMontant("");
      setFrais("");
      setNote("");
    }
  }

  async function soumettreMaintenance(e: React.FormEvent) {
    e.preventDefault();
    const m = nombre(montantM);
    if (m === null || m <= 0) return setErreur("Le montant doit être un nombre positif.");
    const ok = await executer(
      () => enregistrerMaintenance({ mois, montant: m, devise: deviseM, methode: methodeM, ...(noteM.trim() && { note: noteM.trim() }) }),
      `Maintenance enregistrée : ${mois * 30} jours de plus.`
    );
    if (ok) {
      setMontantM("");
      setNoteM("");
      setMaintenanceOuverte(false);
    }
  }

  /** Télécharge un document de preuve ; recharge ensuite la liste (le numéro d'une licence ancienne est créé à la première demande). */
  async function recupererDocument(action: () => Promise<FichierDocumentVue>) {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      telechargerDocument(await action());
      setVue(await charger());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le document n'a pas pu être créé.");
    } finally {
      setEnCours(false);
    }
  }

  async function envoyerSigne(licenceId: string, fichier: File | undefined) {
    if (!fichier) return;
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      await documents.envoyerSigne(licenceId, fichier);
      setVue(await charger());
      setMessage("Contrat signé enregistré dans le dossier de l'hôtel.");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'envoi du contrat signé a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerAnnulation() {
    if (!aAnnuler) return;
    if (motif.trim().length < 5) return setErreur("Indiquez le motif de l'annulation (5 caractères au moins).");
    const ok = await executer(
      () => (aAnnuler.type === "licence" ? annuler(aAnnuler.licence.id, motif.trim()) : annulerMaintenance(aAnnuler.paiement.id, motif.trim())),
      "Annulation enregistrée."
    );
    if (ok) {
      setAAnnuler(null);
      setMotif("");
    }
  }

  const etat = vue?.etat;
  const enCoursLicence = vue?.licences.find((l) => l.id === vue.licenceEnCoursId);

  return (
    <div className="fond-modale" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div ref={ref} className="carte paiements-hotel licence-hotel" role="dialog" aria-modal="true" aria-labelledby={idTitre}>
        <h2 id={idTitre} className="titre">
          Licence — {hotelNom}
        </h2>
        <p className="sous-titre">
          Une licence de 1, 2 ou 3 ans, payée en main propre, donne toutes les fonctions à l'hôtel. Il ne paie ensuite que les frais de maintenance, tous les 30 jours (le premier mois est compris).
        </p>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}
        {message && (
          <p className="succes" role="status">
            {message}
          </p>
        )}
        {vue === null && !erreur && <p>Chargement…</p>}

        {vue && etat && (
          <section className="licence-hotel__etat" aria-label="Situation actuelle">
            {etat.licence && enCoursLicence ? (
              <>
                <strong>Licence de {etat.licence.annees} an{etat.licence.annees > 1 ? "s" : ""} en cours</strong>
                <span>
                  Du {date(etat.licence.debutLe)} au {date(etat.licence.finLe)} ({etat.licence.joursRestantsLicence} jours restants).
                </span>
                <span>
                  Maintenance ({somme(etat.licence.fraisMaintenanceUsd, "USD")} par 30 jours) payée jusqu'au <strong>{date(etat.valideJusquau)}</strong> —{" "}
                  {etat.statut === "EXPIRE" ? "IMPAYÉE : accès bloqué" : etat.statut === "EN_GRACE" ? "échue, délai de grâce en cours" : `${Math.max(0, etat.joursRestants)} jours restants`}.
                </span>
              </>
            ) : (
              <span>Cet hôtel n'a pas de licence en cours : il paie l'abonnement mensuel habituel.</span>
            )}
          </section>
        )}

        {vue && (
          <form className="licence-hotel__bloc" onSubmit={(e) => void soumettreActivation(e)} noValidate>
            <h3>Activer une licence</h3>
            <p className="aide-champ">À faire seulement après avoir reçu l'argent. Si une licence court encore, la nouvelle commence à sa fin.</p>
            <fieldset className="groupe-cases">
              <legend className="label">Durée</legend>
              {([1, 2, 3] as const).map((a) => (
                <label key={a} className="case">
                  <input type="radio" name="annees" checked={annees === a} onChange={() => setAnnees(a)} /> {a} an{a > 1 ? "s" : ""}
                </label>
              ))}
            </fieldset>
            <div className="grille-formulaire">
              <div>
                <label className="label" htmlFor="lic-montant">
                  Somme reçue (facultatif)
                </label>
                <input id="lic-montant" className="champ" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Pour mémoire" />
              </div>
              <div>
                <label className="label" htmlFor="lic-devise">
                  Devise
                </label>
                <select id="lic-devise" className="champ" value={devise} onChange={(e) => setDevise(e.target.value as Devise)}>
                  <option value={Devise.USD}>USD</option>
                  <option value={Devise.CDF}>CDF</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="lic-frais">
                  Frais de maintenance de cet hôtel ($ par mois)
                </label>
                <input id="lic-frais" className="champ" inputMode="decimal" value={frais} onChange={(e) => setFrais(e.target.value)} placeholder={`Par défaut : ${vue.fraisMaintenanceParDefautUsd} $`} />
              </div>
              <div>
                <label className="label" htmlFor="lic-note">
                  Note (facultatif)
                </label>
                <input id="lic-note" className="champ" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Reçu en main propre le…" />
              </div>
            </div>
            <Button type="submit" disabled={enCours} style={{ marginTop: 14 }}>
              {enCours ? "Activation…" : `Activer la licence de ${annees} an${annees > 1 ? "s" : ""}`}
            </Button>
          </form>
        )}

        {vue && vue.licences.length > 0 && (
          <section className="licence-hotel__bloc">
            <h3>Licences</h3>
            <ul className="paiements-hotel__liste">
              {vue.licences.map((l) => (
                <li key={l.id} className={l.annuleLe ? "paiements-hotel__ligne paiements-hotel__ligne--annule" : "paiements-hotel__ligne"}>
                  <div className="paiements-hotel__infos">
                    <strong className="paiements-hotel__montant">
                      {l.annees} an{l.annees > 1 ? "s" : ""} · du {date(l.debutLe)} au {date(l.finLe)}
                    </strong>
                    <span>
                      {l.montant !== null ? `${somme(l.montant, l.devise)} reçus · ` : ""}
                      {l.fraisMaintenanceUsd !== null ? `maintenance ${somme(l.fraisMaintenanceUsd, "USD")}/mois (propre à l'hôtel)` : "maintenance au tarif de la plateforme"}
                    </span>
                    <span className="paiements-hotel__source">
                      Activée le {date(l.createdAt)}
                      {l.enregistreParNom ? ` par ${l.enregistreParNom}` : ""}
                      {l.note ? ` — « ${l.note} »` : ""}
                    </span>
                    {l.annuleLe && (
                      <span className="paiements-hotel__motif">
                        Annulée le {date(l.annuleLe)} : {l.motifAnnulation}
                      </span>
                    )}
                    <div className="licence-hotel__preuve" aria-label={`Preuve d'achat de la licence du ${date(l.debutLe)}`}>
                      <span>
                        <strong>Contrat :</strong> {l.numero ? `n° ${l.numero}` : "numéro créé au premier téléchargement"}
                      </span>
                      <span className={l.accepteLe ? "licence-hotel__ok" : "licence-hotel__attente"}>
                        {l.accepteLe ? `Accepté dans l'application le ${date(l.accepteLe)}${l.accepteParNom ? ` par ${l.accepteParNom}` : ""}` : "Pas encore accepté par le patron dans l'application"}
                      </span>
                      <span className={l.scanEnvoyeLe ? "licence-hotel__ok" : "licence-hotel__attente"}>
                        {l.scanEnvoyeLe ? `Exemplaire signé reçu le ${date(l.scanEnvoyeLe)}` : "Pas encore de contrat signé sur papier"}
                      </span>
                      <div className="licence-hotel__boutons">
                        <Button variant="secondary" size="sm" disabled={enCours} onClick={() => void recupererDocument(() => documents.contrat(l.id))}>
                          Contrat (PDF)
                        </Button>
                        <Button variant="secondary" size="sm" disabled={enCours} onClick={() => void recupererDocument(() => documents.recu(l.id))}>
                          Reçu de licence (PDF)
                        </Button>
                        <Button size="sm" disabled={enCours} onClick={() => void recupererDocument(() => documents.dossier(l.id))}>
                          Dossier de preuve (PDF)
                        </Button>
                        {l.scanEnvoyeLe && (
                          <Button variant="secondary" size="sm" disabled={enCours} onClick={() => void recupererDocument(() => documents.signe(l.id))}>
                            Voir le contrat signé
                          </Button>
                        )}
                        {!l.annuleLe && (
                          <label className="licence-hotel__envoi">
                            <span className="bouton bouton--secondaire bouton--petit">{l.scanEnvoyeLe ? "Remplacer le contrat signé" : "Ajouter le contrat signé"}</span>
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png"
                              disabled={enCours}
                              onChange={(e) => {
                                void envoyerSigne(l.id, e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                  {l.annuleLe ? (
                    <span className="paiements-hotel__etiquette">Annulée</span>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setAAnnuler({ type: "licence", licence: l })} aria-label={`Annuler la licence de ${l.annees} an${l.annees > 1 ? "s" : ""} du ${date(l.debutLe)}`}>
                      Annuler cette licence
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {vue && (
          <section className="licence-hotel__bloc">
            <h3>Frais de maintenance</h3>
            {vue.licenceEnCoursId && !maintenanceOuverte && (
              <Button variant="secondary" size="sm" onClick={() => setMaintenanceOuverte(true)}>
                Enregistrer une maintenance reçue à la main
              </Button>
            )}
            {maintenanceOuverte && (
              <form onSubmit={(e) => void soumettreMaintenance(e)} noValidate className="licence-hotel__sous-formulaire">
                <div className="grille-formulaire">
                  <div>
                    <label className="label" htmlFor="m-mois">
                      Durée payée
                    </label>
                    <select id="m-mois" className="champ" value={mois} onChange={(e) => setMois(Number(e.target.value) as 1 | 3 | 6 | 12)}>
                      {([1, 3, 6, 12] as const).map((n) => (
                        <option key={n} value={n}>
                          {n} mois ({n * 30} jours)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="m-montant">
                      Montant reçu
                    </label>
                    <input id="m-montant" className="champ" inputMode="decimal" value={montantM} onChange={(e) => setMontantM(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="m-devise">
                      Devise
                    </label>
                    <select id="m-devise" className="champ" value={deviseM} onChange={(e) => setDeviseM(e.target.value as Devise)}>
                      <option value={Devise.USD}>USD</option>
                      <option value={Devise.CDF}>CDF</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="m-methode">
                      Méthode
                    </label>
                    <select id="m-methode" className="champ" value={methodeM} onChange={(e) => setMethodeM(e.target.value as MethodePaiementLicence)}>
                      {Object.entries(LIBELLE_METHODE).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="label" htmlFor="m-note">
                  Note (facultatif)
                </label>
                <input id="m-note" className="champ" value={noteM} maxLength={200} onChange={(e) => setNoteM(e.target.value)} />
                <div className="paiements-hotel__actions">
                  <Button type="submit" disabled={enCours}>
                    {enCours ? "Enregistrement…" : "Enregistrer la maintenance"}
                  </Button>
                  <Button variant="secondary" onClick={() => setMaintenanceOuverte(false)} disabled={enCours}>
                    Fermer
                  </Button>
                </div>
              </form>
            )}
            {vue.maintenances.length === 0 ? (
              <p className="aide-champ">Aucun paiement de maintenance pour l'instant.</p>
            ) : (
              <ul className="paiements-hotel__liste">
                {vue.maintenances.map((p) => (
                  <li key={p.id} className={p.annuleLe ? "paiements-hotel__ligne paiements-hotel__ligne--annule" : "paiements-hotel__ligne"}>
                    <div className="paiements-hotel__infos">
                      <strong className="paiements-hotel__montant">
                        {somme(p.montant, p.devise)} · {p.mois} mois
                      </strong>
                      <span>
                        {date(p.createdAt)} · {LIBELLE_METHODE[p.methode] ?? p.methode} · couvre jusqu'au {date(p.periodeCouverteJusquau)}
                      </span>
                      <span className="paiements-hotel__source">
                        {p.source === "EN_LIGNE" ? "Payé en ligne (ScanLinkPay)" : `Saisi à la main${p.enregistreParNom ? ` par ${p.enregistreParNom}` : ""}`}
                        {p.note ? ` — « ${p.note} »` : ""}
                      </span>
                      {p.annuleLe && (
                        <span className="paiements-hotel__motif">
                          Annulé le {date(p.annuleLe)} : {p.motifAnnulation}
                        </span>
                      )}
                    </div>
                    <Button variant="secondary" size="sm" disabled={enCours} onClick={() => void recupererDocument(() => documents.recuMaintenance(p.id))}>
                      {p.numeroRecu ? `Reçu ${p.numeroRecu}` : "Reçu (PDF)"}
                    </Button>
                    {p.annuleLe ? (
                      <span className="paiements-hotel__etiquette">Annulé</span>
                    ) : p.source === "MANUEL" ? (
                      <Button variant="danger" size="sm" onClick={() => setAAnnuler({ type: "maintenance", paiement: p })}>
                        Annuler
                      </Button>
                    ) : (
                      <span className="paiements-hotel__etiquette paiements-hotel__etiquette--ok">Reçu</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aAnnuler && (
          <div className="paiements-hotel__confirmation">
            <h3>{aAnnuler.type === "licence" ? `Annuler la licence de ${aAnnuler.licence.annees} an${aAnnuler.licence.annees > 1 ? "s" : ""} ?` : `Annuler la maintenance de ${somme(aAnnuler.paiement.montant, aAnnuler.paiement.devise)} ?`}</h3>
            <p>
              {aAnnuler.type === "licence"
                ? `Elle ne comptera plus : ${hotelNom} retrouve son état d'avant (abonnement mensuel ou essai) et le statut est recalculé tout de suite. La ligne reste visible avec son motif.`
                : "Elle ne comptera plus pour l'échéance de la maintenance ; le statut de l'hôtel est recalculé tout de suite."}
            </p>
            <label className="label" htmlFor="lic-motif">
              Motif (obligatoire)
            </label>
            <input id="lic-motif" className="champ" value={motif} maxLength={300} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. argent non reçu, erreur de saisie…" autoFocus />
            <div className="paiements-hotel__actions">
              <Button variant="danger" onClick={() => void confirmerAnnulation()} disabled={enCours}>
                {enCours ? "Annulation…" : "Confirmer l'annulation"}
              </Button>
              <Button variant="secondary" onClick={() => setAAnnuler(null)} disabled={enCours}>
                Garder
              </Button>
            </div>
          </div>
        )}

        <Button variant="secondary" onClick={onFermer} style={{ marginTop: 16 }}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
