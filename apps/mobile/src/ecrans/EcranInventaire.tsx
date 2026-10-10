import * as React from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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

export function EcranInventaire({ client, utilisateur, onRetour }: EcranInventaireProps) {
  const [onglet, setOnglet] = useState<Onglet>("nouveau");
  const [etape, setEtape] = useState<Etape>(1);

  // Étape 1 — période
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [titre, setTitre] = useState("");

  // Étape 2 — saisie physique
  const [lignes, setLignes] = useState<LignePreparationInventaire[]>([]);
  const [saisies, setSaisies] = useState<Record<string, SaisieItem>>({});
  const [enChargement, setEnChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Étape 3 — résultat
  const [inventaireCreé, setInventaireCreé] = useState<InventairePhysique | null>(null);
  const [urlPdf, setUrlPdf] = useState<string | null>(null);
  const [enEnvoi, setEnEnvoi] = useState(false);

  // Historique
  const { donnee: historique, enCours: enCoursHistorique, recharger: rechargerHistorique } =
    useDonnee(() => client.listerInventaires(), client);

  async function lancerEvaluation() {
    if (!dateDebut.match(/^\d{4}-\d{2}-\d{2}$/) || !dateFin.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setErreur("Renseignez la date de début et la date de fin.");
      return;
    }
    setErreur(null);
    setEnChargement(true);
    try {
      const data = await client.preparerInventaire(dateDebut, dateFin);
      setLignes(data);
      const init: Record<string, SaisieItem> = {};
      for (const l of data) {
        init[l.produitId] = { produitId: l.produitId, stockPhysique: "", note: "" };
      }
      setSaisies(init);
      setEtape(2);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnChargement(false);
    }
  }

  async function validerInventaire() {
    const items = lignes.map((l) => {
      const s = saisies[l.produitId];
      const physique = Number(s?.stockPhysique ?? 0);
      const ecart = physique - l.stockTheorique;
      if (ecart !== 0 && !s?.note.trim()) return null;
      return { produitId: l.produitId, stockPhysique: physique, note: s?.note.trim() || undefined };
    });
    if (items.some((i) => i === null)) {
      setErreur("Une note est requise pour chaque écart.");
      return;
    }
    setErreur(null);
    setEnEnvoi(true);
    try {
      const inv = await client.creerInventaire({
        dateDebut,
        dateFin,
        titre: titre.trim() || undefined,
        items: items as { produitId: string; stockPhysique: number; note?: string }[],
      });
      setInventaireCreé(inv);
      // Récupérer l'URL du PDF
      try {
        const url = await client.urlInventaire(inv.id);
        setUrlPdf(typeof url === "string" ? url : (url as { url: string }).url);
      } catch {
        // PDF optionnel
      }
      setEtape(3);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
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
    setErreur(null);
  }

  const nbSaisis = Object.values(saisies).filter((s) => s.stockPhysique !== "").length;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Inventaire" sousTitre="Évaluation du stock physique." onRetour={onRetour} />

      {/* Onglets */}
      <View style={styles.onglets}>
        <Pressable style={[styles.onglet, onglet === "nouveau" && styles.ongletActif]} onPress={() => setOnglet("nouveau")}>
          <Text style={[styles.ongletTexte, onglet === "nouveau" && styles.ongletTexteActif]}>Nouvel inventaire</Text>
        </Pressable>
        <Pressable style={[styles.onglet, onglet === "historique" && styles.ongletActif]} onPress={() => setOnglet("historique")}>
          <Text style={[styles.ongletTexte, onglet === "historique" && styles.ongletTexteActif]}>Historique</Text>
        </Pressable>
      </View>

      {/* ── HISTORIQUE ── */}
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
                    onPress={async () => {
                      try {
                        const res = await client.urlInventaire(item.id);
                        const url = typeof res === "string" ? res : (res as { url: string }).url;
                        await Linking.openURL(url);
                      } catch {}
                    }}
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
              <View key={n} style={styles.etapeConteneur}>
                <View style={[styles.etapeCercle, etape >= n && styles.etapeCercleActif]}>
                  <Text style={[styles.etapeNumero, etape >= n && styles.etapeNumeroActif]}>{n}</Text>
                </View>
                <Text style={styles.etapeLibelle}>{n === 1 ? "Période" : n === 2 ? "Saisie" : "Résultat"}</Text>
              </View>
            ))}
          </View>

          {erreur && <Text style={styles.erreur}>{erreur}</Text>}

          {/* ── ÉTAPE 1 ── */}
          {etape === 1 && (
            <ConteneurFormulaire>
              <Text style={styles.label}>Date de début</Text>
              <SelecteurDate valeur={dateDebut} onChange={setDateDebut} />
              <Text style={styles.label}>Date de fin</Text>
              <SelecteurDate valeur={dateFin} onChange={setDateFin} />
              <Text style={styles.label}>Titre (optionnel)</Text>
              <TextInput
                style={styles.champ}
                value={titre}
                onChangeText={setTitre}
                placeholder="Ex. Inventaire octobre 2026"
                placeholderTextColor={couleurs.encreFaible}
              />
              <Pressable style={styles.boutonPrimaire} onPress={lancerEvaluation} disabled={enChargement}>
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
                  const physique = Number(s?.stockPhysique ?? "");
                  const ecart = s?.stockPhysique !== "" ? physique - item.stockTheorique : null;
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
                        placeholder="Stock physique compté"
                        placeholderTextColor={couleurs.encreFaible}
                      />
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
                <Pressable style={styles.boutonSecondaire} onPress={() => setEtape(1)}>
                  <Text style={styles.boutonSecondaireTexte}>Retour</Text>
                </Pressable>
                <Pressable style={[styles.boutonPrimaire, { flex: 1 }]} onPress={validerInventaire} disabled={enEnvoi}>
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

              {urlPdf && (
                <Pressable style={styles.boutonPdf} onPress={() => Linking.openURL(urlPdf)}>
                  <FileText size={16} color={couleurs.bleu} />
                  <Text style={styles.boutonPdfTexte}>Télécharger le PDF</Text>
                </Pressable>
              )}

              <Pressable style={styles.boutonPrimaire} onPress={reinitialiser}>
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
    padding: espacements.s3, justifyContent: "center",
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
