import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { FileDown } from "lucide-react-native";
import { Devise, Role, type DepartementRapport } from "@hotel-chicago/types";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurDate, saisieDepuisIso } from "../composants/SelecteurDate";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { DepenseMiroir, creerDepenseLocale, listerDepensesMiroir, modifierDepenseLocale } from "../stockage/depensesMirroir";

export interface EcranDepensesProps {
  /** « ‹ Retour » vers l'Accueil (onglet) ou la liste Plus (patron). */
  onRetour: () => void;
}

type Periode = "mois" | "mois-dernier" | "jour" | "libre";

const LIBELLE_DEPARTEMENT: Record<DepartementRapport, string> = { RECEPTION: "Réception", CAFETERIA: "Cafétaria" };

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bornesPeriode(periode: Exclude<Periode, "libre">): { du: string; au: string } {
  const maintenant = new Date();
  if (periode === "jour") return { du: iso(maintenant), au: iso(maintenant) };
  if (periode === "mois") return { du: iso(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)), au: iso(maintenant) };
  return {
    du: iso(new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1)),
    au: iso(new Date(maintenant.getFullYear(), maintenant.getMonth(), 0)),
  };
}

/** « mardi 7 octobre 2026 » — en-tête de section de la liste. */
function jourLisible(jour: string): string {
  return new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function totaux(depenses: DepenseMiroir[]): { usd: number; cdf: number } {
  const t = { usd: 0, cdf: 0 };
  for (const d of depenses) if (!d.annulee) t[d.devise === Devise.USD ? "usd" : "cdf"] += Number(d.montant);
  return t;
}

function texteTotaux(t: { usd: number; cdf: number }): string {
  const morceaux: string[] = [];
  if (t.usd) morceaux.push(formatMontant(t.usd, Devise.USD));
  if (t.cdf) morceaux.push(formatMontant(t.cdf, Devise.CDF));
  return morceaux.length ? morceaux.join(" · ") : "—";
}

/**
 * Dépenses du département (demande du 07/10/2026). La réception et la
 * cafétaria saisissent — date, motif, montant, devise — même hors ligne
 * (miroir SQLite + file de synchronisation, comme les réservations) ; le
 * patron consulte les deux départements, sans bouton d'ajout. Le PDF de la
 * période se télécharge en ligne (URL signée, visionneuse du téléphone).
 */
export function EcranDepenses({ onRetour }: EcranDepensesProps) {
  const { client, moteurSync, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  const departementPersonnel: DepartementRapport | null =
    utilisateur.role === Role.RECEPTIONNISTE ? "RECEPTION" : utilisateur.role === Role.CAFETARIA ? "CAFETERIA" : null;
  const peutSaisir = departementPersonnel !== null;

  const [periode, setPeriode] = useState<Periode>("mois");
  const [du, setDu] = useState(bornesPeriode("mois").du);
  const [au, setAu] = useState(bornesPeriode("mois").au);
  const [departementFiltre, setDepartementFiltre] = useState<DepartementRapport | undefined>(undefined);
  const [depenses, setDepenses] = useState<DepenseMiroir[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [telechargement, setTelechargement] = useState(false);

  // Formulaire (création ou correction).
  const [formulaire, setFormulaire] = useState<{ depense: DepenseMiroir | null } | null>(null);
  const [date, setDate] = useState(iso(new Date()));
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const periodeValide = /^\d{4}-\d{2}-\d{2}$/.test(du) && /^\d{4}-\d{2}-\d{2}$/.test(au) && du <= au;

  const recharger = useCallback(() => {
    if (!periodeValide) return;
    listerDepensesMiroir(du, au, departementFiltre)
      .then(setDepenses)
      .catch((e: Error) => setErreur(e.message));
  }, [du, au, departementFiltre, periodeValide]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  useEffect(() => {
    void moteurSync.forcerSynchronisation();
  }, [moteurSync]);

  // Une synchro vient de finir : relit le miroir (dépenses des autres postes,
  // confirmations de push).
  useEffect(() => {
    if (etatSync.dernierePousseeLe) recharger();
  }, [etatSync.dernierePousseeLe, recharger]);

  function choisirPeriode(p: Exclude<Periode, "libre">) {
    const b = bornesPeriode(p);
    setPeriode(p);
    setDu(b.du);
    setAu(b.au);
  }

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    recharger();
    setRafraichissement(false);
  }

  const sections = useMemo(() => {
    const parJour = new Map<string, DepenseMiroir[]>();
    for (const d of depenses ?? []) parJour.set(d.date, [...(parJour.get(d.date) ?? []), d]);
    return [...parJour.entries()].map(([jour, data]) => ({ jour, data, total: totaux(data) }));
  }, [depenses]);
  const totalPeriode = useMemo(() => totaux(depenses ?? []), [depenses]);
  const nombreActives = (depenses ?? []).filter((d) => !d.annulee).length;

  function ouvrirCreation() {
    setFormulaire({ depense: null });
    setDate(iso(new Date()));
    setMotif("");
    setMontant("");
    setDevise(Devise.USD);
    setErreurFormulaire(null);
  }

  function ouvrirCorrection(depense: DepenseMiroir) {
    if (!peutSaisir || depense.annulee) return;
    if (depense.remoteId === null) {
      Alert.alert("En attente de synchronisation", "Cette dépense n'est pas encore envoyée au serveur. Elle pourra être corrigée ou annulée une fois synchronisée.");
      return;
    }
    setFormulaire({ depense });
    setDate(depense.date);
    setMotif(depense.motif);
    setMontant(String(Number(depense.montant)));
    setDevise(depense.devise);
    setErreurFormulaire(null);
  }

  async function enregistrer() {
    const motifTrim = motif.trim();
    const valeur = Number(montant.replace(",", ".").replace(/\s/g, ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErreurFormulaire("Choisissez la date de la dépense.");
    if (date > iso(new Date())) return setErreurFormulaire("Une dépense ne peut pas être datée dans le futur.");
    if (motifTrim.length < 3) return setErreurFormulaire("Le motif doit faire au moins 3 caractères.");
    if (motifTrim.length > 200) return setErreurFormulaire("Le motif ne peut pas dépasser 200 caractères.");
    if (!Number.isFinite(valeur) || valeur <= 0) return setErreurFormulaire("Le montant doit être supérieur à zéro.");
    const montantArrondi = Math.round(valeur * 100) / 100;

    setEnCours(true);
    setErreurFormulaire(null);
    try {
      const existante = formulaire?.depense;
      if (existante) {
        const modifs: { date?: string; motif?: string; montant?: number; devise?: Devise } = {};
        if (date !== existante.date) modifs.date = date;
        if (motifTrim !== existante.motif) modifs.motif = motifTrim;
        if (montantArrondi !== Number(existante.montant)) modifs.montant = montantArrondi;
        if (devise !== existante.devise) modifs.devise = devise;
        if (Object.keys(modifs).length > 0) {
          const payload = await modifierDepenseLocale(existante, modifs);
          await moteurSync.mettreEnFile({
            entiteType: "Depense",
            localId: existante.id,
            remoteId: existante.remoteId!,
            operation: "UPDATE",
            payload,
            baseSyncVersion: existante.syncVersion,
          });
        }
      } else {
        const { id, payload } = await creerDepenseLocale({
          departement: departementPersonnel!,
          date,
          motif: motifTrim,
          montant: montantArrondi,
          devise,
          creeParId: utilisateur.userId,
          creeParNom: utilisateur.nom,
        });
        await moteurSync.mettreEnFile({ entiteType: "Depense", localId: id, operation: "CREATE", payload });
      }
      setFormulaire(null);
      recharger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  function annuler(depense: DepenseMiroir) {
    Alert.alert(
      "Annuler cette dépense ?",
      `« ${depense.motif} » — ${formatMontant(depense.montant, depense.devise)}.\nElle restera visible, barrée, et ne comptera plus dans les totaux. C'est définitif.`,
      [
        { text: "Retour", style: "cancel" },
        {
          text: "Annuler la dépense",
          style: "destructive",
          onPress: async () => {
            try {
              const payload = await modifierDepenseLocale(depense, { annulee: true });
              await moteurSync.mettreEnFile({
                entiteType: "Depense",
                localId: depense.id,
                remoteId: depense.remoteId!,
                operation: "UPDATE",
                payload,
                baseSyncVersion: depense.syncVersion,
              });
              setFormulaire(null);
              recharger();
            } catch (e) {
              setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
            }
          },
        },
      ]
    );
  }

  async function telechargerPdf() {
    if (!periodeValide) return;
    setTelechargement(true);
    setErreur(null);
    try {
      // Les dépenses saisies hors ligne doivent être sur le serveur avant
      // de générer le PDF, sinon elles manqueraient au document.
      await moteurSync.forcerSynchronisation();
      const { url } = await client.urlPdfDepenses({ du, au, departement: departementFiltre });
      await Linking.openURL(url);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de télécharger le PDF.");
    } finally {
      setTelechargement(false);
    }
  }

  const sousTitre = departementPersonnel ? LIBELLE_DEPARTEMENT[departementPersonnel] : "Réception et Cafétaria";

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Dépenses" sousTitre={sousTitre} onRetour={onRetour} />

      <View style={styles.filtres}>
        <View style={styles.puces}>
          {(
            [
              ["jour", "Aujourd'hui"],
              ["mois", "Ce mois"],
              ["mois-dernier", "Mois dernier"],
            ] as const
          ).map(([p, libelle]) => (
            <Pressable key={p} style={[styles.puce, periode === p && styles.puceActive]} onPress={() => choisirPeriode(p)}>
              <Text style={[styles.puceTexte, periode === p && styles.puceTexteActif]}>{libelle}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.ligneDates}>
          <View style={styles.colonneDate}>
            <Text style={styles.champLabel}>Du</Text>
            <SelecteurDate
              key={`du-${du}`}
              valeur={du}
              onChange={(v) => {
                setPeriode("libre");
                setDu(v);
              }}
            />
          </View>
          <View style={styles.colonneDate}>
            <Text style={styles.champLabel}>Au</Text>
            <SelecteurDate
              key={`au-${au}`}
              valeur={au}
              onChange={(v) => {
                setPeriode("libre");
                setAu(v);
              }}
            />
          </View>
        </View>
        {!periodeValide && <Text style={styles.erreur}>La date de fin doit suivre la date de début.</Text>}

        {!departementPersonnel && (
          <View style={styles.puces}>
            {(
              [
                [undefined, "Tous"],
                ["RECEPTION", "Réception"],
                ["CAFETERIA", "Cafétaria"],
              ] as const
            ).map(([d, libelle]) => (
              <Pressable
                key={libelle}
                style={[styles.puce, departementFiltre === d && styles.puceActive]}
                onPress={() => setDepartementFiltre(d)}
              >
                <Text style={[styles.puceTexte, departementFiltre === d && styles.puceTexteActif]}>{libelle}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.carteTotal}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLibelle}>
              Total · {nombreActives} dépense{nombreActives > 1 ? "s" : ""}
            </Text>
            <Text style={styles.totalValeur}>{texteTotaux(totalPeriode)}</Text>
          </View>
          <Pressable
            style={[styles.boutonPdf, (!etatSync.enLigne || telechargement || !periodeValide) && styles.boutonDesactive]}
            onPress={telechargerPdf}
            disabled={!etatSync.enLigne || telechargement || !periodeValide}
            accessibilityRole="button"
            accessibilityLabel="Télécharger le PDF des dépenses"
          >
            <FileDown size={18} color="#fff" />
            <Text style={styles.boutonPdfTexte}>{telechargement ? "…" : "PDF"}</Text>
          </Pressable>
        </View>
        {!etatSync.enLigne && <Text style={styles.infoHorsLigne}>Hors ligne : le PDF se télécharge avec une connexion internet.</Text>}
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.liste}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        ListEmptyComponent={
          depenses ? <Text style={styles.vide}>Aucune dépense sur la période.</Text> : <Text style={styles.vide}>Chargement…</Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.enteteJour}>
            <Text style={styles.enteteJourTexte}>{jourLisible(section.jour)}</Text>
            <Text style={styles.enteteJourTotal}>{texteTotaux(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable style={[styles.carte, item.annulee && styles.carteAnnulee]} onPress={() => ouvrirCorrection(item)} disabled={!peutSaisir}>
            <View style={styles.carteLigne}>
              <Text style={[styles.motif, item.annulee && styles.texteBarre]} numberOfLines={3}>
                {item.motif}
              </Text>
              <Text style={[styles.montant, item.annulee && styles.texteBarre]}>{formatMontant(item.montant, item.devise)}</Text>
            </View>
            <Text style={styles.meta}>
              {item.creeParNom}
              {!departementPersonnel ? ` · ${LIBELLE_DEPARTEMENT[item.departement]}` : ""}
              {item.annulee ? " · annulée" : ""}
              {item.remoteId === null ? " · en attente de synchro" : ""}
            </Text>
          </Pressable>
        )}
      />

      {peutSaisir && <BoutonAjouterFlottant onPress={ouvrirCreation} accessibilityLabel="Nouvelle dépense" />}

      <FeuilleModale
        visible={formulaire !== null}
        onFermer={() => setFormulaire(null)}
        titre={formulaire?.depense ? "Corriger la dépense" : "Nouvelle dépense"}
      >
        <Text style={styles.champLabel}>Date</Text>
        <SelecteurDate valeur={date} onChange={setDate} />
        <Text style={styles.champLabel}>Motif</Text>
        <TextInput
          style={[styles.champ, styles.champMulti]}
          value={motif}
          onChangeText={setMotif}
          placeholder="Ex. carburant du groupe électrogène"
          placeholderTextColor={couleurs.encreFaible}
          multiline
          maxLength={200}
        />
        <Text style={styles.champLabel}>Montant</Text>
        <View style={styles.ligneMontant}>
          <TextInput
            style={[styles.champ, { flex: 1 }]}
            value={montant}
            onChangeText={setMontant}
            placeholder="0"
            placeholderTextColor={couleurs.encreFaible}
            keyboardType="decimal-pad"
          />
          {[Devise.USD, Devise.CDF].map((d) => (
            <Pressable key={d} style={[styles.optionDevise, devise === d && styles.puceActive]} onPress={() => setDevise(d)}>
              <Text style={[styles.puceTexte, devise === d && styles.puceTexteActif]}>{d === Devise.USD ? "USD $" : "CDF FC"}</Text>
            </Pressable>
          ))}
        </View>
        {formulaire?.depense && (
          <Text style={styles.infoHorsLigne}>Saisie du {saisieDepuisIso(formulaire.depense.date)} par {formulaire.depense.creeParNom}</Text>
        )}
        {erreurFormulaire && <Text style={styles.erreurFormulaire}>{erreurFormulaire}</Text>}
        <Pressable style={[styles.bouton, enCours && styles.boutonDesactive]} onPress={enregistrer} disabled={enCours}>
          <Text style={styles.boutonTexte}>{enCours ? "Enregistrement…" : "Enregistrer"}</Text>
        </Pressable>
        {formulaire?.depense && (
          <Pressable style={styles.boutonAnnuler} onPress={() => annuler(formulaire.depense!)} disabled={enCours}>
            <Text style={styles.boutonAnnulerTexte}>Annuler cette dépense</Text>
          </Pressable>
        )}
        {!etatSync.enLigne && <Text style={styles.infoHorsLigne}>Hors ligne : la dépense sera envoyée au retour du réseau.</Text>}
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  filtres: { paddingHorizontal: espacements.s4, gap: espacements.s2 },
  puces: { flexDirection: "row", gap: espacements.s2 },
  puce: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    backgroundColor: couleurs.surface200,
  },
  puceActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  puceTexte: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  puceTexteActif: { color: "#fff" },
  ligneDates: { flexDirection: "row", gap: espacements.s3 },
  colonneDate: { flex: 1 },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: 4 },
  carteTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
  },
  totalLibelle: { fontSize: 12, color: couleurs.encreAttenuee },
  totalValeur: { fontSize: 17, fontWeight: "700", color: couleurs.navy },
  boutonPdf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: espacements.s4,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
  },
  boutonPdfTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  boutonDesactive: { opacity: 0.5 },
  infoHorsLigne: { fontSize: 12, color: couleurs.encreAttenuee, textAlign: "center" },
  erreur: { color: couleurs.danger, fontSize: 13 },
  // 88px de marge basse : le FAB ne recouvre pas la dernière carte.
  liste: { padding: espacements.s4, paddingBottom: 88, gap: espacements.s2 },
  vide: { textAlign: "center", color: couleurs.encreAttenuee, fontSize: 14, padding: espacements.s6 },
  enteteJour: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: espacements.s2 },
  enteteJourTexte: { fontSize: 13, fontWeight: "700", color: couleurs.encre, textTransform: "capitalize", flex: 1 },
  enteteJourTotal: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
    gap: 4,
  },
  carteAnnulee: { opacity: 0.6 },
  carteLigne: { flexDirection: "row", justifyContent: "space-between", gap: espacements.s3 },
  motif: { fontSize: 15, color: couleurs.encre, flex: 1 },
  montant: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  meta: { fontSize: 12, color: couleurs.encreAttenuee },
  texteBarre: { textDecorationLine: "line-through" },
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
  champMulti: { height: 72, textAlignVertical: "top", paddingTop: espacements.s3 },
  ligneMontant: { flexDirection: "row", gap: espacements.s2, alignItems: "center" },
  optionDevise: {
    height: 44,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface200,
  },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  bouton: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonAnnuler: { height: 44, alignItems: "center", justifyContent: "center" },
  boutonAnnulerTexte: { color: couleurs.danger, fontWeight: "600", fontSize: 14 },
});
