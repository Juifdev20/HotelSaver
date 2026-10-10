import * as React from "react";
import { ouvrirLienSur } from "../liens";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { LignePreparationInventaire, InventairePhysique, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { ClipboardCheck, FileText, History } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { SelecteurDate } from "../composants/SelecteurDate";
import { useDonnee } from "../hooks/useDonnee";
import { lireQuantite } from "@hotel-chicago/regles";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";

export interface EcranInventaireProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  onRetour: () => void;
}

type Etape = 1 | 2 | 3;
type Onglet = "nouveau" | "historique";

interface SaisieItem {
  produitId: string;
  stockPhysique: string;
  note: string;
}

/** Brouillon d'un inventaire en cours de comptage : gardé en mémoire tant que l'application reste ouverte, pour ne pas perdre
 * des dizaines de comptages en quittant l'écran par erreur (retour U11). Effacé à l'enregistrement. */
interface Brouillon {
  dateDebut: string;
  dateFin: string;
  titre: string;
  lignes: LignePreparationInventaire[];
  saisies: Record<string, SaisieItem>;
}
let brouillonInventaire: Brouillon | null = null;

/** Stock physique saisi : « 1,5 » litre, « 0,25 » kg (virgule ou point) ; 0 accepté (produit absent) — comme sur le bureau. */
function lireStockPhysique(saisie: string) {
  return lireQuantite(saisie, { autoriserZero: true, max: 1_000_000 });
}

/** Écart arrondi à 3 décimales : « 2,3 − 2 » ne doit pas afficher 0,2999999. */
function ecartArrondi(physique: number, theorique: number): number {
  return Math.round((physique - theorique) * 1000) / 1000;
}

/** « A, B, C et 4 autres » : nomme les produits concernés sans noyer le message. */
function listerNoms(noms: string[], max = 4): string {
  if (noms.length <= max) return noms.join(", ");
  return `${noms.slice(0, max).join(", ")} et ${noms.length - max} autre${noms.length - max > 1 ? "s" : ""}`;
}

export function EcranInventaire({ client, utilisateur, onRetour }: EcranInventaireProps) {
  const [onglet, setOnglet] = useState<Onglet>("nouveau");
  const [etape, setEtape] = useState<Etape>(() => (brouillonInventaire ? 2 : 1));

  // Étape 1 — période
  const [dateDebut, setDateDebut] = useState(() => brouillonInventaire?.dateDebut ?? "");
  const [dateFin, setDateFin] = useState(() => brouillonInventaire?.dateFin ?? "");
  const [titre, setTitre] = useState(() => brouillonInventaire?.titre ?? "");

  // Étape 2 — saisie physique
  const [lignes, setLignes] = useState<LignePreparationInventaire[]>(() => brouillonInventaire?.lignes ?? []);
  const [saisies, setSaisies] = useState<Record<string, SaisieItem>>(() => brouillonInventaire?.saisies ?? {});
  const [enChargement, setEnChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Étape 3 — résultat
  const [inventaireCreé, setInventaireCreé] = useState<InventairePhysique | null>(null);
  const [urlPdf, setUrlPdf] = useState<string | null>(null);
  const [erreurPdf, setErreurPdf] = useState<string | null>(null);
  const [enEnvoi, setEnEnvoi] = useState(false);

  // Historique
  const { donnee: historique, erreur: erreurHistorique, enCours: enCoursHistorique, recharger: rechargerHistorique } =
    useDonnee(() => client.listerInventaires(), client);

  // Le brouillon suit la saisie (étape 2 seulement) ; il disparaît quand l'inventaire est enregistré.
  useEffect(() => {
    if (etape === 2) brouillonInventaire = { dateDebut, dateFin, titre, lignes, saisies };
  }, [etape, dateDebut, dateFin, titre, lignes, saisies]);

  /** « Retour » (en-tête et bouton Retour d'Android) : de l'étape 2 on revient à la période en gardant les comptages. */
  function retour() {
    if (enEnvoi) return;
    if (etape === 2 && nbSaisis > 0) {
      confirmerAction({
        titre: "Quitter l'inventaire ?",
        message: `${nbSaisis} produit${nbSaisis > 1 ? "s" : ""} déjà compté${nbSaisis > 1 ? "s" : ""}. Votre saisie est gardée tant que l'application reste ouverte : vous la retrouverez en revenant ici.`,
        libelleConfirmer: "Quitter",
        libelleRefuser: "Continuer le comptage",
        onConfirmer: onRetour,
      });
      return;
    }
    onRetour();
  }


  async function lancerEvaluation() {
    if (!dateDebut.match(/^\d{4}-\d{2}-\d{2}$/) || !dateFin.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setErreur("Renseignez la date de début et la date de fin.");
      return;
    }
    setErreur(null);
    setEnChargement(true);
    try {
      const data = await client.preparerInventaire(dateDebut, dateFin);
      // Même période qu'un brouillon : les comptages déjà saisis sont conservés (retour au « Retour » de l'étape 2).
      const memePeriode = brouillonInventaire?.dateDebut === dateDebut && brouillonInventaire?.dateFin === dateFin;
      const init: Record<string, SaisieItem> = {};
      for (const l of data) {
        init[l.produitId] = (memePeriode ? brouillonInventaire?.saisies[l.produitId] : undefined) ?? { produitId: l.produitId, stockPhysique: "", note: "" };
      }
      setLignes(data);
      setSaisies(init);
      setEtape(2);
    } catch (e) {
      setErreur(messageErreur(e, "L'évaluation du stock n'a pas pu être préparée. Réessayez."));
    } finally {
      setEnChargement(false);
    }
  }

  /** Vérifie le comptage (un produit non compté n'est JAMAIS compté comme 0), puis demande confirmation avant l'envoi. */
  function demanderValidation() {
    const nom = (produitId: string) => lignes.find((l) => l.produitId === produitId)?.nom ?? "Produit";
    const manquants = lignes.filter((l) => (saisies[l.produitId]?.stockPhysique ?? "").trim() === "");
    if (manquants.length > 0) {
      setErreur(
        `${manquants.length} produit${manquants.length > 1 ? "s" : ""} non compté${manquants.length > 1 ? "s" : ""} : ${listerNoms(manquants.map((l) => l.nom))}. Saisissez 0 seulement si le produit est vraiment absent.`
      );
      return;
    }
    const valeurs = new Map<string, number>();
    for (const l of lignes) {
      const lu = lireStockPhysique(saisies[l.produitId]!.stockPhysique);
      if (!lu.ok) {
        setErreur(`${nom(l.produitId)} : ${lu.message}`);
        return;
      }
      valeurs.set(l.produitId, lu.valeur);
    }
    const ecarts = lignes.filter((l) => ecartArrondi(valeurs.get(l.produitId)!, l.stockTheorique) !== 0);
    const sansNote = ecarts.filter((l) => !(saisies[l.produitId]?.note ?? "").trim());
    if (sansNote.length > 0) {
      setErreur(
        `${sansNote.length} écart${sansNote.length > 1 ? "s" : ""} sans justification : ${listerNoms(sansNote.map((l) => l.nom))}. Expliquez chaque écart dans le champ Note.`
      );
      return;
    }
    setErreur(null);
    confirmerAction({
      titre: `Enregistrer l'inventaire (${ecarts.length} écart${ecarts.length > 1 ? "s" : ""}) ?`,
      message:
        `${lignes.length} produit${lignes.length > 1 ? "s" : ""} compté${lignes.length > 1 ? "s" : ""}. ` +
        (ecarts.length === 0
          ? "Aucun écart avec le stock théorique."
          : `${ecarts.length} produit${ecarts.length > 1 ? "s ont" : " a"} un écart avec le stock théorique.`) +
        "\n\nL'inventaire est enregistré définitivement.",
      libelleConfirmer: "Enregistrer l'inventaire",
      libelleRefuser: "Continuer le comptage",
      onConfirmer: () => validerInventaire(valeurs),
    });
  }

  async function validerInventaire(valeurs: Map<string, number>) {
    if (enEnvoi) return;
    setErreur(null);
    setEnEnvoi(true);
    try {
      const inv = await client.creerInventaire({
        dateDebut,
        dateFin,
        titre: titre.trim() || undefined,
        items: lignes.map((l) => ({
          produitId: l.produitId,
          stockPhysique: valeurs.get(l.produitId)!,
          note: saisies[l.produitId]?.note.trim() || undefined,
        })),
      });
      brouillonInventaire = null;
      setInventaireCreé(inv);
      setErreurPdf(null);
      // Récupérer l'URL du PDF : l'inventaire est déjà enregistré, un échec ici se dit mais ne bloque rien.
      try {
        const url = await client.urlInventaire(inv.id);
        setUrlPdf(typeof url === "string" ? url : (url as { url: string }).url);
      } catch (e) {
        setErreurPdf(`Le PDF n'a pas pu être préparé : ${messageErreur(e, "réessayez plus tard depuis l'historique.")}`);
      }
      setEtape(3);
    } catch (e) {
      setErreur(messageErreur(e, "L'inventaire n'a pas pu être enregistré. Votre comptage est conservé : réessayez."));
    } finally {
      setEnEnvoi(false);
    }
  }

  async function ouvrirPdf(id: string | null, urlConnue?: string | null) {
    setErreurPdf(null);
    try {
      let url = urlConnue ?? null;
      if (!url && id) {
        const res = await client.urlInventaire(id);
        url = typeof res === "string" ? res : (res as { url: string }).url;
      }
      if (url) await ouvrirLienSur(url);
    } catch (e) {
      setErreurPdf(`Le PDF n'a pas pu être ouvert : ${messageErreur(e, "vérifiez la connexion puis réessayez.")}`);
    }
  }

  function reinitialiser() {
    setEtape(1);
    setDateDebut("");
    setDateFin("");
    setTitre("");
    setLignes([]);
    setSaisies({});
    setInventaireCreé(null);
    setUrlPdf(null);
    setErreurPdf(null);
    setErreur(null);
    brouillonInventaire = null;
  }

  const nbSaisis = Object.values(saisies).filter((s) => s.stockPhysique.trim() !== "").length;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Inventaire" sousTitre="Évaluation du stock physique." onRetour={retour} />

      {/* Onglets */}
      <View style={styles.onglets}>
        <Pressable
          style={[styles.onglet, onglet === "nouveau" && styles.ongletActif]}
          onPress={() => setOnglet("nouveau")}
          accessibilityRole="tab"
          accessibilityLabel="Nouvel inventaire"
          accessibilityState={{ selected: onglet === "nouveau" }}
        >
          <Text style={[styles.ongletTexte, onglet === "nouveau" && styles.ongletTexteActif]}>Nouvel inventaire</Text>
        </Pressable>
        <Pressable
          style={[styles.onglet, onglet === "historique" && styles.ongletActif]}
          onPress={() => setOnglet("historique")}
          accessibilityRole="tab"
          accessibilityLabel="Historique"
          accessibilityState={{ selected: onglet === "historique" }}
        >
          <Text style={[styles.ongletTexte, onglet === "historique" && styles.ongletTexteActif]}>Historique</Text>
        </Pressable>
      </View>

      {/* ── HISTORIQUE ── */}
      {onglet === "historique" && erreurHistorique && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreurHistorique}
          {historique ? " Les inventaires affichés peuvent ne pas être à jour." : ""}
        </Text>
      )}
      {onglet === "historique" && erreurPdf && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreurPdf}
        </Text>
      )}
      {onglet === "historique" && (
        <FlatList
          data={historique ?? []}
          keyExtractor={(inv) => inv.id}
          contentContainerStyle={styles.liste}
          refreshControl={<RefreshControl refreshing={enCoursHistorique} onRefresh={rechargerHistorique} />}
          ListEmptyComponent={
            <View style={styles.videConteneur}>
              <History size={32} color={couleurs.encreFaible} />
              <Text style={styles.videTitre}>Aucun inventaire enregistré.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const nbEcarts = item.items.filter((i) => Number(i.ecart) !== 0).length;
            return (
              <View style={styles.carte}>
                <View style={styles.carteEntete}>
                  <Text style={styles.nom}>{item.titre ?? `Inventaire du ${item.dateDebut}`}</Text>
                  {nbEcarts > 0 && (
                    <View style={styles.badgeEcart}>
                      <Text style={styles.badgeEcartTexte}>{nbEcarts} écart{nbEcarts > 1 ? "s" : ""}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sousTitreTexte}>
                  {item.dateDebut} → {item.dateFin} · {item.items.length} produits
                </Text>
                {item.pdfUrl && (
                  <Pressable
                    style={styles.boutonPdf}
                    onPress={() => void ouvrirPdf(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir le PDF de ${item.titre ?? `l'inventaire du ${item.dateDebut}`}`}
                  >
                    <FileText size={14} color={couleurs.bleu} />
                    <Text style={styles.boutonPdfTexte}>Ouvrir le PDF</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ── NOUVEL INVENTAIRE ── */}
      {onglet === "nouveau" && (
        <>
          {/* Indicateur d'étapes */}
          <View style={styles.etapes}>
            {([1, 2, 3] as Etape[]).map((n) => (
              <View key={n} style={styles.etapeConteneur} accessible accessibilityLabel={`Étape ${n} sur 3 : ${n === 1 ? "période" : n === 2 ? "saisie" : "résultat"}${etape === n ? ", étape en cours" : ""}`}>
                <View style={[styles.etapeCercle, etape >= n && styles.etapeCercleActif]}>
                  <Text style={[styles.etapeNumero, etape >= n && styles.etapeNumeroActif]}>{n}</Text>
                </View>
                <Text style={styles.etapeLibelle}>{n === 1 ? "Période" : n === 2 ? "Saisie" : "Résultat"}</Text>
              </View>
            ))}
          </View>

          {erreur && (
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreur}
            </Text>
          )}

          {/* ── ÉTAPE 1 ── */}
          {etape === 1 && (
            <ConteneurFormulaire>
              {brouillonInventaire && (
                <Text style={styles.noteBrouillon}>
                  Un comptage est en cours : relancer l'évaluation pour la même période le reprend avec vos saisies.
                </Text>
              )}
              <Text style={styles.label}>Date de début</Text>
              <SelecteurDate libelle="Date de début de la période" valeur={dateDebut} onChange={setDateDebut} />
              <Text style={styles.label}>Date de fin</Text>
              <SelecteurDate libelle="Date de fin de la période" valeur={dateFin} onChange={setDateFin} />
              <Text style={styles.label}>Titre (optionnel)</Text>
              <TextInput
                style={styles.champ}
                value={titre}
                onChangeText={setTitre}
                accessibilityLabel="Titre de l'inventaire, optionnel"
                placeholder="Ex. Inventaire octobre 2026"
                placeholderTextColor={couleurs.encreFaible}
              />
              <Pressable
                style={styles.boutonPrimaire}
                onPress={lancerEvaluation}
                disabled={enChargement}
                accessibilityRole="button"
                accessibilityLabel="Lancer l'évaluation"
                accessibilityState={{ disabled: enChargement, busy: enChargement }}
              >
                {enChargement ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.boutonPrimaireTexte}>Lancer l'évaluation</Text>
                )}
              </Pressable>
            </ConteneurFormulaire>
          )}

          {/* ── ÉTAPE 2 ── */}
          {etape === 2 && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
              <View style={styles.barreEtat}>
                <Text style={styles.barreEtatTexte}>{nbSaisis}/{lignes.length} produits saisis</Text>
              </View>
              <FlatList
                data={lignes}
                keyExtractor={(l) => l.produitId}
                contentContainerStyle={styles.liste}
                renderItem={({ item }) => {
                  const s = saisies[item.produitId];
                  const physiqueLu = (s?.stockPhysique ?? "").trim() !== "" ? lireStockPhysique(s!.stockPhysique) : null;
                  const physique = physiqueLu && physiqueLu.ok ? physiqueLu.valeur : null;
                  const erreurSaisie = physiqueLu && !physiqueLu.ok ? physiqueLu.message : null;
                  const ecart = physique !== null ? ecartArrondi(physique, item.stockTheorique) : null;
                  return (
                    <View style={[
                      styles.carte,
                      ecart !== null && ecart < 0 ? styles.carteManque :
                      ecart !== null && ecart > 0 ? styles.carteSurplus : undefined,
                    ]}>
                      <View style={styles.carteEntete}>
                        <Text style={styles.nom}>{item.nom}</Text>
                        <Text style={styles.stockTheo}>Théo. : {item.stockTheorique}</Text>
                      </View>
                      <Text style={styles.sousTitreTexte}>{item.categorie}</Text>
                      <TextInput
                        style={styles.champSaisie}
                        value={s?.stockPhysique ?? ""}
                        onChangeText={(v) =>
                          setSaisies((prev) => ({
                            ...prev,
                            [item.produitId]: { ...prev[item.produitId]!, stockPhysique: v },
                          }))
                        }
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Stock physique compté de ${item.nom}, stock théorique ${item.stockTheorique}`}
                        placeholder="Stock physique compté"
                        placeholderTextColor={couleurs.encreFaible}
                      />
                      {erreurSaisie && (
                        <Text style={styles.erreurLigne} accessibilityRole="alert">
                          {erreurSaisie}
                        </Text>
                      )}
                      {ecart !== null && ecart !== 0 && (
                        <>
                          <Text style={[styles.ecartTexte, ecart < 0 ? styles.ecartNegatif : styles.ecartPositif]}>
                            Écart : {ecart > 0 ? "+" : ""}{ecart}
                          </Text>
                          <TextInput
                            style={styles.champNote}
                            value={s?.note ?? ""}
                            onChangeText={(v) =>
                              setSaisies((prev) => ({
                                ...prev,
                                [item.produitId]: { ...prev[item.produitId]!, note: v },
                              }))
                            }
                            accessibilityLabel={`Note obligatoire pour l'écart de ${item.nom}`}
                            placeholder="Note obligatoire pour cet écart"
                            placeholderTextColor={couleurs.encreFaible}
                          />
                        </>
                      )}
                    </View>
                  );
                }}
              />
              <View style={styles.barreAction}>
                <Pressable style={styles.boutonSecondaire} onPress={() => setEtape(1)} accessibilityRole="button" accessibilityLabel="Retour à la période (le comptage est gardé)">
                  <Text style={styles.boutonSecondaireTexte}>Retour</Text>
                </Pressable>
                <Pressable
                  style={[styles.boutonPrimaire, { flex: 1 }]}
                  onPress={demanderValidation}
                  disabled={enEnvoi}
                  accessibilityRole="button"
                  accessibilityLabel="Valider l'inventaire"
                  accessibilityState={{ disabled: enEnvoi, busy: enEnvoi }}
                >
                  {enEnvoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonPrimaireTexte}>Valider</Text>}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          )}

          {/* ── ÉTAPE 3 ── */}
          {etape === 3 && inventaireCreé && (
            <ConteneurFormulaire>
              <View style={styles.carteProfil}>
                <ClipboardCheck size={36} color={couleurs.succes} />
                <Text style={styles.titreResultat}>Inventaire enregistré</Text>
              </View>

              <View style={styles.grilleTuiles}>
                <View style={styles.tuile}>
                  <Text style={styles.tuileValeur}>{inventaireCreé.items.length}</Text>
                  <Text style={styles.tuileLibelle}>Produits</Text>
                </View>
                <View style={styles.tuile}>
                  <Text style={styles.tuileValeur}>
                    {inventaireCreé.items.filter((i) => Number(i.ecart) !== 0).length}
                  </Text>
                  <Text style={styles.tuileLibelle}>Écarts</Text>
                </View>
                <View style={[styles.tuile, { backgroundColor: couleurs.dangerClair }]}>
                  <Text style={[styles.tuileValeur, { color: couleurs.danger }]}>
                    {inventaireCreé.items.filter((i) => Number(i.ecart) < 0).length}
                  </Text>
                  <Text style={styles.tuileLibelle}>Manquants</Text>
                </View>
                <View style={[styles.tuile, { backgroundColor: couleurs.succesClair }]}>
                  <Text style={[styles.tuileValeur, { color: couleurs.succes }]}>
                    {inventaireCreé.items.filter((i) => Number(i.ecart) > 0).length}
                  </Text>
                  <Text style={styles.tuileLibelle}>Surplus</Text>
                </View>
              </View>

              {erreurPdf && (
                <Text style={styles.erreurLigne} accessibilityRole="alert">
                  {erreurPdf}
                </Text>
              )}
              {urlPdf && (
                <Pressable style={styles.boutonPdf} onPress={() => void ouvrirPdf(null, urlPdf)} accessibilityRole="button" accessibilityLabel="Télécharger le PDF de l'inventaire">
                  <FileText size={16} color={couleurs.bleu} />
                  <Text style={styles.boutonPdfTexte}>Télécharger le PDF</Text>
                </Pressable>
              )}

              <Pressable style={styles.boutonPrimaire} onPress={reinitialiser} accessibilityRole="button">
                <Text style={styles.boutonPrimaireTexte}>Nouvel inventaire</Text>
              </Pressable>
            </ConteneurFormulaire>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  onglets: {
    flexDirection: "row",
    marginHorizontal: espacements.s4,
    marginTop: espacements.s3,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: "hidden",
  },
  onglet: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface200 },
  ongletActif: { backgroundColor: couleurs.bleu },
  ongletTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  ongletTexteActif: { color: "#fff" },

  etapes: { flexDirection: "row", justifyContent: "center", gap: espacements.s5, paddingVertical: espacements.s3 },
  etapeConteneur: { alignItems: "center", gap: 4 },
  etapeCercle: {
    width: 28, height: 28, borderRadius: rayons.pill,
    backgroundColor: couleurs.surface200, borderWidth: 2, borderColor: couleurs.bordure,
    alignItems: "center", justifyContent: "center",
  },
  etapeCercleActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  etapeNumero: { fontSize: 13, fontWeight: "700", color: couleurs.encreAttenuee },
  etapeNumeroActif: { color: "#fff" },
  etapeLibelle: { fontSize: 11, color: couleurs.encreAttenuee },

  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4, marginBottom: espacements.s2 },
  erreurLigne: { color: couleurs.danger, fontSize: 12, fontWeight: "600" },
  noteBrouillon: { fontSize: 13, color: couleurs.alerte, marginBottom: espacements.s3 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  liste: { padding: espacements.s4, paddingBottom: 100, gap: espacements.s3 },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
  champ: {
    borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3, minHeight: 44, fontSize: 15,
    color: couleurs.encre, backgroundColor: couleurs.surface200,
  },

  barreEtat: {
    paddingHorizontal: espacements.s4, paddingVertical: espacements.s2,
    backgroundColor: couleurs.bleuClair,
  },
  barreEtatTexte: { fontSize: 13, color: couleurs.bleu, fontWeight: "600" },

  carte: {
    backgroundColor: couleurs.surface200, borderRadius: rayons.lg,
    borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s4, gap: 8,
  },
  carteManque: { backgroundColor: "#FFF1F0", borderColor: "#FECDCA" },
  carteSurplus: { backgroundColor: "#ECFDF3", borderColor: "#A9EFC5" },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nom: { fontSize: 15, fontWeight: "700", color: couleurs.encre, flex: 1 },
  stockTheo: { fontSize: 13, color: couleurs.encreAttenuee },
  sousTitreTexte: { fontSize: 13, color: couleurs.encreAttenuee },
  champSaisie: {
    borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3, minHeight: 44, fontSize: 14,
    color: couleurs.encre, backgroundColor: couleurs.surface100,
  },
  champNote: {
    borderWidth: 1, borderColor: couleurs.alerte, borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3, minHeight: 44, fontSize: 13,
    color: couleurs.encre, backgroundColor: couleurs.alerteClair,
  },
  ecartTexte: { fontSize: 13, fontWeight: "700" },
  ecartNegatif: { color: couleurs.danger },
  ecartPositif: { color: couleurs.succes },

  barreAction: {
    flexDirection: "row", gap: espacements.s3,
    padding: espacements.s4, borderTopWidth: 1, borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },

  boutonPrimaire: {
    minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu,
    alignItems: "center", justifyContent: "center",
  },
  boutonPrimaireTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  boutonSecondaire: {
    minHeight: 44, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure,
    alignItems: "center", justifyContent: "center", paddingHorizontal: espacements.s4,
    backgroundColor: couleurs.surface200,
  },
  boutonSecondaireTexte: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  boutonPdf: {
    flexDirection: "row", alignItems: "center", gap: espacements.s2,
    borderWidth: 1, borderColor: couleurs.bleu, borderRadius: rayons.sm,
    padding: espacements.s3, justifyContent: "center", minHeight: 44,
    backgroundColor: couleurs.bleuClair,
  },
  boutonPdfTexte: { color: couleurs.bleu, fontWeight: "600", fontSize: 14 },

  carteProfil: { alignItems: "center", gap: espacements.s2, paddingVertical: espacements.s4 },
  titreResultat: { fontSize: 18, fontWeight: "700", color: couleurs.encre },
  grilleTuiles: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s3 },
  tuile: {
    flex: 1, minWidth: "45%", backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure,
    padding: espacements.s4, alignItems: "center", gap: 4,
  },
  tuileValeur: { fontSize: 24, fontWeight: "700", color: couleurs.encre },
  tuileLibelle: { fontSize: 12, color: couleurs.encreAttenuee },

  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  badgeEcart: {
    backgroundColor: couleurs.alerteClair, borderRadius: rayons.pill,
    paddingHorizontal: espacements.s2, paddingVertical: 2,
    borderWidth: 1, borderColor: couleurs.alerte,
  },
  badgeEcartTexte: { fontSize: 11, fontWeight: "700", color: couleurs.alerte },
});
