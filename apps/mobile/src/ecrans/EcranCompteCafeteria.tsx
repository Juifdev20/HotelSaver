import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, ModePaiement, Produit, StatutCompte, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuVente, enteteHotel } from "@hotel-chicago/receipts";
import { Plus, UserPlus } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurProduit } from "../composants/SelecteurProduit";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { imprimerLignes } from "../impression/imprimante";
import {
  CompteCafeteriaMiroir,
  SousCompteMiroir,
  creerLigneLocal,
  creerSousCompteLocal,
  listerProduitsMiroir,
  obtenirCompteMiroir,
} from "../stockage/cafeteriaMirroir";

export interface EcranCompteCafeteriaProps {
  client: ClientApi;
  compteId: string;
  onRetour: () => void;
}

function totalSousCompte(sousCompte: SousCompteMiroir): { usd: number; cdf: number } {
  let usd = 0;
  let cdf = 0;
  for (const ligne of sousCompte.lignes) {
    const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
    if (ligne.devise === Devise.USD) usd += montant;
    else cdf += montant;
  }
  return { usd, cdf };
}

function totalCompte(compte: CompteCafeteriaMiroir): { usd: number; cdf: number } {
  return compte.sousComptes.reduce(
    (acc, sc) => {
      const t = totalSousCompte(sc);
      return { usd: acc.usd + t.usd, cdf: acc.cdf + t.cdf };
    },
    { usd: 0, cdf: 0 }
  );
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
export function EcranCompteCafeteria({ client, compteId, onRetour }: EcranCompteCafeteriaProps) {
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

  const [modaleLigne, setModaleLigne] = useState(false);
  const [sousCompteChoisi, setSousCompteChoisi] = useState<string | null>(null);
  const [produitChoisi, setProduitChoisi] = useState<Produit | null>(null);
  const [selecteurProduitOuvert, setSelecteurProduitOuvert] = useState(false);
  const [quantiteLigne, setQuantiteLigne] = useState("1");

  const [modaleEncaissement, setModaleEncaissement] = useState(false);
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.CASH);
  const [venteEncaissee, setVenteEncaissee] = useState<VenteCafeteria | null>(null);
  const [enImpression, setEnImpression] = useState(false);
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurAction, setErreurAction] = useState<string | null>(null);

  const rechargerCompte = useCallback(() => {
    obtenirCompteMiroir(compteId)
      .then(setCompte)
      .catch((e: Error) => setErreur(e.message));
  }, [compteId]);

  useEffect(() => {
    rechargerCompte();
    listerProduitsMiroir().then(setProduits).catch(() => {});
    moteurSync.forcerSynchronisation();
  }, [rechargerCompte, moteurSync]);

  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerCompte();
  }, [etatSync.dernierePousseeLe, rechargerCompte]);

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

  function ouvrirModaleLigne() {
    setSousCompteChoisi(compte?.sousComptes[0]?.id ?? null);
    setProduitChoisi(null);
    setQuantiteLigne("1");
    setErreurAction(null);
    setModaleLigne(true);
  }

  async function ajouterLigne() {
    const quantiteNombre = Number(quantiteLigne);
    if (!compte || !sousCompteChoisi || !produitChoisi || !Number.isFinite(quantiteNombre) || quantiteNombre <= 0) {
      setErreurAction("Choisissez une personne, un produit et une quantité positive.");
      return;
    }
    const sousCompte = compte.sousComptes.find((sc) => sc.id === sousCompteChoisi);
    if (!sousCompte || sousCompte.remoteId === null || idsSousCompteEnAttente.has(sousCompte.id)) {
      setErreurAction("Cette personne est en cours de synchronisation, réessayez dans un instant.");
      return;
    }
    setEnEnvoi(true);
    setErreurAction(null);
    try {
      const ligne = await creerLigneLocal(sousCompteChoisi, produitChoisi, quantiteNombre);
      await moteurSync.mettreEnFile({
        entiteType: "LigneCommande",
        localId: ligne.id,
        operation: "CREATE",
        payload: {
          compteId: compte.remoteId ?? compte.id,
          sousCompteId: sousCompte.remoteId ?? sousCompte.id,
          produitId: produitChoisi.id,
          quantite: quantiteNombre,
        },
      });
      setModaleLigne(false);
      rechargerCompte();
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  function ouvrirModaleEncaissement() {
    if (compteEtSesEnfantsEnAttente) {
      setErreurAction("Synchronisation des commandes en cours — réessayez dans un instant.");
      moteurSync.forcerSynchronisation();
      return;
    }
    setModePaiement(ModePaiement.CASH);
    setVenteEncaissee(null);
    setMessageImpression(null);
    setErreurAction(null);
    setModaleEncaissement(true);
  }

  async function encaisser() {
    if (!compte) return;
    setEnEnvoi(true);
    setErreurAction(null);
    try {
      const ventes = await client.encaisserCompte(compte.remoteId ?? compte.id, { mode: "GROUPE", modePaiement });
      setVenteEncaissee(ventes[0]);
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function imprimerRecuVente() {
    if (!venteEncaissee || !compte) return;
    setEnImpression(true);
    setMessageImpression(null);
    try {
      await imprimerLignes(construireRecuVente(venteEncaissee, compte, utilisateur.nom, enteteHotel(utilisateur)));
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnImpression(false);
    }
  }

  function terminerEncaissement() {
    setModaleEncaissement(false);
    onRetour();
  }

  const total = compte ? totalCompte(compte) : { usd: 0, cdf: 0 };
  const compteOuvert = compte?.statut === StatutCompte.OUVERT;

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

            {compte.sousComptes.map((sousCompte) => {
              const totalPersonne = totalSousCompte(sousCompte);
              const enAttenteSync = idsSousCompteEnAttente.has(sousCompte.id);
              return (
                <View key={sousCompte.id} style={styles.carteSousCompte}>
                  <View style={styles.enteteSousCompte}>
                    <Text style={styles.nomSousCompte}>{sousCompte.nom}</Text>
                    {enAttenteSync && <Text style={styles.badgeEnAttente}>Synchronisation…</Text>}
                  </View>
                  {sousCompte.lignes.length === 0 ? (
                    <Text style={styles.vide}>Aucune ligne.</Text>
                  ) : (
                    sousCompte.lignes.map((ligne) => (
                      <View key={ligne.id} style={styles.ligneCommande}>
                        <Text style={styles.ligneTexte}>
                          {ligne.quantite}x {ligne.produit.nom}
                        </Text>
                        <Text style={styles.ligneMontant}>
                          {formatMontant(Number(ligne.prixUnitaire) * Number(ligne.quantite), ligne.devise)}
                        </Text>
                      </View>
                    ))
                  )}
                  {(totalPersonne.usd > 0 || totalPersonne.cdf > 0) && (
                    <View style={styles.totauxSousCompte}>
                      {totalPersonne.usd > 0 && <Text style={styles.totalSousCompteTexte}>{formatMontant(totalPersonne.usd, Devise.USD)}</Text>}
                      {totalPersonne.cdf > 0 && <Text style={styles.totalSousCompteTexte}>{formatMontant(totalPersonne.cdf, Devise.CDF)}</Text>}
                    </View>
                  )}
                </View>
              );
            })}

            {compteOuvert && (
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
              <Text style={styles.labelTotal}>Total</Text>
              {total.usd === 0 && total.cdf === 0 ? (
                <Text style={styles.vide}>Aucune ligne pour l'instant.</Text>
              ) : (
                <>
                  {total.usd > 0 && <Text style={styles.montantTotal}>{formatMontant(total.usd, Devise.USD)}</Text>}
                  {total.cdf > 0 && <Text style={styles.montantTotal}>{formatMontant(total.cdf, Devise.CDF)}</Text>}
                </>
              )}
            </View>
          </ConteneurFormulaire>

          {compteOuvert && (
            <View style={styles.barreActions}>
              <Pressable style={styles.boutonAjouterLigne} onPress={ouvrirModaleLigne}>
                <Plus size={18} color={couleurs.bleu} />
                <Text style={styles.boutonAjouterLigneTexte}>Ajouter une ligne</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.boutonEncaisser,
                  (total.usd === 0 && total.cdf === 0 || compteEtSesEnfantsEnAttente) && styles.boutonDesactive,
                ]}
                onPress={ouvrirModaleEncaissement}
                disabled={total.usd === 0 && total.cdf === 0}
              >
                <Text style={styles.boutonEncaisserTexte}>
                  {compteEtSesEnfantsEnAttente ? "Synchronisation…" : "Encaisser"}
                </Text>
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

      {/* Ajouter une ligne */}
      <FeuilleModale visible={modaleLigne} onFermer={() => setModaleLigne(false)} titre="Ajouter une ligne">
        {compte && compte.sousComptes.length > 1 && (
          <>
            <Text style={styles.label}>Personne</Text>
            <View style={styles.selecteurPersonne}>
              {compte.sousComptes.map((sc) => {
                const enAttenteSync = idsSousCompteEnAttente.has(sc.id);
                return (
                  <Pressable
                    key={sc.id}
                    style={[
                      styles.optionPersonne,
                      sousCompteChoisi === sc.id && styles.optionPersonneActive,
                      enAttenteSync && styles.optionPersonneDesactivee,
                    ]}
                    onPress={() => !enAttenteSync && setSousCompteChoisi(sc.id)}
                    disabled={enAttenteSync}
                  >
                    <Text style={[styles.optionPersonneTexte, sousCompteChoisi === sc.id && styles.optionPersonneTexteActif]}>
                      {enAttenteSync ? `${sc.nom} (…)` : sc.nom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>Produit</Text>
        <Pressable style={styles.champProduit} onPress={() => setSelecteurProduitOuvert(true)}>
          <Text style={produitChoisi ? styles.champProduitTexte : styles.champProduitPlaceholder}>
            {produitChoisi ? produitChoisi.nom : "Choisir un produit"}
          </Text>
        </Pressable>

        <Text style={styles.label}>Quantité</Text>
        <TextInput
          style={styles.champ}
          value={quantiteLigne}
          onChangeText={setQuantiteLigne}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={couleurs.encreFaible}
        />

        {erreurAction && <Text style={styles.erreurFormulaire}>{erreurAction}</Text>}

        <Pressable style={styles.bouton} onPress={ajouterLigne} disabled={enEnvoi}>
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Ajouter"}</Text>
        </Pressable>
      </FeuilleModale>

      <SelecteurProduit
        visible={selecteurProduitOuvert}
        produits={produits ?? []}
        onFermer={() => setSelecteurProduitOuvert(false)}
        onChoisir={(p) => {
          setProduitChoisi(p);
          setSelecteurProduitOuvert(false);
        }}
      />

      {/* Encaisser */}
      <FeuilleModale visible={modaleEncaissement} onFermer={terminerEncaissement} titre="Encaisser">
        {venteEncaissee ? (
          <>
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
              <Text style={styles.boutonTexte}>Terminer</Text>
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

            <View style={styles.ligneBientot}>
              <Text style={styles.ligneBientotTexte}>Répartition par personne / part égale</Text>
              <View style={styles.badgeBientot}>
                <Text style={styles.badgeBientotTexte}>Bientôt</Text>
              </View>
            </View>

            <View style={styles.carteTotal}>
              <Text style={styles.labelTotal}>À encaisser</Text>
              {total.usd > 0 && <Text style={styles.montantTotal}>{formatMontant(total.usd, Devise.USD)}</Text>}
              {total.cdf > 0 && <Text style={styles.montantTotal}>{formatMontant(total.cdf, Devise.CDF)}</Text>}
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
  carteSousCompte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 6,
  },
  enteteSousCompte: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nomSousCompte: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  badgeEnAttente: { fontSize: 11, fontWeight: "600", color: couleurs.encreAttenuee, fontStyle: "italic" },
  vide: { fontSize: 13, color: couleurs.encreAttenuee, fontStyle: "italic" },
  ligneCommande: { flexDirection: "row", justifyContent: "space-between" },
  ligneTexte: { fontSize: 14, color: couleurs.encre, flexShrink: 1 },
  ligneMontant: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
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
