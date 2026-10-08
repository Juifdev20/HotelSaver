import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, MenuDuJour, ModePaiement, Produit, StatutCompte, StatutLigne, LIBELLE_STATUT_LIGNE, VenteCafeteria, sousComptesVisibles, peutOperer } from "@hotel-chicago/types";
import { construireRecuVente, enteteHotel } from "@hotel-chicago/receipts";
import { Check, Globe, Plus, UserPlus } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { ApercuRecu } from "../composants/ApercuRecu";
import { CarteBalayable } from "../composants/CarteBalayable";
import { EcranAjoutConsommation } from "./EcranAjoutConsommation";
import { nombreArticles, totalCompte, totalSousCompte } from "../totauxCafeteria";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { imprimerLignes } from "../impression/imprimante";
import {
  CompteCafeteriaMiroir,
  LigneCommandeMiroir,
  SousCompteMiroir,
  creerSousCompteLocal,
  listerProduitsMiroir,
  majStatutLigneLocal,
  marquerPersonnePayeeLocal,
  obtenirCompteMiroir,
  produitsPopulairesAujourdhuiMiroir,
} from "../stockage/cafeteriaMirroir";

export interface EcranCompteCafeteriaProps {
  client: ClientApi;
  compteId: string;
  onRetour: () => void;
  /** « Vente rapide » : ouvre tout de suite l'ajout pour la première personne,
   * caméra prête. Le scan remplit le panier même avant la synchronisation ;
   * seule la validation attend que la personne existe côté serveur. */
  ouvrirAjoutAuDemarrage?: boolean;
}

/**
 * Hors ligne (Phase 6, 26/09/2026) : compte et produits lus depuis le miroir
 * local, jamais l'API directement — même patron que EcranChambres.tsx.
 * "Ajouter une personne"/"Ajouter une ligne" écrivent le miroir tout de suite
 * (optimiste) et mettent l'opération en file ; l'écran ne doit jamais
 * attendre le réseau pour ces deux actions (c'est tout l'enjeu de cette
 * passe). "Encaisser" reste un appel direct à l'API (voir le plan —
 * numérotation séquentielle des reçus, ne peut pas se faire hors ligne) :
 * bloqué tant que des lignes/sous-comptes de ce compte sont encore en
 * attente d'envoi, sans quoi le total facturé serait incomplet.
 */
export function EcranCompteCafeteria({ client, compteId, onRetour, ouvrirAjoutAuDemarrage = false }: EcranCompteCafeteriaProps) {
  const { utilisateur, moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const [compte, setCompte] = useState<CompteCafeteriaMiroir | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const [idsCompteEnAttente, setIdsCompteEnAttente] = useState<Set<string>>(new Set());
  const [idsSousCompteEnAttente, setIdsSousCompteEnAttente] = useState<Set<string>>(new Set());
  const [idsLigneEnAttente, setIdsLigneEnAttente] = useState<Set<string>>(new Set());

  const [modalePersonne, setModalePersonne] = useState(false);
  const [nomPersonne, setNomPersonne] = useState("");

  // Niveau 2 : id de la personne pour qui on ajoute des consommations (null = vue d'ensemble).
  const [personneEnAjout, setPersonneEnAjout] = useState<string | null>(null);
  const [scanAuDemarrage, setScanAuDemarrage] = useState(false);
  const ajoutDemarrageFait = useRef(false);
  const [populaires, setPopulaires] = useState<Map<string, number>>(new Map());
  const [menuDuJour, setMenuDuJour] = useState<MenuDuJour | null>(null);

  const [modaleEncaissement, setModaleEncaissement] = useState(false);
  // Qui l'on encaisse : une personne (son id local) ou « tout » ce qui reste à régler.
  const [cibleEncaissement, setCibleEncaissement] = useState<string>("tout");
  // Ce que le reçu détaille (figé au moment de l'encaissement, le compte se recharge ensuite).
  const [recuCompte, setRecuCompte] = useState<CompteCafeteriaMiroir | null>(null);
  const [compteSolde, setCompteSolde] = useState(false);
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.CASH);
  const [venteEncaissee, setVenteEncaissee] = useState<VenteCafeteria | null>(null);
  const [enImpression, setEnImpression] = useState(false);
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  // Personnes payées : écartées à la main (balayage) ou effacées d'elles-mêmes 1 minute après leur paiement.
  const [masquees, setMasquees] = useState<Set<string>>(new Set());
  const [voirPayees, setVoirPayees] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 5000);
    return () => clearInterval(minuteur);
  }, []);

  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [serviEnCours, setServiEnCours] = useState<Set<string>>(new Set());

  // Le MÊME reçu sert à l'aperçu et à l'impression : ce qu'on voit est ce qui sort imprimé.
  const lignesRecu = useMemo(
    () => (venteEncaissee && (recuCompte ?? compte) ? construireRecuVente(venteEncaissee, (recuCompte ?? compte)!, utilisateur.nom, enteteHotel(utilisateur)) : null),
    [venteEncaissee, recuCompte, compte, utilisateur]
  );

  const rechargerCompte = useCallback(() => {
    obtenirCompteMiroir(compteId)
      .then(setCompte)
      .catch((e: Error) => setErreur(e.message));
  }, [compteId]);

  useEffect(() => {
    rechargerCompte();
    listerProduitsMiroir().then(setProduits).catch(() => {});
    produitsPopulairesAujourdhuiMiroir().then(setPopulaires).catch(() => {});
    client.menuDuJour().then(setMenuDuJour).catch(() => {});
    moteurSync.forcerSynchronisation();
  }, [rechargerCompte, moteurSync]);

  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerCompte();
  }, [etatSync.dernierePousseeLe, rechargerCompte]);

  // Vente rapide : une seule fois, dès que le compte est lu du miroir.
  useEffect(() => {
    if (!ouvrirAjoutAuDemarrage || ajoutDemarrageFait.current || !compte) return;
    const premiere = compte.sousComptes[0];
    if (!premiere) return;
    ajoutDemarrageFait.current = true;
    setScanAuDemarrage(true);
    setPersonneEnAjout(premiere.id);
  }, [ouvrirAjoutAuDemarrage, compte]);

  // Suit quels ids (compte/sous-comptes/lignes) sont encore en file d'attente
  // pour désactiver "Ajouter une personne"/sélection d'une personne pas
  // encore synchronisée, et bloquer l'encaissement tant que tout n'est pas
  // parti (voir le plan). Recalculé à chaque changement de la file ou du
  // compte (après une écriture optimiste).
  useEffect(() => {
    let annule = false;
    Promise.all([
      moteurSync.idsEnAttente("CompteCafeteria"),
      moteurSync.idsEnAttente("SousCompte"),
      moteurSync.idsEnAttente("LigneCommande"),
    ]).then(([c, sc, l]) => {
      if (annule) return;
      setIdsCompteEnAttente(c);
      setIdsSousCompteEnAttente(sc);
      setIdsLigneEnAttente(l);
    });
    return () => {
      annule = true;
    };
  }, [moteurSync, etatSync.enAttente, compte]);

  const compteEnAttente = compte ? idsCompteEnAttente.has(compte.id) : false;
  // Un sous-compte avec remoteId NULL hors file (ex. créé via le compte sur
  // un ancien build, avant le re-mapping du 27/09/2026) ne pourra jamais
  // recevoir de ligne côté serveur : bloqué comme les ops en attente.
  const compteEtSesEnfantsEnAttente =
    compteEnAttente ||
    (compte?.sousComptes.some(
      (sc) => sc.remoteId === null || idsSousCompteEnAttente.has(sc.id) || sc.lignes.some((l) => idsLigneEnAttente.has(l.id))
    ) ??
      false);

  function ouvrirModalePersonne() {
    setNomPersonne("");
    setErreurAction(null);
    setModalePersonne(true);
  }

  async function ajouterPersonne() {
    if (!compte) return;
    if (!nomPersonne.trim()) {
      setErreurAction("Le nom de la personne est obligatoire.");
      return;
    }
    if (compteEnAttente) {
      setErreurAction("Compte en cours de synchronisation, réessayez dans un instant.");
      return;
    }
    setEnEnvoi(true);
    setErreurAction(null);
    try {
      const sousCompte = await creerSousCompteLocal(compte.id, nomPersonne.trim());
      await moteurSync.mettreEnFile({
        entiteType: "SousCompte",
        localId: sousCompte.id,
        operation: "CREATE",
        payload: { compteId: compte.remoteId ?? compte.id, nom: sousCompte.nom },
      });
      setModalePersonne(false);
      rechargerCompte();
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  /** Ouvre la page d'ajout pour une personne (bloqué tant qu'elle n'est pas synchronisée). */
  function ouvrirAjout(sousCompte: SousCompteMiroir) {
    if (sousCompte.remoteId === null || idsSousCompteEnAttente.has(sousCompte.id)) {
      setErreurAction("Cette personne est en cours de synchronisation, réessayez dans un instant.");
      moteurSync.forcerSynchronisation();
      return;
    }
    setErreurAction(null);
    produitsPopulairesAujourdhuiMiroir().then(setPopulaires).catch(() => {});
    setPersonneEnAjout(sousCompte.id);
  }

  /** Marque une ligne « prête » comme servie au client. En ligne uniquement
   * (comme l'encaissement) : le serveur impose la transition PRET → SERVI.
   * Le miroir est mis à jour tout de suite pour refléter l'action. */
  async function marquerServi(ligne: LigneCommandeMiroir) {
    if (!ligne.remoteId || serviEnCours.has(ligne.id)) return;
    setServiEnCours((courant) => new Set(courant).add(ligne.id));
    setErreurAction(null);
    try {
      await client.majStatutLigne(ligne.remoteId, StatutLigne.SERVI);
      await majStatutLigneLocal(ligne.id, StatutLigne.SERVI);
      rechargerCompte();
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Impossible de marquer la ligne comme servie.");
    } finally {
      setServiEnCours((courant) => {
        const suivant = new Set(courant);
        suivant.delete(ligne.id);
        return suivant;
      });
    }
  }

  /** Une personne est « en attente » tant qu'elle ou ses lignes n'ont pas atteint le serveur. */
  function personneEnAttente(sc: SousCompteMiroir): boolean {
    return sc.remoteId === null || idsSousCompteEnAttente.has(sc.id) || sc.lignes.some((l) => idsLigneEnAttente.has(l.id));
  }

  /** Personnes qui ont encore quelque chose à régler (pas déjà payées, au moins une ligne). */
  const personnesARegler = compte ? compte.sousComptes.filter((sc) => !sc.payeLe && sc.lignes.length > 0) : [];

  function personnesCibles(cible: string): SousCompteMiroir[] {
    return cible === "tout" ? personnesARegler : personnesARegler.filter((sc) => sc.id === cible);
  }

  function ouvrirEncaissement(cible: string) {
    if (compteEnAttente || personnesCibles(cible).some(personneEnAttente)) {
      setErreurAction("Synchronisation des commandes en cours — réessayez dans un instant.");
      moteurSync.forcerSynchronisation();
      return;
    }
    setCibleEncaissement(cible);
    setModePaiement(ModePaiement.CASH);
    setVenteEncaissee(null);
    setMessageImpression(null);
    setErreurAction(null);
    setModaleEncaissement(true);
  }

  async function encaisser() {
    if (!compte) return;
    const concernes = personnesCibles(cibleEncaissement);
    if (concernes.length === 0) return;
    setEnEnvoi(true);
    setErreurAction(null);
    try {
      const idCompte = compte.remoteId ?? compte.id;
      const ventes =
        cibleEncaissement === "tout"
          ? await client.encaisserCompte(idCompte, { mode: "GROUPE", modePaiement })
          : await client.encaisserCompte(idCompte, {
              mode: "UNE_PERSONNE",
              modePaiement,
              sousCompteId: concernes[0].remoteId ?? concernes[0].id,
            });
      setVenteEncaissee(ventes[0]);
      setRecuCompte({ ...compte, sousComptes: concernes });
      // Plus personne à régler après celle(s)-ci → le compte est fermé côté serveur.
      setCompteSolde(personnesARegler.every((sc) => concernes.some((c) => c.id === sc.id)));
      await Promise.all(concernes.map((sc) => marquerPersonnePayeeLocal(sc.id)));
      rechargerCompte();
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function imprimerRecuVente() {
    if (!lignesRecu) return;
    setEnImpression(true);
    setMessageImpression(null);
    try {
      await imprimerLignes(lignesRecu);
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnImpression(false);
    }
  }

  /** Reçu terminé : on quitte le compte seulement s'il est soldé, sinon on reste pour les autres personnes. */
  function terminerEncaissement() {
    setModaleEncaissement(false);
    if (venteEncaissee && compteSolde) onRetour();
  }

  const total = compte ? totalCompte(compte) : { usd: 0, cdf: 0 };
  const compteOuvert = compte?.statut === StatutCompte.OUVERT;
  // Séparation des tâches : le patron (sauf réglage de l'hôtel) consulte le compte mais n'y ajoute ni n'y encaisse rien.
  const operer = peutOperer(utilisateur);
  const cuisineActivee = utilisateur.cuisineActivee === true;
  const { visibles: personnesVisibles, revoyables } = compte
    ? sousComptesVisibles(compte.sousComptes, maintenant, masquees)
    : { visibles: [] as SousCompteMiroir[], revoyables: [] as SousCompteMiroir[] };
  // « Afficher » ne ramène que les personnes payées depuis moins de 5 minutes ; au-delà, l'écran est propre.
  const voirPayeesActif = voirPayees && revoyables.length > 0;
  const personnesAffichees = compte
    ? voirPayeesActif
      ? compte.sousComptes.filter((sc) => personnesVisibles.includes(sc) || revoyables.includes(sc))
      : personnesVisibles
    : [];
  const unePersonneAPaye = compte ? compte.sousComptes.some((sc) => sc.payeLe) : false;
  const reste = compte ? totalCompte({ ...compte, sousComptes: personnesARegler }) : { usd: 0, cdf: 0 };
  const totalCible = totalCompte({ ...(compte as CompteCafeteriaMiroir), sousComptes: personnesCibles(cibleEncaissement) });

  const personneChoisie = compte?.sousComptes.find((sc) => sc.id === personneEnAjout);
  if (compte && personneChoisie && compteOuvert) {
    return (
      <EcranAjoutConsommation
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
          produitsPopulairesAujourdhuiMiroir().then(setPopulaires).catch(() => {});
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre={compte ? compte.tableOuNom : "Compte cafétaria"} onRetour={onRetour} />

      {!compte && !erreur && <ActivityIndicator style={styles.chargement} color={couleurs.bleu} />}
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {compte && (
        <>
          <ConteneurFormulaire styleContenu={styles.contenu}>
            {!compteOuvert && (
              <View style={styles.bandeauFerme}>
                <Text style={styles.bandeauFermeTexte}>Ce compte est déjà encaissé.</Text>
              </View>
            )}

            {compte.origine === "SITE_PUBLIC" && (
              <View style={styles.bandeauWeb}>
                <Globe size={16} color={couleurs.bleu} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bandeauWebTitre}>Commande passée depuis le site web</Text>
                  <Text style={styles.bandeauWebReference}>
                    Référence : {compte.id.slice(0, 8).toUpperCase()}
                  </Text>
                  {compte.contactClient && <Text style={styles.bandeauWebTexte}>Contact : {compte.contactClient}</Text>}
                  {compte.noteClient && <Text style={styles.bandeauWebTexte}>« {compte.noteClient} »</Text>}
                </View>
              </View>
            )}

            {compteOuvert && !operer && (
              <Text style={styles.aide}>Lecture seule — ajouter des consommations et encaisser sont réservés au personnel de la cafétaria.</Text>
            )}
            {compteOuvert && operer && compte.sousComptes.length > 0 && (
              <Text style={styles.aide}>Touchez une personne pour lui ajouter des consommations.</Text>
            )}

            {personnesAffichees.map((sousCompte) => {
              const totalPersonne = totalSousCompte(sousCompte);
              const enAttenteSync = idsSousCompteEnAttente.has(sousCompte.id);
              const nbArticles = nombreArticles(sousCompte);
              const contenu = (
                <>
                  <View style={styles.enteteSousCompte}>
                    <View style={styles.identite}>
                      <Text style={styles.nomSousCompte}>{sousCompte.nom}</Text>
                      <Text style={styles.resume}>
                        {nbArticles === 0 ? "Aucun article" : `${nbArticles} article${nbArticles > 1 ? "s" : ""}`}
                        {enAttenteSync ? " · Synchronisation…" : ""}
                      </Text>
                    </View>
                    {sousCompte.payeLe ? (
                      <View style={styles.badgePaye}>
                        <Check size={14} color={couleurs.succes} />
                        <Text style={styles.badgePayeTexte}>Payé</Text>
                      </View>
                    ) : (
                      compteOuvert && operer && (
                        <View style={[styles.boutonPersonne, enAttenteSync && styles.boutonDesactive]}>
                          <Plus size={16} color="#fff" />
                          <Text style={styles.boutonPersonneTexte}>Ajouter</Text>
                        </View>
                      )
                    )}
                  </View>
                  {sousCompte.lignes.map((ligne) => {
                    const styleBadge =
                      ligne.statut === StatutLigne.EN_ATTENTE
                        ? styles.badgeStatut_EN_ATTENTE
                        : ligne.statut === StatutLigne.EN_PREPARATION
                          ? styles.badgeStatut_EN_PREPARATION
                          : styles.badgeStatut_PRET;
                    return (
                    <View key={ligne.id} style={styles.ligneCommande}>
                      <View style={styles.ligneGauche}>
                        <Text style={styles.ligneTexte}>
                          {ligne.quantite}x {ligne.produit.nom}
                        </Text>
                        {cuisineActivee && ligne.statut && ligne.statut !== StatutLigne.SERVI && (
                          <Text style={[styles.badgeStatut, styleBadge]}>
                            {LIBELLE_STATUT_LIGNE[ligne.statut]}
                          </Text>
                        )}
                      </View>
                      <View style={styles.ligneDroite}>
                        {cuisineActivee && ligne.statut === StatutLigne.PRET && ligne.remoteId && (
                          <Pressable
                            style={[styles.boutonServi, serviEnCours.has(ligne.id) && styles.boutonDesactive]}
                            onPress={() => void marquerServi(ligne)}
                            accessibilityRole="button"
                            accessibilityLabel={`Marquer ${ligne.produit.nom} comme servi`}
                          >
                            <Text style={styles.boutonServiTexte}>{serviEnCours.has(ligne.id) ? "…" : "Servi"}</Text>
                          </Pressable>
                        )}
                        <Text style={styles.ligneMontant}>
                          {formatMontant(Number(ligne.prixUnitaire) * Number(ligne.quantite), ligne.devise)}
                        </Text>
                      </View>
                    </View>
                    );
                  })}
                  {(totalPersonne.usd > 0 || totalPersonne.cdf > 0) && (
                    <View style={styles.totauxSousCompte}>
                      {totalPersonne.usd > 0 && <Text style={styles.totalSousCompteTexte}>{formatMontant(totalPersonne.usd, Devise.USD)}</Text>}
                      {totalPersonne.cdf > 0 && <Text style={styles.totalSousCompteTexte}>{formatMontant(totalPersonne.cdf, Devise.CDF)}</Text>}
                    </View>
                  )}
                  {compteOuvert && sousCompte.payeLe && !voirPayeesActif && <Text style={styles.indiceBalayage}>Balayez vers la droite pour masquer →</Text>}
                  {compteOuvert && operer && !sousCompte.payeLe && sousCompte.lignes.length > 0 && (
                    <Pressable
                      style={[styles.boutonEncaisserPersonne, personneEnAttente(sousCompte) && styles.boutonDesactive]}
                      onPress={() => ouvrirEncaissement(sousCompte.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Encaisser ${sousCompte.nom}`}
                    >
                      <Text style={styles.boutonEncaisserTexte}>
                        {personneEnAttente(sousCompte) ? "Synchronisation…" : `Encaisser ${sousCompte.nom}`}
                      </Text>
                    </Pressable>
                  )}
                </>
              );
              return compteOuvert && operer && !sousCompte.payeLe ? (
                <Pressable
                  key={sousCompte.id}
                  style={styles.carteSousCompte}
                  onPress={() => ouvrirAjout(sousCompte)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter des consommations pour ${sousCompte.nom}`}
                >
                  {contenu}
                </Pressable>
              ) : compteOuvert && sousCompte.payeLe && !voirPayeesActif ? (
                <CarteBalayable
                  key={sousCompte.id}
                  onMasquer={() => setMasquees((courant) => new Set(courant).add(sousCompte.id))}
                  libelle={`Masquer ${sousCompte.nom}`}
                >
                  <View style={styles.carteSousCompte}>{contenu}</View>
                </CarteBalayable>
              ) : (
                <View key={sousCompte.id} style={styles.carteSousCompte}>
                  {contenu}
                </View>
              );
            })}

            {compteOuvert && revoyables.length > 0 && (
              <Pressable onPress={() => setVoirPayees((v) => !v)} accessibilityRole="button">
                <Text style={styles.lienPayees}>
                  {voirPayeesActif
                    ? "Masquer les personnes payées"
                    : `${revoyables.length} personne${revoyables.length > 1 ? "s" : ""} payée${revoyables.length > 1 ? "s" : ""} masquée${revoyables.length > 1 ? "s" : ""} · Afficher`}
                </Text>
              </Pressable>
            )}

            {compteOuvert && operer && (
              <Pressable
                style={[styles.boutonSecondaire, compteEnAttente && styles.boutonDesactive]}
                onPress={ouvrirModalePersonne}
                disabled={compteEnAttente}
              >
                <UserPlus size={16} color={couleurs.bleu} />
                <Text style={styles.boutonSecondaireTexte}>
                  {compteEnAttente ? "Compte en cours de synchronisation…" : "Ajouter une personne"}
                </Text>
              </Pressable>
            )}

            <View style={styles.carteTotal}>
              <Text style={styles.labelTotal}>{unePersonneAPaye && compteOuvert ? "Reste à payer" : "Total"}</Text>
              {(unePersonneAPaye && compteOuvert ? reste : total).usd === 0 && (unePersonneAPaye && compteOuvert ? reste : total).cdf === 0 ? (
                <Text style={styles.vide}>{unePersonneAPaye && compteOuvert ? "Rien à payer pour l'instant." : "Aucune ligne pour l'instant."}</Text>
              ) : (
                <>
                  {(unePersonneAPaye && compteOuvert ? reste : total).usd > 0 && (
                    <Text style={styles.montantTotal}>{formatMontant((unePersonneAPaye && compteOuvert ? reste : total).usd, Devise.USD)}</Text>
                  )}
                  {(unePersonneAPaye && compteOuvert ? reste : total).cdf > 0 && (
                    <Text style={styles.montantTotal}>{formatMontant((unePersonneAPaye && compteOuvert ? reste : total).cdf, Devise.CDF)}</Text>
                  )}
                </>
              )}
            </View>
          </ConteneurFormulaire>

          {compteOuvert && operer && personnesARegler.length > 1 && (
            <View style={styles.barreActions}>
              <Pressable
                style={[styles.boutonToutEncaisser, compteEtSesEnfantsEnAttente && styles.boutonDesactive]}
                onPress={() => ouvrirEncaissement("tout")}
              >
                <Text style={styles.boutonToutEncaisserTexte}>
                  {compteEtSesEnfantsEnAttente ? "Synchronisation…" : "Tout encaisser"}
                </Text>
                <Text style={styles.aideToutEncaisser}>Quand une personne règle pour tout le monde</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Ajouter une personne */}
      <FeuilleModale visible={modalePersonne} onFermer={() => setModalePersonne(false)} titre="Ajouter une personne">
        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.champ}
          value={nomPersonne}
          onChangeText={setNomPersonne}
          placeholder="Ex. Personne 2"
          placeholderTextColor={couleurs.encreFaible}
        />
        {erreurAction && <Text style={styles.erreurFormulaire}>{erreurAction}</Text>}
        <Pressable style={styles.bouton} onPress={ajouterPersonne} disabled={enEnvoi}>
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Ajouter"}</Text>
        </Pressable>
      </FeuilleModale>

      {/* Encaisser */}
      <FeuilleModale
        visible={modaleEncaissement}
        onFermer={terminerEncaissement}
        titre={cibleEncaissement === "tout" ? "Tout encaisser" : `Encaisser ${recuCompte?.sousComptes[0]?.nom ?? personnesCibles(cibleEncaissement)[0]?.nom ?? ""}`}
      >
        {venteEncaissee ? (
          <>
            {lignesRecu && <ApercuRecu lignes={lignesRecu} />}
            <View style={styles.carteTotal}>
              <Text style={styles.labelTotal}>Reçu {venteEncaissee.numeroRecu}</Text>
              {Number(venteEncaissee.montantTotalUSD) > 0 && (
                <Text style={styles.montantTotal}>{formatMontant(venteEncaissee.montantTotalUSD, Devise.USD)}</Text>
              )}
              {Number(venteEncaissee.montantTotalCDF) > 0 && (
                <Text style={styles.montantTotal}>{formatMontant(venteEncaissee.montantTotalCDF, Devise.CDF)}</Text>
              )}
            </View>
            {messageImpression && <Text style={styles.confirmation}>{messageImpression}</Text>}
            <Pressable style={styles.boutonSecondaire} onPress={imprimerRecuVente} disabled={enImpression}>
              <Text style={styles.boutonSecondaireTexte}>{enImpression ? "…" : "Imprimer le reçu"}</Text>
            </Pressable>
            <Pressable style={styles.bouton} onPress={terminerEncaissement}>
              <Text style={styles.boutonTexte}>{compteSolde ? "Terminer" : "Retour au compte"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Mode de paiement</Text>
            <View style={styles.selecteurPersonne}>
              {[ModePaiement.CASH, ModePaiement.MOBILE_MONEY].map((m) => (
                <Pressable
                  key={m}
                  style={[styles.optionPersonne, modePaiement === m && styles.optionPersonneActive]}
                  onPress={() => setModePaiement(m)}
                >
                  <Text style={[styles.optionPersonneTexte, modePaiement === m && styles.optionPersonneTexteActif]}>
                    {m === ModePaiement.CASH ? "Espèces" : "Mobile money"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.carteTotal}>
              <Text style={styles.labelTotal}>À encaisser</Text>
              {totalCible.usd > 0 && <Text style={styles.montantTotal}>{formatMontant(totalCible.usd, Devise.USD)}</Text>}
              {totalCible.cdf > 0 && <Text style={styles.montantTotal}>{formatMontant(totalCible.cdf, Devise.CDF)}</Text>}
            </View>

            {erreurAction && <Text style={styles.erreurFormulaire}>{erreurAction}</Text>}

            <Pressable style={styles.bouton} onPress={encaisser} disabled={enEnvoi}>
              <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Confirmer l'encaissement"}</Text>
            </Pressable>
          </>
        )}
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  chargement: { marginTop: espacements.s6 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  contenu: { padding: espacements.s4, paddingBottom: espacements.s7, gap: espacements.s3 },
  bandeauFerme: { backgroundColor: couleurs.dangerClair, borderRadius: rayons.md, padding: espacements.s3 },
  bandeauFermeTexte: { color: couleurs.danger, fontSize: 13, fontWeight: "600" },
  bandeauWeb: {
    backgroundColor: couleurs.bleuClair,
    borderRadius: rayons.md,
    padding: espacements.s3,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: espacements.s2,
  },
  bandeauWebTitre: { color: couleurs.bleu, fontSize: 13, fontWeight: "700" },
  bandeauWebTexte: { color: couleurs.encreAttenuee, fontSize: 13, marginTop: 2 },
  bandeauWebReference: { color: couleurs.bleu, fontSize: 15, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  carteSousCompte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 6,
  },
  enteteSousCompte: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espacements.s3 },
  identite: { flex: 1 },
  resume: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: 2 },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  boutonPersonne: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: couleurs.bleu, borderRadius: rayons.pill, paddingHorizontal: espacements.s3, height: 34 },
  badgePaye: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: couleurs.succesClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s3, height: 30 },
  badgePayeTexte: { color: couleurs.succes, fontWeight: "700", fontSize: 13 },
  boutonEncaisserPersonne: { height: 44, borderRadius: rayons.sm, backgroundColor: couleurs.succes, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonToutEncaisser: { flex: 1, minHeight: 56, paddingVertical: 6, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.succes, alignItems: "center", justifyContent: "center" },
  aideToutEncaisser: { color: couleurs.encreAttenuee, fontSize: 11, marginTop: 1 },
  indiceBalayage: { fontSize: 11, color: couleurs.encreFaible, textAlign: "right", marginTop: 2 },
  lienPayees: { fontSize: 13, fontWeight: "600", color: couleurs.bleu, textAlign: "center", paddingVertical: espacements.s2 },
  boutonToutEncaisserTexte: { color: couleurs.succes, fontWeight: "700", fontSize: 14 },
  boutonPersonneTexte: { color: "#fff", fontWeight: "700", fontSize: 13 },
  nomSousCompte: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  badgeEnAttente: { fontSize: 11, fontWeight: "600", color: couleurs.encreAttenuee, fontStyle: "italic" },
  vide: { fontSize: 13, color: couleurs.encreAttenuee, fontStyle: "italic" },
  ligneCommande: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ligneGauche: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  ligneDroite: { flexDirection: "row", alignItems: "center", gap: 8 },
  ligneTexte: { fontSize: 14, color: couleurs.encre, flexShrink: 1 },
  ligneMontant: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  badgeStatut: { fontSize: 11, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 2, borderRadius: rayons.pill, overflow: "hidden" },
  badgeStatut_EN_ATTENTE: { backgroundColor: "#FFFAEB", color: "#F79009" },
  badgeStatut_EN_PREPARATION: { backgroundColor: couleurs.bleuClair, color: "#2E90FA" },
  badgeStatut_PRET: { backgroundColor: couleurs.succesClair, color: couleurs.succes },
  boutonServi: { backgroundColor: couleurs.succes, borderRadius: rayons.sm, paddingHorizontal: 10, paddingVertical: 4 },
  boutonServiTexte: { color: "#fff", fontSize: 12, fontWeight: "700" },
  totauxSousCompte: { flexDirection: "row", gap: espacements.s3, marginTop: 4, borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 6 },
  totalSousCompteTexte: { fontSize: 13, fontWeight: "700", color: couleurs.encreAttenuee },
  boutonSecondaire: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
  },
  boutonSecondaireTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
  carteTotal: {
    backgroundColor: couleurs.bleuClair,
    borderRadius: rayons.lg,
    padding: espacements.s4,
    gap: 2,
  },
  labelTotal: { fontSize: 12, fontWeight: "700", color: couleurs.bleu, textTransform: "uppercase" },
  montantTotal: { fontSize: 20, fontWeight: "800", color: couleurs.navy },

  barreActions: { flexDirection: "row", gap: espacements.s3, padding: espacements.s4, borderTopWidth: 1, borderTopColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  boutonAjouterLigne: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    height: 48,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
  },
  boutonAjouterLigneTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
  boutonEncaisser: { flex: 1, height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.succes, alignItems: "center", justifyContent: "center" },
  boutonDesactive: { opacity: 0.5 },
  boutonEncaisserTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  champProduit: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    justifyContent: "center",
    backgroundColor: couleurs.surface100,
  },
  champProduitTexte: { fontSize: 15, color: couleurs.encre, fontWeight: "600" },
  champProduitPlaceholder: { fontSize: 15, color: couleurs.encreFaible },
  selecteurPersonne: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  optionPersonne: {
    paddingHorizontal: espacements.s3,
    height: 40,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  optionPersonneActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  optionPersonneDesactivee: { opacity: 0.5 },
  optionPersonneTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  optionPersonneTexteActif: { color: "#fff" },
  ligneBientot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    opacity: 0.6,
    paddingVertical: espacements.s2,
  },
  ligneBientotTexte: { fontSize: 13, color: couleurs.encreFaible },
  badgeBientot: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeBientotTexte: { fontSize: 10, fontWeight: "700", color: couleurs.encreAttenuee },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  confirmation: { color: couleurs.succes, fontSize: 13, textAlign: "center" },
  bouton: { height: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
