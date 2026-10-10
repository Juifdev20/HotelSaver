import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientApi, TauxChange } from "@hotel-chicago/api-client";
import { CompteCafeteria, Devise, MenuDuJour, ModePaiement, Produit, StatutLigne, LIBELLE_STATUT_LIGNE, StatutCompte, ProfilConnecte, VenteCafeteria, sousComptesVisibles, peutOperer } from "@hotel-chicago/types";
import { construireRecuVente, enteteHotel } from "@hotel-chicago/receipts";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { lireMontant } from "@hotel-chicago/miroir-local";
import { Check, Plus } from "lucide-react";
import { EcranAjoutConsommation } from "./EcranAjoutConsommation";
import { ApercuRecu } from "../components/ApercuRecu";
import { calculerApercuMonnaie } from "../components/apercu-monnaie";
import { BadgeProvisoire, PHRASE_RECU_PROVISOIRE, estRecuProvisoire } from "../components/RecuProvisoire";

export interface EcranCompteCafeteriaProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  compteId: string;
  interfaceImprimante: string | null;
  onRetour: () => void;
  /** « Vente rapide » : ouvre tout de suite l'ajout pour la première personne. */
  ouvrirAjoutAuDemarrage?: boolean;
}

function totalSousCompte(sousCompte: CompteCafeteria["sousComptes"][number]): { usd: number; cdf: number } {
  let usd = 0;
  let cdf = 0;
  for (const ligne of sousCompte.lignes) {
    const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
    if (ligne.devise === Devise.USD) usd += montant;
    else cdf += montant;
  }
  return { usd, cdf };
}

function totalCompte(compte: CompteCafeteria): { usd: number; cdf: number } {
  return compte.sousComptes.reduce(
    (acc, sc) => {
      const t = totalSousCompte(sc);
      return { usd: acc.usd + t.usd, cdf: acc.cdf + t.cdf };
    },
    { usd: 0, cdf: 0 }
  );
}

/**
 * Détail d'un compte cafétaria (Phase 15 — équivalent desktop de
 * apps/mobile/src/ecrans/EcranCompteCafeteria.tsx). En ligne directe : pas
 * de miroir, chaque action appelle l'API et recharge le compte.
 */
export function EcranCompteCafeteria({
  client,
  utilisateur,
  compteId,
  interfaceImprimante,
  onRetour,
  ouvrirAjoutAuDemarrage = false,
}: EcranCompteCafeteriaProps) {
  const [compte, setCompte] = useState<CompteCafeteria | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nomPersonne, setNomPersonne] = useState("");
  const [enAjoutPersonne, setEnAjoutPersonne] = useState(false);

  // Niveau 2 : id de la personne pour qui on ajoute des consommations (null = vue d'ensemble).
  const [personneEnAjout, setPersonneEnAjout] = useState<string | null>(null);
  const [scanAuDemarrage, setScanAuDemarrage] = useState(false);
  const ajoutDemarrageFait = useRef(false);

  // Vente rapide : une seule fois, dès que le compte est chargé.
  useEffect(() => {
    if (!ouvrirAjoutAuDemarrage || ajoutDemarrageFait.current || !compte?.sousComptes[0]) return;
    ajoutDemarrageFait.current = true;
    setScanAuDemarrage(true);
    setPersonneEnAjout(compte.sousComptes[0].id);
  }, [ouvrirAjoutAuDemarrage, compte]);
  const [populaires, setPopulaires] = useState<Map<string, number>>(new Map());
  const [menuDuJour, setMenuDuJour] = useState<MenuDuJour | null>(null);

  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.CASH);
  const [venteEncaissee, setVenteEncaissee] = useState<VenteCafeteria | null>(null);
  const [enEncaissement, setEnEncaissement] = useState(false);
  // Qui l'on encaisse : null = rien en cours, "tout" = tout ce qui reste, sinon l'id d'une personne.
  const [cible, setCible] = useState<string | null>(null);
  // Ce que le reçu détaille (figé au moment de l'encaissement, le compte se recharge ensuite).
  const [recuCompte, setRecuCompte] = useState<CompteCafeteria | null>(null);
  const [compteSolde, setCompteSolde] = useState(false);
  // Personnes payées : écartées à la main (« Masquer ») ou effacées d'elles-mêmes 1 minute après leur paiement.
  const [masquees, setMasquees] = useState<Set<string>>(new Set());
  const [voirPayees, setVoirPayees] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 5000);
    return () => clearInterval(minuteur);
  }, []);
  const [enImpression, setEnImpression] = useState(false);
  // Encaissement en espèces : montant remis, devises (null = celle de la note), taux du jour.
  const [taux, setTaux] = useState<TauxChange | null>(null);
  const [montantRemis, setMontantRemis] = useState("");
  const [deviseRemise, setDeviseRemise] = useState<Devise | null>(null);
  const [deviseRenduChoisie, setDeviseRenduChoisie] = useState<Devise | null>(null);
  const [avertissementCatalogue, setAvertissementCatalogue] = useState<string | null>(null);
  const [serviEnCours, setServiEnCours] = useState<Set<string>>(new Set());
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  // Le MÊME reçu sert à l'aperçu et à l'impression : ce qu'on voit est ce qui sort imprimé.
  const lignesRecu = useMemo(() => {
    const source = recuCompte ?? compte;
    return venteEncaissee && source ? construireRecuVente(venteEncaissee, source, utilisateur.nom, enteteHotel(utilisateur)) : null;
  }, [venteEncaissee, recuCompte, compte, utilisateur]);

  const rechargerCompte = useCallback(() => {
    client
      .obtenirCompteCafeteria(compteId)
      .then(setCompte)
      .catch((e: Error) => setErreur(e.message));
  }, [client, compteId]);

  const chargerCatalogue = useCallback(() => {
    // Les produits servent à ajouter des consommations : un échec est signalé (la liste précédente est conservée, jamais vidée).
    client
      .listerProduits()
      .then((liste) => {
        setProduits(liste);
        setAvertissementCatalogue(null);
      })
      .catch(() => setAvertissementCatalogue("La liste des produits n'a pas pu être chargée : elle peut être incomplète ou périmée."));
    // Populaires, menu du jour et taux sont des aides facultatives : leur absence ne bloque pas la caisse.
    client
      .produitsPopulaires()
      .then((liste) => setPopulaires(new Map(liste.map((l) => [l.produitId, l.quantite]))))
      .catch(() => {});
    client.menuDuJour().then(setMenuDuJour).catch(() => {});
    client.tauxActuel().then(setTaux).catch(() => setTaux(null));
  }, [client]);

  useEffect(() => {
    rechargerCompte();
    chargerCatalogue();
  }, [rechargerCompte, chargerCatalogue]);

  async function ajouterPersonne() {
    if (!nomPersonne.trim()) {
      setErreur("Le nom de la personne est obligatoire.");
      return;
    }
    setEnAjoutPersonne(true);
    setErreur(null);
    try {
      await client.ajouterSousCompte(compteId, nomPersonne.trim());
      setNomPersonne("");
      rechargerCompte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnAjoutPersonne(false);
    }
  }

  async function marquerServi(ligneId: string) {
    if (serviEnCours.has(ligneId)) return;
    setServiEnCours((courant) => new Set(courant).add(ligneId));
    setErreur(null);
    try {
      await client.majStatutLigne(ligneId, StatutLigne.SERVI);
      rechargerCompte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setServiEnCours((courant) => {
        const suivant = new Set(courant);
        suivant.delete(ligneId);
        return suivant;
      });
    }
  }

  async function encaisser() {
    if (!compte || cible === null) return;
    const aRegler = compte.sousComptes.filter((sc) => !sc.payeLe && sc.lignes.length > 0);
    const concernes = cible === "tout" ? aRegler : aRegler.filter((sc) => sc.id === cible);
    if (concernes.length === 0) return;
    // Espèces : le montant remis est obligatoire (sauf note en deux devises, où le règlement croisé n'existe pas).
    const totaux = totalCompte({ ...compte, sousComptes: concernes });
    const mixte = totaux.usd > 0 && totaux.cdf > 0;
    const detail: { deviseRegleeParClient?: Devise; montantRegleParClient?: number; deviseRenduChoisie?: Devise } = {};
    if (modePaiement === ModePaiement.CASH && !mixte) {
      const deviseDue = totaux.usd > 0 ? Devise.USD : Devise.CDF;
      const devise = deviseRemise ?? deviseDue;
      const lu = montantRemis.trim() === "" ? null : lireMontant(montantRemis, devise, { max: 1_000_000_000 });
      if (!lu) {
        setErreur("Saisissez le montant remis par le client.");
        return;
      }
      if (!lu.ok) {
        setErreur(lu.message);
        return;
      }
      const apercu = calculerApercuMonnaie({
        du: deviseDue === Devise.USD ? totaux.usd : totaux.cdf,
        deviseDue,
        deviseReglee: devise,
        deviseRendu: deviseRenduChoisie ?? devise,
        regle: lu.valeur,
        cdfParUsd: taux ? Number(taux.cdfParUsd) : undefined,
      });
      if (apercu.statut === "taux-manquant") {
        setErreur("Aucun taux de change défini par le patron : le client doit régler dans la devise de la note.");
        return;
      }
      if (apercu.statut === "insuffisant") {
        setErreur(`Montant insuffisant : il faut ${formatMontant(apercu.duReglee, devise)}.`);
        return;
      }
      detail.deviseRegleeParClient = devise;
      detail.montantRegleParClient = lu.valeur;
      detail.deviseRenduChoisie = deviseRenduChoisie ?? devise;
    }
    setEnEncaissement(true);
    setErreur(null);
    try {
      // Objets non « frais » : api-client type encore l'encaissement sans les champs du paiement croisé, que l'API et `Ecritures` acceptent.
      const donneesGroupe = { mode: "GROUPE" as const, modePaiement, ...detail };
      const donneesPersonne = { mode: "UNE_PERSONNE" as const, modePaiement, sousCompteId: cible, ...detail };
      const ventes =
        cible === "tout"
          ? await client.encaisserCompte(compteId, donneesGroupe)
          : await client.encaisserCompte(compteId, donneesPersonne);
      setVenteEncaissee(ventes[0]);
      setRecuCompte({ ...compte, sousComptes: concernes });
      // Plus personne à régler après celle(s)-ci : le compte est fermé côté serveur.
      setCompteSolde(aRegler.every((sc) => concernes.some((c) => c.id === sc.id)));
      setCible(null);
      rechargerCompte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEncaissement(false);
    }
  }

  /** Reçu terminé : on quitte le compte seulement s'il est soldé, sinon on revient aux autres personnes. */
  function terminerRecu() {
    if (compteSolde) {
      onRetour();
      return;
    }
    setVenteEncaissee(null);
    setRecuCompte(null);
    setMessageImpression(null);
  }

  function ouvrirEncaissement(cibleChoisie: string) {
    setErreur(null);
    setModePaiement(ModePaiement.CASH);
    setMontantRemis("");
    setDeviseRemise(null);
    setDeviseRenduChoisie(null);
    setCible(cibleChoisie);
  }

  async function imprimerRecu() {
    if (!lignesRecu) return;
    if (!interfaceImprimante) {
      setMessageImpression("Aucune imprimante configurée — réglez-la depuis Paramètres > Imprimante.");
      return;
    }
    setEnImpression(true);
    setMessageImpression(null);
    try {
      await window.hotelChicago.imprimer(interfaceImprimante, lignesRecu);
      setMessageImpression("Reçu envoyé à l'imprimante. Vérifiez que le ticket est bien sorti avant de le remettre au client.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnImpression(false);
    }
  }

  if (!compte) {
    return (
      <div className="page">
        {erreur ? (
          <p role="alert" className="hc-text-body texte-erreur">
            {erreur}
          </p>
        ) : (
          <p className="hc-text-body texte-discret">Chargement…</p>
        )}
      </div>
    );
  }

  const total = totalCompte(compte);
  const compteOuvert = compte.statut === StatutCompte.OUVERT;
  // Séparation des tâches : le patron (sauf réglage de l'hôtel) consulte le compte mais n'y ajoute ni n'y encaisse rien.
  const operer = peutOperer(utilisateur);
  const cuisineActivee = utilisateur.cuisineActivee === true;
  const personnesARegler = compte.sousComptes.filter((sc) => !sc.payeLe && sc.lignes.length > 0);
  const { visibles: personnesVisibles, revoyables } = sousComptesVisibles(compte.sousComptes, maintenant, masquees);
  // « Afficher » ne ramène que les personnes payées depuis moins de 5 minutes ; au-delà, l'écran est propre.
  const voirPayeesActif = voirPayees && revoyables.length > 0;
  const personnesAffichees = voirPayeesActif
    ? compte.sousComptes.filter((sc) => personnesVisibles.includes(sc) || revoyables.includes(sc))
    : personnesVisibles;
  const unePersonneAPaye = compte.sousComptes.some((sc) => sc.payeLe);
  const reste = totalCompte({ ...compte, sousComptes: personnesARegler });
  const cibles = cible === "tout" ? personnesARegler : personnesARegler.filter((sc) => sc.id === cible);
  const totalCible = totalCompte({ ...compte, sousComptes: cibles });
  // Espèces : montant remis obligatoire, monnaie à rendre calculée (note en deux devises : pas de règlement croisé possible).
  const noteMixte = totalCible.usd > 0 && totalCible.cdf > 0;
  const deviseDueCible: Devise | null = totalCible.usd > 0 ? Devise.USD : totalCible.cdf > 0 ? Devise.CDF : null;
  const exigerRemis = modePaiement === ModePaiement.CASH && !noteMixte && deviseDueCible !== null;
  const deviseRemiseEff = deviseRemise ?? deviseDueCible ?? Devise.USD;
  const deviseRenduEff = deviseRenduChoisie ?? deviseRemiseEff;
  const remisLu = montantRemis.trim() === "" ? null : lireMontant(montantRemis, deviseRemiseEff, { max: 1_000_000_000 });
  const erreurRemis = remisLu && !remisLu.ok ? remisLu.message : null;
  const cdfParUsd = taux ? Number(taux.cdfParUsd) : undefined;
  const apercuMonnaie =
    exigerRemis && deviseDueCible && remisLu && remisLu.ok
      ? calculerApercuMonnaie({
          du: deviseDueCible === Devise.USD ? totalCible.usd : totalCible.cdf,
          deviseDue: deviseDueCible,
          deviseReglee: deviseRemiseEff,
          deviseRendu: deviseRenduEff,
          regle: remisLu.valeur,
          cdfParUsd,
        })
      : null;
  const remisValide = !exigerRemis || (remisLu !== null && remisLu.ok && apercuMonnaie?.statut === "ok");

  const personneChoisie = compte.sousComptes.find((sc) => sc.id === personneEnAjout);
  if (personneChoisie && compteOuvert && !venteEncaissee) {
    return (
      <EcranAjoutConsommation
        client={client}
        compte={compte}
        personne={personneChoisie}
        produits={produits}
        populaires={populaires}
        menuDuJour={menuDuJour}
        scannerAuDemarrage={scanAuDemarrage}
        onRetour={() => {
          setScanAuDemarrage(false);
          setPersonneEnAjout(null);
        }}
        onAjoute={() => {
          setScanAuDemarrage(false);
          setPersonneEnAjout(null);
          rechargerCompte();
          chargerCatalogue();
        }}
      />
    );
  }

  if (venteEncaissee) {
    return (
      <div className="page">
        <header className="page__entete">
          <div>
            <h1 className="hc-text-display-md page__titre">
              Reçu {venteEncaissee.numeroRecu} <BadgeProvisoire numeroRecu={venteEncaissee.numeroRecu} />
            </h1>
          </div>
        </header>
        <div className="carte-formulaire">
          {estRecuProvisoire(venteEncaissee.numeroRecu) && (
            <p className="hc-text-body" role="note">
              {PHRASE_RECU_PROVISOIRE}
            </p>
          )}
          {lignesRecu && <ApercuRecu lignes={lignesRecu} />}
          {Number(venteEncaissee.montantTotalUSD) > 0 && (
            <p className="hc-text-price">{formatMontant(venteEncaissee.montantTotalUSD, Devise.USD)}</p>
          )}
          {Number(venteEncaissee.montantTotalCDF) > 0 && (
            <p className="hc-text-price">{formatMontant(venteEncaissee.montantTotalCDF, Devise.CDF)}</p>
          )}
          {venteEncaissee.montantMonnaieRendue !== null && venteEncaissee.deviseMonnaieRendue !== null && (
            <p className="hc-text-body-strong texte-succes">
              Monnaie à rendre : {formatMontant(venteEncaissee.montantMonnaieRendue, venteEncaissee.deviseMonnaieRendue)}
            </p>
          )}
          {messageImpression && (
            <p className="hc-text-body" role="status">
              {messageImpression}
            </p>
          )}
          <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
            <Button type="button" variant="secondary" onClick={imprimerRecu} disabled={enImpression}>
              {enImpression ? "…" : "Imprimer le reçu"}
            </Button>
            <Button type="button" onClick={terminerRecu}>
              {compteSolde ? "Terminer" : "Retour au compte"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">{compte.tableOuNom}</h1>
          <p className="hc-text-body page__sous-titre">{compteOuvert ? "Compte ouvert." : "Ce compte est déjà encaissé."}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {avertissementCatalogue && (
        <p role="alert" className="hc-text-body texte-erreur">
          {avertissementCatalogue}{" "}
          <button type="button" className="lien-action" onClick={chargerCatalogue}>
            Réessayer
          </button>
        </p>
      )}

      {compteOuvert && !operer && (
        <p className="hc-text-caption texte-discret bandeau-lecture-seule" role="note">
          Lecture seule — ajouter des consommations et encaisser sont réservés au personnel de la cafétaria. Le réglage se trouve dans Paramètres.
        </p>
      )}

      {compte.origine === "SITE_PUBLIC" && (
        <div className="carte-formulaire" role="note">
          <p className="hc-text-label texte-discret">Commande web</p>
          <p className="hc-text-caption texte-discret">
            Passée depuis le site web de l'hôtel — le client se présente au comptoir pour payer, son reçu est le reçu cafétaria habituel.
          </p>
          <p className="hc-text-body-strong" style={{ letterSpacing: "0.08em", color: "var(--hc-blue)" }}>
            Référence : {compte.id.slice(0, 8).toUpperCase()}
          </p>
          {compte.contactClient && (
            <p className="hc-text-body">Contact : {compte.contactClient}</p>
          )}
          {compte.noteClient && (
            <p className="hc-text-body">Note du client : {compte.noteClient}</p>
          )}
        </div>
      )}

      {compteOuvert && operer && compte.sousComptes.length > 0 && (
        <p className="hc-text-caption texte-discret">Ajoutez des consommations à une personne, puis encaissez-la quand elle part : chacun règle sa part.</p>
      )}

      {personnesAffichees.map((sousCompte) => {
        const totalPersonne = totalSousCompte(sousCompte);
        const nbArticles = sousCompte.lignes.reduce((n, l) => n + Number(l.quantite), 0);
        const modifiable = compteOuvert && !sousCompte.payeLe && operer;
        const contenu = (
          <>
            <div className="personne-carte__entete">
              <div>
                <p className="hc-text-body-strong">{sousCompte.nom}</p>
                <p className="hc-text-caption texte-discret">
                  {nbArticles === 0 ? "Aucun article" : `${nbArticles} article${nbArticles > 1 ? "s" : ""}`}
                </p>
              </div>
              {sousCompte.payeLe && (
                <span className="personne-carte__paye">
                  <Check size={14} aria-hidden="true" /> Payé
                  {compteOuvert && !voirPayeesActif && (
                    <button
                      type="button"
                      className="personne-carte__masquer"
                      onClick={() => setMasquees((courant) => new Set(courant).add(sousCompte.id))}
                      aria-label={`Masquer ${sousCompte.nom}`}
                    >
                      Masquer
                    </button>
                  )}
                </span>
              )}
            </div>
            {sousCompte.lignes.map((ligne) => (
              <div className="parametres-ligne" key={ligne.id}>
                <span className="hc-text-body" style={{ display: "flex", alignItems: "center", gap: "var(--hc-space-2)" }}>
                  {ligne.quantite}x {ligne.produit.nom}
                  {cuisineActivee && ligne.statut && ligne.statut !== StatutLigne.SERVI && (
                    <span className={`statut-ligne statut-ligne--${ligne.statut.toLowerCase().replaceAll("_", "-")}`}>
                      {LIBELLE_STATUT_LIGNE[ligne.statut as StatutLigne]}
                    </span>
                  )}
                  {cuisineActivee && ligne.statut === StatutLigne.PRET && modifiable && (
                    <button
                      type="button"
                      className="lien-action"
                      disabled={serviEnCours.has(ligne.id)}
                      onClick={() => void marquerServi(ligne.id)}
                    >
                      Servi
                    </button>
                  )}
                </span>
                <span className="hc-text-price">{formatMontant(Number(ligne.prixUnitaire) * Number(ligne.quantite), ligne.devise)}</span>
              </div>
            ))}
            {(totalPersonne.usd > 0 || totalPersonne.cdf > 0) && (
              <p className="hc-text-body-strong" style={{ marginTop: "var(--hc-space-2)" }}>
                {totalPersonne.usd > 0 && formatMontant(totalPersonne.usd, Devise.USD)}
                {totalPersonne.usd > 0 && totalPersonne.cdf > 0 && " + "}
                {totalPersonne.cdf > 0 && formatMontant(totalPersonne.cdf, Devise.CDF)}
              </p>
            )}
          </>
        );
        return (
          <div key={sousCompte.id} className={`carte-formulaire personne-carte${sousCompte.payeLe ? " personne-carte--payee" : ""}`}>
            {contenu}
            {modifiable && (
              <div className="personne-carte__actions">
                <Button type="button" variant="secondary" onClick={() => setPersonneEnAjout(sousCompte.id)}>
                  <Plus size={16} aria-hidden="true" /> Ajouter
                </Button>
                {sousCompte.lignes.length > 0 && (
                  <Button type="button" onClick={() => ouvrirEncaissement(sousCompte.id)}>
                    Encaisser {sousCompte.nom}
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {compteOuvert && revoyables.length > 0 && (
        <button type="button" className="lien-payees" onClick={() => setVoirPayees((v) => !v)}>
          {voirPayeesActif
            ? "Masquer les personnes payées"
            : `${revoyables.length} personne${revoyables.length > 1 ? "s" : ""} payée${revoyables.length > 1 ? "s" : ""} masquée${revoyables.length > 1 ? "s" : ""} · Afficher`}
        </button>
      )}

      <div className="carte-formulaire">
        <p className="hc-text-label texte-discret">{unePersonneAPaye && compteOuvert ? "Reste à payer" : "Total"}</p>
        {(unePersonneAPaye && compteOuvert ? reste : total).usd === 0 && (unePersonneAPaye && compteOuvert ? reste : total).cdf === 0 ? (
          <p className="hc-text-body texte-discret">{unePersonneAPaye && compteOuvert ? "Rien à payer pour l'instant." : "Aucune ligne pour l'instant."}</p>
        ) : (
          <>
            {(unePersonneAPaye && compteOuvert ? reste : total).usd > 0 && (
              <p className="hc-text-price">{formatMontant((unePersonneAPaye && compteOuvert ? reste : total).usd, Devise.USD)}</p>
            )}
            {(unePersonneAPaye && compteOuvert ? reste : total).cdf > 0 && (
              <p className="hc-text-price">{formatMontant((unePersonneAPaye && compteOuvert ? reste : total).cdf, Devise.CDF)}</p>
            )}
          </>
        )}
      </div>

      {compteOuvert && operer && (
        <>
          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Ajouter une personne</p>
            <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
              <input
                value={nomPersonne}
                onChange={(e) => setNomPersonne(e.target.value)}
                placeholder="Ex. Personne 2"
                aria-label="Nom de la personne à ajouter"
                style={{ flex: 1 }}
              />
              <Button type="button" variant="secondary" onClick={ajouterPersonne} disabled={enAjoutPersonne}>
                {enAjoutPersonne ? "…" : "Ajouter"}
              </Button>
            </div>
          </div>

          {cible === null && personnesARegler.length > 1 && (
            <div className="carte-formulaire">
              <p className="hc-text-label texte-discret">Règlement groupé</p>
              <p className="hc-text-caption texte-discret">Quand une personne règle pour tout le monde : une seule note pour tout ce qui reste à payer.</p>
              <Button type="button" variant="secondary" onClick={() => ouvrirEncaissement("tout")}>
                Tout encaisser
              </Button>
            </div>
          )}

          {cible !== null && (
            <div className="carte-formulaire">
              <p className="hc-text-label texte-discret">
                {cible === "tout" ? "Tout encaisser" : `Encaisser ${cibles[0]?.nom ?? ""}`}
              </p>
              <p className="hc-text-price">
                {totalCible.usd > 0 && formatMontant(totalCible.usd, Devise.USD)}
                {totalCible.usd > 0 && totalCible.cdf > 0 && " + "}
                {totalCible.cdf > 0 && formatMontant(totalCible.cdf, Devise.CDF)}
              </p>
              <div className="puces" role="group" aria-label="Mode de paiement">
                {[ModePaiement.CASH, ModePaiement.MOBILE_MONEY].map((m) => (
                  <button key={m} type="button" className="puce" aria-pressed={modePaiement === m} onClick={() => setModePaiement(m)}>
                    {m === ModePaiement.CASH ? "Espèces" : "Mobile money"}
                  </button>
                ))}
              </div>

              {modePaiement === ModePaiement.CASH && noteMixte && (
                <p className="hc-text-caption texte-discret">
                  Note en deux devises (USD et CDF) : le règlement croisé n'est pas possible, encaissez le montant exact de chaque devise.
                </p>
              )}

              {exigerRemis && deviseDueCible && (
                <div className="formulaire" style={{ display: "flex", flexDirection: "column", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-2)" }}>
                  <div className="parametres-ligne">
                    <span className="hc-text-body">Devise remise par le client</span>
                    <div className="puces" role="group" aria-label="Devise remise">
                      {[Devise.USD, Devise.CDF].map((d) => (
                        <button key={d} type="button" className="puce" aria-pressed={deviseRemiseEff === d} onClick={() => setDeviseRemise(d)}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  {deviseRemiseEff !== deviseDueCible && (
                    <p className="hc-text-caption" style={{ color: "var(--hc-blue)" }}>
                      {cdfParUsd
                        ? `Dû : ${formatMontant(
                            deviseDueCible === Devise.USD ? totalCible.usd * cdfParUsd : totalCible.cdf / cdfParUsd,
                            deviseRemiseEff
                          )} (1 $ = ${formatMontant(cdfParUsd, Devise.CDF)})`
                        : "Aucun taux de change défini par le patron — paiement croisé impossible."}
                    </p>
                  )}
                  <label className="hc-text-label" htmlFor="montant-remis-cafe">
                    Montant remis (obligatoire)
                  </label>
                  <input
                    id="montant-remis-cafe"
                    type="text"
                    inputMode="decimal"
                    value={montantRemis}
                    onChange={(e) => setMontantRemis(e.target.value)}
                    placeholder={deviseRemiseEff === Devise.USD ? "Ex. 20.00" : "Ex. 50 000"}
                    aria-required="true"
                    aria-invalid={erreurRemis !== null}
                    aria-describedby={erreurRemis ? "montant-remis-cafe-erreur" : undefined}
                  />
                  {erreurRemis && (
                    <p id="montant-remis-cafe-erreur" role="alert" className="hc-text-body texte-erreur">
                      {erreurRemis}
                    </p>
                  )}
                  {remisLu && remisLu.ok && (
                    <div className="parametres-ligne">
                      <span className="hc-text-body">Rendre la monnaie en</span>
                      <div className="puces" role="group" aria-label="Devise du rendu">
                        {[Devise.USD, Devise.CDF].map((d) => (
                          <button key={d} type="button" className="puce" aria-pressed={deviseRenduEff === d} onClick={() => setDeviseRenduChoisie(d)}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {apercuMonnaie?.statut === "insuffisant" && (
                    <p role="alert" className="hc-text-body texte-erreur">
                      Montant insuffisant : il faut {formatMontant(apercuMonnaie.duReglee, deviseRemiseEff)}.
                    </p>
                  )}
                  {apercuMonnaie?.statut === "taux-manquant" && (
                    <p role="alert" className="hc-text-body texte-erreur">
                      Aucun taux de change défini par le patron : le client doit régler dans la devise de la note.
                    </p>
                  )}
                  {apercuMonnaie?.statut === "ok" && (
                    <p className="hc-text-body-strong texte-succes" role="status">
                      Monnaie à rendre : {formatMontant(apercuMonnaie.monnaie, apercuMonnaie.deviseMonnaie)}
                    </p>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-3)" }}>
                <Button type="button" onClick={encaisser} disabled={enEncaissement || cibles.length === 0 || !remisValide}>
                  {enEncaissement ? "Encaissement en cours…" : "Confirmer l'encaissement"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setCible(null)} disabled={enEncaissement}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
