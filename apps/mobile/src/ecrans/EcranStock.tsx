import * as React from "react";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { EcranInventaire } from "./EcranInventaire";
import type { ClientApi } from "@hotel-chicago/api-client";
import { MouvementStock, Produit } from "@hotel-chicago/types";
import { CircleAlert, ClipboardCheck, Minus, Package, Plus, Search, SlidersHorizontal, Trash2, TriangleAlert, Truck, TrendingUp } from "lucide-react-native";
import { formatMontant } from "../formatMontant";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, fonds, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurProduit } from "../composants/SelecteurProduit";
import { FeuilleEtiquettes } from "../composants/FeuilleEtiquettes";
import { useSession } from "../contexteSession";
import { useDonnee } from "../hooks/useDonnee";
import { lireQuantite, typesMouvementAutorises } from "@hotel-chicago/regles";
import { messageErreur } from "../messagesErreur";

export interface EcranStockProps {
  client: ClientApi;
  onRetour: () => void;
}

const TYPES: { valeur: "ENTREE" | "PERTE" | "AJUSTEMENT"; libelle: string; aide: string; Icone: typeof Truck }[] = [
  { valeur: "ENTREE", libelle: "Réception de marchandise", aide: "J'ai reçu des produits", Icone: Truck },
  { valeur: "PERTE", libelle: "Perte ou casse", aide: "Cassé, périmé, volé", Icone: Trash2 },
  { valeur: "AJUSTEMENT", libelle: "Correction de quantité", aide: "Le compte n'est pas juste", Icone: SlidersHorizontal },
];

const LIBELLE_TYPE: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE_VENTE: "Vente",
  RETOUR_VENTE: "Retour (annulation)",
  PERTE: "Perte",
  AJUSTEMENT: "Ajustement",
};

/** SORTIE_VENTE n'apparaît jamais dans le formulaire : généré automatiquement
 * par une ligne de commande cafétaria (voir stock.service.ts), jamais saisi
 * à la main — seuls ENTREE/PERTE/AJUSTEMENT sont des mouvements manuels. */
export function EcranStock({ client, onRetour }: EcranStockProps) {
  const { donnee: mouvements, erreur, enCours, recharger } = useDonnee(() => client.listerMouvementsStock(), client);
  const { donnee: produits, erreur: erreurProduits, recharger: rechargerProduits } = useDonnee(() => client.listerProduits(), client);

  // 12/11/2026 : « Stock » s'ouvre sur ce qu'il reste en rayon ; l'historique et l'inventaire sont des onglets.
  const [onglet, setOnglet] = useState<"stock" | "historique" | "inventaire">("stock");
  const [inventaireOuvert, setInventaireOuvert] = useState(false);
  const [filtre, setFiltre] = useState<"tous" | "bas" | "epuises">("tous");
  const [recherche, setRecherche] = useState("");
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const [produit, setProduit] = useState<Produit | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]["valeur"]>("ENTREE");
  const [quantite, setQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  // Caisse : ENTRÉES seulement ; perte et ajustement réservés au patron (même règle que le serveur, 18/10/2026).
  const { utilisateur } = useSession();
  const typesPermis = TYPES.filter((t) => typesMouvementAutorises(utilisateur.role).includes(t.valeur));
  // Après une entrée : feuille « Étiquettes de prix », une par article entré.
  const [etiquettes, setEtiquettes] = useState<{ produit: Produit; nombre: number; entete?: string } | null>(null);

  // Seuls les articles de comptoir ont un stock — les plats sont préparés à
  // la commande et n'apparaissent ni dans les mouvements ni dans la valeur.
  const produitsActifs = useMemo(() => (produits ?? []).filter((p) => p.actif && p.typeProduit !== "PLAT"), [produits]);

  function ouvrirFormulaire(pre?: Produit) {
    setProduit(pre ?? null);
    setType("ENTREE");
    setQuantite("");
    setMotif("");
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  async function enregistrer() {
    if (!produit) {
      setErreurFormulaire("Choisissez un produit.");
      return;
    }
    // Un ajustement peut être négatif (correction à la baisse) : le signe se lit à part, la quantité reste positive.
    const brute = type === "AJUSTEMENT" && quantite.trim().startsWith("-") ? quantite.trim().slice(1) : quantite;
    const quantiteLue = lireQuantite(brute, { max: 1_000_000 });
    if (!quantiteLue.ok) {
      setErreurFormulaire(quantiteLue.message);
      return;
    }
    const quantiteNombre = type === "AJUSTEMENT" && quantite.trim().startsWith("-") ? -quantiteLue.valeur : quantiteLue.valeur;
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.creerMouvementStock({
        produitId: produit.id,
        type,
        quantite: quantiteNombre,
        motif: motif.trim() || undefined,
      });
      setModaleOuverte(false);
      recharger();
      if (type === "ENTREE") {
        setEtiquettes({ produit, nombre: quantiteNombre, entete: `✓ ${quantiteNombre} × ${produit.nom} entré${quantiteNombre > 1 ? "s" : ""} en stock.` });
      }
    } catch (e) {
      setErreurFormulaire(messageErreur(e, "Le mouvement n'a pas pu être enregistré. Réessayez."));
    } finally {
      setEnEnvoi(false);
    }
  }

  // État de chaque article : épuisé (0 ou moins), bas (au seuil d'alerte ou sous le seuil), sinon en stock.
  const lignesStock = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return produitsActifs
      .map((p) => {
        const stock = Number(p.stockActuel);
        const seuil = Number(p.seuilAlerte);
        const etat: "epuise" | "bas" | "ok" = stock <= 0 ? "epuise" : Number.isFinite(seuil) && seuil > 0 && stock <= seuil ? "bas" : "ok";
        return { p, stock, etat };
      })
      .filter(({ p, etat }) => (filtre === "tous" || (filtre === "bas" ? etat === "bas" : etat === "epuise")) && (!terme || p.nom.toLowerCase().includes(terme) || p.categorie.toLowerCase().includes(terme)))
      .sort((x, y) => ({ epuise: 0, bas: 1, ok: 2 })[x.etat] - ({ epuise: 0, bas: 1, ok: 2 })[y.etat] || x.p.nom.localeCompare(y.p.nom, "fr"));
  }, [produitsActifs, filtre, recherche]);
  const nbBas = produitsActifs.filter((p) => Number(p.stockActuel) > 0 && Number(p.seuilAlerte) > 0 && Number(p.stockActuel) <= Number(p.seuilAlerte)).length;
  const nbEpuises = produitsActifs.filter((p) => Number(p.stockActuel) <= 0).length;
  const valeurTotale = produitsActifs.reduce((t, p) => t + Number(p.prix) * Number(p.stockActuel), 0);
  const deviseTotale = produitsActifs[0]?.devise;
  const quantiteSaisie = Number(quantite.replace(",", "."));
  const apercu = produit && Number.isFinite(quantiteSaisie) && quantiteSaisie !== 0 ? Number(produit.stockActuel) + (type === "PERTE" ? -Math.abs(quantiteSaisie) : quantiteSaisie) : null;

  if (inventaireOuvert) {
    return <EcranInventaire client={client} utilisateur={utilisateur} onRetour={() => { setInventaireOuvert(false); recharger(); rechargerProduits(); }} />;
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Stock" sousTitre="Ce qu'il vous reste en rayon" onRetour={onRetour} />

      {erreur && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}
      {erreurProduits && (
        <Pressable onPress={rechargerProduits} accessibilityRole="button" accessibilityLabel="Réessayer de charger les produits" style={styles.zoneErreur}>
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreurProduits} Touchez ici pour réessayer.
          </Text>
        </Pressable>
      )}

      <View style={styles.onglets} accessibilityRole="tablist">
        {([["stock", "En stock"], ["historique", "Historique"], ["inventaire", "Inventaire"]] as const).map(([id, nom]) => (
          <Pressable key={id} style={[styles.onglet, onglet === id && styles.ongletActif]} onPress={() => setOnglet(id)} accessibilityRole="tab" accessibilityLabel={nom} accessibilityState={{ selected: onglet === id }}>
            <Text style={[styles.ongletTexte, onglet === id && styles.ongletTexteActif]}>{nom}</Text>
          </Pressable>
        ))}
      </View>

      {onglet === "stock" && (
        <ScrollView contentContainerStyle={styles.liste} refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />} keyboardShouldPersistTaps="handled">
          <View style={styles.kpis}>
            <View style={[styles.kpi, { backgroundColor: couleurs.bleuClair }]}>
              <Text style={[styles.kpiValeur, { color: couleurs.bleu }]}>{deviseTotale ? formatMontant(String(valeurTotale), deviseTotale) : "—"}</Text>
              <Text style={[styles.kpiLibelle, { color: couleurs.bleu }]}>Valeur du stock</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: couleurs.alerteClair }]}>
              <Text style={[styles.kpiValeur, { color: couleurs.alerte }]}>{nbBas}</Text>
              <Text style={[styles.kpiLibelle, { color: couleurs.alerte }]}>À recommander</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: couleurs.dangerClair }]}>
              <Text style={[styles.kpiValeur, { color: couleurs.danger }]}>{nbEpuises}</Text>
              <Text style={[styles.kpiLibelle, { color: couleurs.danger }]}>Épuisé{nbEpuises > 1 ? "s" : ""}</Text>
            </View>
          </View>

          <View style={styles.recherche}>
            <Search size={17} color={couleurs.encreFaible} />
            <TextInput style={styles.rechercheSaisie} value={recherche} onChangeText={setRecherche} placeholder="Chercher un produit" placeholderTextColor={couleurs.encreFaible} accessibilityLabel="Chercher un produit" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacements.s2 }}>
            {([["tous", `Tous · ${produitsActifs.length}`], ["bas", `À recommander · ${nbBas}`], ["epuises", `Épuisés · ${nbEpuises}`]] as const).map(([id, nom]) => (
              <Pressable key={id} style={[styles.chip, filtre === id && styles.chipActif]} onPress={() => setFiltre(id)} accessibilityRole="button" accessibilityState={{ selected: filtre === id }}>
                <Text style={[styles.chipTexte, filtre === id && styles.chipTexteActif]}>{nom}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {produitsActifs.length === 0 && (
            <View style={styles.videConteneur}>
              <TrendingUp size={32} color={couleurs.encreFaible} />
              <Text style={styles.videTitre}>Aucun produit en stock.</Text>
              <Text style={styles.videAide}>Ajoutez vos articles dans « Produits », puis revenez ici pour y mettre du stock.</Text>
            </View>
          )}
          {lignesStock.map(({ p, stock, etat }) => {
            const [fond, texte, etiquette] = etat === "ok" ? [couleurs.succesClair, couleurs.succes, "En stock"] : etat === "bas" ? [couleurs.alerteClair, couleurs.alerte, "Bas · à recommander"] : [couleurs.dangerClair, couleurs.danger, "Épuisé"];
            return (
              <View key={p.id} style={[styles.carte, etat === "bas" && { borderColor: couleurs.alerte }, etat === "epuise" && { borderColor: couleurs.danger }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.nom}>{p.nom}</Text>
                  <Text style={styles.type}>
                    {p.categorie} · valeur {formatMontant(String(Number(p.prix) * stock), p.devise)}
                  </Text>
                  <View style={[styles.etat, { backgroundColor: fond }]}>
                    <Text style={[styles.etatTexte, { color: texte }]}>{etiquette}</Text>
                  </View>
                  <Pressable onPress={() => setEtiquettes({ produit: p, nombre: Math.max(1, Math.round(stock) || 1) })} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Étiquettes de prix de ${p.nom}`}>
                    <Text style={styles.boutonEtiquetteTexte}>Étiquettes de prix</Text>
                  </Pressable>
                </View>
                <View style={styles.quantiteBloc}>
                  <Text style={[styles.quantiteGrosse, etat === "epuise" && { color: couleurs.danger }]}>{stock}</Text>
                  <Text style={styles.quantiteUnite}>en stock</Text>
                </View>
                <Pressable style={styles.entree} onPress={() => ouvrirFormulaire(p)} accessibilityRole="button" accessibilityLabel={`Ajouter du stock : ${p.nom}`}>
                  <Plus size={18} color={couleurs.bleu} strokeWidth={2.8} />
                  <Text style={styles.entreeTexte}>Entrée</Text>
                </Pressable>
              </View>
            );
          })}
          {produitsActifs.length > 0 && lignesStock.length === 0 && (
            <View style={styles.videConteneur}>
              <CircleAlert size={30} color={couleurs.encreFaible} />
              <Text style={styles.videTitre}>Aucun produit ne correspond.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {onglet === "historique" && mouvements?.length === 0 && (
        <View style={styles.videConteneur}>
          <Package size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun mouvement enregistré.</Text>
          <Text style={styles.videAide}>Chaque entrée, perte, correction et vente apparaîtra ici.</Text>
        </View>
      )}

      {onglet === "historique" && (
        <FlatList
          data={mouvements ?? []}
          keyExtractor={(m: MouvementStock) => m.id}
          contentContainerStyle={styles.liste}
          refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
          renderItem={({ item }) => {
            const negatif = item.type === "SORTIE_VENTE" || item.type === "PERTE" || Number(item.quantite) < 0;
            return (
              <View style={styles.carteHistorique}>
                <View style={styles.carteEntete}>
                  <Text style={styles.nom}>{item.produit.nom}</Text>
                  <Text style={[styles.quantite, negatif ? styles.quantiteNegative : styles.quantitePositive]}>
                    {negatif ? "" : "+"}
                    {item.quantite}
                  </Text>
                </View>
                <Text style={styles.type}>{LIBELLE_TYPE[item.type] ?? item.type}</Text>
                {item.motif && <Text style={styles.motif}>{item.motif}</Text>}
              </View>
            );
          }}
        />
      )}

      {onglet === "inventaire" && (
        <ScrollView contentContainerStyle={styles.liste}>
          <View style={styles.carteInventaire}>
            <View style={styles.inventaireIcone}>
              <ClipboardCheck size={28} color={couleurs.bleu} />
            </View>
            <Text style={styles.nom}>Faire l'inventaire</Text>
            <Text style={styles.type}>Comptez ce qu'il y a vraiment en rayon : l'application montre les écarts avec le stock attendu et les corrige pour vous.</Text>
            <Pressable style={styles.bouton} onPress={() => setInventaireOuvert(true)} accessibilityRole="button" accessibilityLabel="Commencer un inventaire">
              <Text style={styles.boutonTexte}>Commencer un inventaire</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <FeuilleModale
        visible={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Ajouter du stock"
        modifie={quantite.trim() !== "" || motif.trim() !== ""}
        enCours={enEnvoi}
      >
        <View style={{ gap: espacements.s2 }}>
          {typesPermis.map((t) => {
            const Icone = TYPES.find((x) => x.valeur === t.valeur)!.Icone;
            const actif = type === t.valeur;
            return (
              <Pressable
                key={t.valeur}
                style={[styles.choixType, actif && styles.choixTypeActif]}
                onPress={() => setType(t.valeur)}
                accessibilityRole="radio"
                accessibilityLabel={`${t.libelle} : ${t.aide}`}
                accessibilityState={{ checked: actif }}
              >
                <View style={[styles.choixTypeIcone, actif && { backgroundColor: fonds.bleu }]}>
                  <Icone size={19} color={actif ? "#fff" : couleurs.encreAttenuee} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.choixTypeTitre, actif && { color: couleurs.bleu }]}>{t.libelle}</Text>
                  <Text style={styles.choixTypeAide}>{t.aide}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>PRODUIT</Text>
        <Pressable
          style={styles.champProduit}
          onPress={() => setSelecteurOuvert(true)}
          accessibilityRole="button"
          accessibilityLabel={produit ? `Produit : ${produit.nom}. Changer de produit` : "Choisir un produit"}
        >
          {produit ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.champProduitTexte}>{produit.nom}</Text>
              <Text style={styles.type}>En stock : {produit.stockActuel}</Text>
            </View>
          ) : (
            <Text style={[styles.champProduitPlaceholder, { flex: 1 }]}>Choisir un produit</Text>
          )}
          <Text style={styles.changer}>{produit ? "Changer" : "Choisir"}</Text>
        </Pressable>

        <Text style={styles.label}>{type === "ENTREE" ? "QUANTITÉ REÇUE" : type === "PERTE" ? "QUANTITÉ PERDUE" : "QUANTITÉ (− pour retirer)"}</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepperBouton} onPress={() => setQuantite(String(Math.max(type === "AJUSTEMENT" ? -1_000_000 : 0, (Number.isFinite(quantiteSaisie) ? quantiteSaisie : 0) - 1)))} accessibilityRole="button" accessibilityLabel="Un de moins">
            <Minus size={22} color={couleurs.encre} />
          </Pressable>
          <TextInput style={styles.stepperChamp} value={quantite} onChangeText={setQuantite} accessibilityLabel="Quantité" keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={couleurs.encreFaible} />
          <Pressable style={[styles.stepperBouton, { backgroundColor: fonds.bleu, borderColor: fonds.bleu }]} onPress={() => setQuantite(String((Number.isFinite(quantiteSaisie) ? quantiteSaisie : 0) + 1))} accessibilityRole="button" accessibilityLabel="Un de plus">
            <Plus size={22} color="#fff" />
          </Pressable>
        </View>

        {apercu !== null && produit && (
          <View style={[styles.apercu, apercu < 0 && { backgroundColor: couleurs.dangerClair }]}>
            <Text style={[styles.apercuTexte, apercu < 0 && { color: couleurs.danger }]}>
              Après l'enregistrement : {produit.stockActuel} → <Text style={{ fontWeight: "800" }}>{apercu}</Text> en stock
            </Text>
          </View>
        )}

        {type !== "ENTREE" && (
          <>
            <Text style={styles.label}>MOTIF (OPTIONNEL)</Text>
            <TextInput style={styles.champ} value={motif} onChangeText={setMotif} accessibilityLabel="Motif du mouvement, optionnel" placeholder={type === "PERTE" ? "Ex. bouteille cassée" : "Ex. écart constaté au comptage"} placeholderTextColor={couleurs.encreFaible} />
          </>
        )}

        {erreurFormulaire && (
          <Text style={styles.erreurFormulaire} accessibilityRole="alert">
            {erreurFormulaire}
          </Text>
        )}

        <Pressable style={styles.boutonVert} onPress={enregistrer} disabled={enEnvoi} accessibilityRole="button" accessibilityState={{ disabled: enEnvoi, busy: enEnvoi }}>
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : type === "ENTREE" ? "Enregistrer l'entrée" : type === "PERTE" ? "Enregistrer la perte" : "Enregistrer la correction"}</Text>
        </Pressable>
      </FeuilleModale>

      <SelecteurProduit
        visible={selecteurOuvert}
        produits={produitsActifs}
        onFermer={() => setSelecteurOuvert(false)}
        onChoisir={(p) => {
          setProduit(p);
          setSelecteurOuvert(false);
        }}
      />

      <FeuilleEtiquettes
        client={client}
        produit={etiquettes?.produit ?? null}
        exemplairesParDefaut={etiquettes?.nombre ?? 1}
        entete={etiquettes?.entete}
        onFermer={() => setEtiquettes(null)}
        onProduitMisAJour={() => rechargerProduits()}
      />

      {/* Bouton principal : « Ajouter du stock » (réception, perte ou correction), sous le pouce. */}
      {onglet === "stock" && (
        <Pressable style={styles.principal} onPress={() => ouvrirFormulaire()} accessibilityRole="button" accessibilityLabel="Ajouter du stock">
          <Truck size={20} color="#fff" />
          <Text style={styles.principalTexte}>Ajouter du stock</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", gap: espacements.s2 },
  kpi: { flex: 1, borderRadius: rayons.md + 4, paddingVertical: espacements.s2, paddingHorizontal: 4, alignItems: "center" },
  kpiValeur: { fontSize: 17, fontWeight: "800" },
  kpiLibelle: { fontSize: 11, fontWeight: "700" },
  recherche: { flexDirection: "row", alignItems: "center", gap: espacements.s2, minHeight: 44, paddingHorizontal: espacements.s3, borderRadius: rayons.sm + 4, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  rechercheSaisie: { flex: 1, fontSize: 14, color: couleurs.encre, paddingVertical: 0 },
  chip: { minHeight: 36, paddingHorizontal: espacements.s3, borderRadius: rayons.pill, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, justifyContent: "center" },
  chipActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  chipTexte: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  chipTexteActif: { color: "#fff" },
  carte: { flexDirection: "row", alignItems: "center", gap: espacements.s2, backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s3 },
  carteHistorique: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s4, gap: 4 },
  etat: { alignSelf: "flex-start", paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  etatTexte: { fontSize: 11, fontWeight: "700" },
  quantiteBloc: { alignItems: "center", minWidth: 58 },
  quantiteGrosse: { fontSize: 26, fontWeight: "800", color: couleurs.encre, lineHeight: 30 },
  quantiteUnite: { fontSize: 11, color: couleurs.encreAttenuee },
  entree: { width: 52, minHeight: 52, borderRadius: 13, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center", gap: 1 },
  entreeTexte: { fontSize: 10, fontWeight: "800", color: couleurs.bleu },
  principal: { position: "absolute", left: espacements.s4, right: espacements.s4, bottom: espacements.s4, minHeight: 52, borderRadius: rayons.md + 4, backgroundColor: fonds.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  principalTexte: { color: "#fff", fontWeight: "800", fontSize: 15.5 },
  videAide: { fontSize: 13, color: couleurs.encreAttenuee, textAlign: "center" },
  carteInventaire: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s4, gap: espacements.s3, alignItems: "flex-start" },
  inventaireIcone: { width: 52, height: 52, borderRadius: 14, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center" },
  choixType: { flexDirection: "row", alignItems: "center", gap: espacements.s3, padding: espacements.s3, borderRadius: rayons.md + 4, borderWidth: 2, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  choixTypeActif: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  choixTypeIcone: { width: 36, height: 36, borderRadius: 10, backgroundColor: couleurs.surface100, alignItems: "center", justifyContent: "center" },
  choixTypeTitre: { fontSize: 14.5, fontWeight: "700", color: couleurs.encre },
  choixTypeAide: { fontSize: 12, color: couleurs.encreAttenuee },
  changer: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  stepperBouton: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: couleurs.bordure, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface100 },
  stepperChamp: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 52, borderRadius: 14, borderWidth: 1, borderColor: couleurs.bordure, textAlign: "center", fontSize: 22, fontWeight: "800", color: couleurs.encre, backgroundColor: couleurs.surface100 },
  apercu: { padding: espacements.s3, borderRadius: rayons.md + 2, backgroundColor: couleurs.succesClair },
  apercuTexte: { fontSize: 14, fontWeight: "600", color: couleurs.succes },
  boutonVert: { minHeight: 52, borderRadius: rayons.md + 4, backgroundColor: fonds.succes, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonEtiquette: { alignSelf: "flex-start", marginTop: espacements.s1, paddingVertical: 2 },
  boutonEtiquetteTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  zoneErreur: { minHeight: 44, justifyContent: "center" },
  onglets: { flexDirection: "row", marginHorizontal: espacements.s4, marginTop: espacements.s3, borderRadius: rayons.md, borderWidth: 1, borderColor: couleurs.bordure, overflow: "hidden" },
  onglet: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface200 },
  ongletActif: { backgroundColor: couleurs.bleu },
  ongletTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  ongletTexteActif: { color: "#fff" },
  // 88px de marge basse : le FAB ne recouvre pas la dernière carte.
  liste: { padding: espacements.s4, paddingBottom: 120, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  quantite: { fontSize: 15, fontWeight: "700" },
  quantitePositive: { color: couleurs.succes },
  quantiteNegative: { color: couleurs.danger },
  type: { fontSize: 13, color: couleurs.encreAttenuee },
  motif: { fontSize: 12, color: couleurs.encreAttenuee, fontStyle: "italic" },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  champProduit: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: couleurs.surface100,
  },
  champProduitTexte: { fontSize: 15, color: couleurs.encre, fontWeight: "600" },
  champProduitPlaceholder: { fontSize: 15, color: couleurs.encreFaible },
  selecteurType: { flexDirection: "row", gap: espacements.s2 },
  optionType: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTypeActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  optionTypeTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  optionTypeTexteActif: { color: "#fff" },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  bouton: { minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
