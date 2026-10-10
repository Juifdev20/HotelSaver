import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { FileDown } from "lucide-react-native";
import { Devise, Role, type DepartementRapport, type Depense } from "@hotel-chicago/types";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurDate, saisieDepuisIso } from "../composants/SelecteurDate";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { lireMontant } from "@hotel-chicago/regles";
import { formaterLubumbashi, jourLubumbashi, midiLubumbashi } from "../dates";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";

export interface EcranDepensesProps {
  /** « ‹ Retour » vers l'Accueil (onglet) ou la liste Plus (patron). */
  onRetour: () => void;
}

type Periode = "mois" | "mois-dernier" | "jour" | "libre";

const LIBELLE_DEPARTEMENT: Record<DepartementRapport, string> = { RECEPTION: "Réception", CAFETERIA: "Cafétaria" };

/** « AAAA-MM-JJ » du jour de Lubumbashi (dates.ts), pas celui du fuseau réglé sur le téléphone. */
function iso(d: Date): string {
  return jourLubumbashi(d);
}

function bornesPeriode(periode: Exclude<Periode, "libre">): { du: string; au: string } {
  const aujourdhui = jourLubumbashi();
  if (periode === "jour") return { du: aujourdhui, au: aujourdhui };
  const [a, m] = aujourdhui.split("-").map(Number) as [number, number];
  const deux = (n: number) => String(n).padStart(2, "0");
  if (periode === "mois") return { du: `${a}-${deux(m)}-01`, au: aujourdhui };
  // Mois dernier : du 1er au dernier jour (jour 0 du mois courant = dernier jour du mois précédent).
  const dernierJour = new Date(Date.UTC(a, m - 1, 0));
  return {
    du: `${dernierJour.getUTCFullYear()}-${deux(dernierJour.getUTCMonth() + 1)}-01`,
    au: `${dernierJour.getUTCFullYear()}-${deux(dernierJour.getUTCMonth() + 1)}-${deux(dernierJour.getUTCDate())}`,
  };
}

/** « mardi 7 octobre 2026 » — en-tête de section de la liste. */
function jourLisible(jour: string): string {
  const midi = midiLubumbashi(jour);
  return midi ? formaterLubumbashi(midi, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : jour;
}

function totaux(depenses: Depense[]): { usd: number; cdf: number } {
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
 * (base locale + file de synchronisation, comme les réservations) ; le
 * patron consulte les deux départements, sans bouton d'ajout. Le PDF de la
 * période se télécharge en ligne (URL signée, visionneuse du téléphone).
 */
export function EcranDepenses({ onRetour }: EcranDepensesProps) {
  const { client, moteurSync, utilisateur, miroir } = useSession();
  const etatSync = useSyncEtat();
  const departementPersonnel: DepartementRapport | null =
    utilisateur.role === Role.RECEPTIONNISTE ? "RECEPTION" : utilisateur.role === Role.CAFETARIA ? "CAFETERIA" : null;
  const peutSaisir = departementPersonnel !== null;

  const [periode, setPeriode] = useState<Periode>("mois");
  const [du, setDu] = useState(bornesPeriode("mois").du);
  const [au, setAu] = useState(bornesPeriode("mois").au);
  const [departementFiltre, setDepartementFiltre] = useState<DepartementRapport | undefined>(undefined);
  const [depenses, setDepenses] = useState<Depense[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [telechargement, setTelechargement] = useState(false);

  // Formulaire (création ou correction).
  const [formulaire, setFormulaire] = useState<{ depense: Depense | null } | null>(null);
  const [date, setDate] = useState(iso(new Date()));
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const periodeValide = /^\d{4}-\d{2}-\d{2}$/.test(du) && /^\d{4}-\d{2}-\d{2}$/.test(au) && du <= au;

  const recharger = useCallback(() => {
    if (!periodeValide) return;
    client
      .listerDepenses({ du, au, departement: departementFiltre })
      .then((liste) => {
        setDepenses(liste);
        setErreur(null);
      })
      // Les dépenses déjà affichées restent à l'écran si le rechargement échoue.
      .catch((e: unknown) => setErreur(messageErreur(e, "Les dépenses n'ont pas pu être actualisées.")));
  }, [client, du, au, departementFiltre, periodeValide]);

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
    const parJour = new Map<string, Depense[]>();
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

  function ouvrirCorrection(depense: Depense) {
    if (!peutSaisir || depense.annulee) return;
    setFormulaire({ depense });
    setDate(depense.date);
    setMotif(depense.motif);
    setMontant(String(Number(depense.montant)));
    setDevise(depense.devise);
    setErreurFormulaire(null);
  }

  async function enregistrer() {
    const motifTrim = motif.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErreurFormulaire("Choisissez la date de la dépense.");
    if (date > iso(new Date())) return setErreurFormulaire("Une dépense ne peut pas être datée dans le futur.");
    if (motifTrim.length < 3) return setErreurFormulaire("Le motif doit faire au moins 3 caractères.");
    if (motifTrim.length > 200) return setErreurFormulaire("Le motif ne peut pas dépasser 200 caractères.");
    const montantLu = lireMontant(montant, devise, { max: 100_000_000 });
    if (!montantLu.ok) return setErreurFormulaire(montantLu.message);
    const montantArrondi = Math.round(montantLu.valeur * 100) / 100;

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
          await client.modifierDepense(existante.id, modifs);
        }
      } else {
        await client.creerDepense({ date, motif: motifTrim, montant: montantArrondi, devise });
      }
      setFormulaire(null);
      recharger();
    } catch (e) {
      setErreurFormulaire(messageErreur(e, "La dépense n'a pas pu être enregistrée. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  function annuler(depense: Depense) {
    confirmerAction({
      titre: "Annuler cette dépense ?",
      message: `« ${depense.motif} » — ${formatMontant(depense.montant, depense.devise)}.\nElle restera visible, barrée, et ne comptera plus dans les totaux. C'est définitif.`,
      libelleConfirmer: "Annuler la dépense",
      libelleRefuser: "Retour",
      destructif: true,
      onConfirmer: async () => {
        try {
          await client.modifierDepense(depense.id, { annulee: true });
          setFormulaire(null);
          recharger();
        } catch (e) {
          setErreurFormulaire(messageErreur(e, "La dépense n'a pas pu être annulée. Réessayez."));
        }
      },
    });
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
      setErreur(`Le PDF n'a pas pu être téléchargé : ${messageErreur(e, "vérifiez la connexion puis réessayez.")}`);
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
            <Pressable
              key={p}
              style={[styles.puce, periode === p && styles.puceActive]}
              onPress={() => choisirPeriode(p)}
              accessibilityRole="button"
              accessibilityLabel={`Période : ${libelle}`}
              accessibilityState={{ selected: periode === p }}
            >
              <Text style={[styles.puceTexte, periode === p && styles.puceTexteActif]}>{libelle}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.ligneDates}>
          <View style={styles.colonneDate}>
            <Text style={styles.champLabel}>Du</Text>
            <SelecteurDate
              libelle="Date de début"
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
              libelle="Date de fin"
              key={`au-${au}`}
              valeur={au}
              onChange={(v) => {
                setPeriode("libre");
                setAu(v);
              }}
            />
          </View>
        </View>
        {!periodeValide && (
          <Text style={styles.erreur} accessibilityRole="alert">
            La date de fin doit suivre la date de début.
          </Text>
        )}

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
                accessibilityRole="button"
                accessibilityLabel={`Département : ${libelle}`}
                accessibilityState={{ selected: departementFiltre === d }}
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
        {erreur && (
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreur}
          </Text>
        )}
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
          <Pressable
            style={[styles.carte, item.annulee && styles.carteAnnulee]}
            onPress={() => ouvrirCorrection(item)}
            disabled={!peutSaisir}
            accessibilityRole={peutSaisir && !item.annulee ? "button" : "text"}
            accessibilityLabel={`${item.motif}, ${formatMontant(item.montant, item.devise)}${item.annulee ? ", annulée" : ""}${miroir.estCreationEnAttente(item.id) ? ", en attente de synchronisation" : ""}`}
            accessibilityHint={peutSaisir && !item.annulee ? "Ouvre la correction de la dépense" : undefined}
          >
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
              {miroir.estCreationEnAttente(item.id) ? " · en attente de synchro" : ""}
            </Text>
          </Pressable>
        )}
      />

      {peutSaisir && <BoutonAjouterFlottant onPress={ouvrirCreation} accessibilityLabel="Nouvelle dépense" />}

      <FeuilleModale
        visible={formulaire !== null}
        onFermer={() => setFormulaire(null)}
        titre={formulaire?.depense ? "Corriger la dépense" : "Nouvelle dépense"}
        modifie={
          formulaire !== null &&
          (formulaire.depense
            ? date !== formulaire.depense.date ||
              motif !== formulaire.depense.motif ||
              montant !== String(Number(formulaire.depense.montant)) ||
              devise !== formulaire.depense.devise
            : motif.trim() !== "" || montant.trim() !== "")
        }
        enCours={enCours}
      >
        <Text style={styles.champLabel}>Date</Text>
        <SelecteurDate libelle="Date de la dépense" valeur={date} onChange={setDate} />
        <Text style={styles.champLabel}>Motif</Text>
        <TextInput
          style={[styles.champ, styles.champMulti]}
          value={motif}
          onChangeText={setMotif}
          accessibilityLabel="Motif de la dépense"
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
            accessibilityLabel="Montant de la dépense"
            placeholder="0"
            placeholderTextColor={couleurs.encreFaible}
            keyboardType="decimal-pad"
          />
          {[Devise.USD, Devise.CDF].map((d) => (
            <Pressable
              key={d}
              style={[styles.optionDevise, devise === d && styles.puceActive]}
              onPress={() => setDevise(d)}
              accessibilityRole="radio"
              accessibilityLabel={d === Devise.USD ? "Dollars (USD)" : "Francs congolais (CDF)"}
              accessibilityState={{ checked: devise === d }}
            >
              <Text style={[styles.puceTexte, devise === d && styles.puceTexteActif]}>{d === Devise.USD ? "USD $" : "CDF FC"}</Text>
            </Pressable>
          ))}
        </View>
        {formulaire?.depense && (
          <Text style={styles.infoHorsLigne}>Saisie du {saisieDepuisIso(formulaire.depense.date)} par {formulaire.depense.creeParNom}</Text>
        )}
        {erreurFormulaire && (
          <Text style={styles.erreurFormulaire} accessibilityRole="alert">
            {erreurFormulaire}
          </Text>
        )}
        <Pressable
          style={[styles.bouton, enCours && styles.boutonDesactive]}
          onPress={enregistrer}
          disabled={enCours}
          accessibilityRole="button"
          accessibilityState={{ disabled: enCours, busy: enCours }}
        >
          <Text style={styles.boutonTexte}>{enCours ? "Enregistrement…" : "Enregistrer"}</Text>
        </Pressable>
        {formulaire?.depense && (
          <Pressable style={styles.boutonAnnuler} onPress={() => annuler(formulaire.depense!)} disabled={enCours} accessibilityRole="button">
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
    minHeight: 44,
    justifyContent: "center",
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
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  champMulti: { minHeight: 72, textAlignVertical: "top", paddingTop: espacements.s3 },
  ligneMontant: { flexDirection: "row", gap: espacements.s2, alignItems: "center" },
  optionDevise: {
    minHeight: 44,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface200,
  },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  bouton: { minHeight: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonAnnuler: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  boutonAnnulerTexte: { color: couleurs.danger, fontWeight: "600", fontSize: 14 },
});
