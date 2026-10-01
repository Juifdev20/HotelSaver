import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { DepartementRapport, peutOperer, RapportMensuel, Role } from "@hotel-chicago/types";
import { BedDouble, ChevronDown, ChevronUp, CircleCheck, Coffee, FileText, FileWarning, RefreshCw } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { useSession } from "../contexteSession";

export interface EcranRapportsProps {
  onRetour: () => void;
}

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Les 12 derniers mois « AAAA-MM » (fuseau Africa/Lubumbashi, UTC+2). */
function moisDisponibles(): { valeur: string; libelle: string }[] {
  const maintenant = new Date(Date.now() + 2 * 3600_000);
  const liste: { valeur: string; libelle: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - i, 1));
    liste.push({
      valeur: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      libelle: `${MOIS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    });
  }
  return liste;
}

const LIBELLES: Record<DepartementRapport, string> = { CAFETERIA: "Cafétaria", RECEPTION: "Réception" };

function dateHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Rapports mensuels PDF par département (demande du patron 01/10) : même
 * écran pour tous les rôles — le personnel voit/génère son département, le
 * patron consulte les deux. Le PDF s'ouvre par URL signée dans la
 * visionneuse du téléphone (Linking) — aucun module natif.
 */
export function EcranRapports({ onRetour }: EcranRapportsProps) {
  const { client, utilisateur } = useSession();
  const mois = useMemo(moisDisponibles, []);
  const [moisChoisi, setMoisChoisi] = useState(mois[1]?.valeur ?? mois[0].valeur); // mois écoulé par défaut
  const [moisOuvert, setMoisOuvert] = useState(false);
  const [rapports, setRapports] = useState<RapportMensuel[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [revisionsOuvertes, setRevisionsOuvertes] = useState<Record<string, boolean>>({});

  const charger = useCallback(() => {
    client
      .listerRapports(moisChoisi)
      .then(setRapports)
      .catch((e: Error) => setErreur(e.message));
  }, [client, moisChoisi]);

  useEffect(charger, [charger]);

  async function generer(departement: DepartementRapport) {
    setEnCours(departement);
    setErreur(null);
    try {
      await client.genererRapport(departement, moisChoisi);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(null);
    }
  }

  async function ouvrir(id: string) {
    setEnCours(`ouverture-${id}`);
    setErreur(null);
    try {
      const { url } = await client.urlRapport(id);
      await Linking.openURL(url);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'ouvrir le PDF.");
    } finally {
      setEnCours(null);
    }
  }

  if (!utilisateur) return null;

  const departements: DepartementRapport[] =
    utilisateur.role === Role.RECEPTIONNISTE
      ? ["RECEPTION"]
      : utilisateur.role === Role.CAFETARIA
        ? ["CAFETERIA"]
        : ["CAFETERIA", "RECEPTION"];

  const peutGenerer = (departement: DepartementRapport) =>
    utilisateur.role === Role.RECEPTIONNISTE
      ? departement === "RECEPTION"
      : utilisateur.role === Role.CAFETARIA
        ? departement === "CAFETERIA"
        : peutOperer(utilisateur);

  const libelleMois = mois.find((m) => m.valeur === moisChoisi)?.libelle ?? moisChoisi;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Rapports mensuels" onRetour={onRetour} />
      <ConteneurFormulaire styleContenu={styles.contenu}>
        {/* Sélecteur de mois */}
        <Pressable style={styles.selecteur} onPress={() => setMoisOuvert((v) => !v)} accessibilityRole="button">
          <Text style={styles.selecteurTexte}>{libelleMois}</Text>
          {moisOuvert ? <ChevronUp size={18} color={couleurs.encre} /> : <ChevronDown size={18} color={couleurs.encre} />}
        </Pressable>
        {moisOuvert &&
          mois.map((m) => (
            <Pressable
              key={m.valeur}
              style={[styles.moisOption, m.valeur === moisChoisi && styles.moisOptionActive]}
              onPress={() => {
                setMoisChoisi(m.valeur);
                setMoisOuvert(false);
              }}
            >
              <Text style={m.valeur === moisChoisi ? styles.moisOptionTexteActif : styles.moisOptionTexte}>{m.libelle}</Text>
            </Pressable>
          ))}

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        {rapports === null && !erreur && <Text style={styles.discret}>Chargement…</Text>}

        {rapports?.map &&
          departements.map((departement) => {
            const duMois = rapports.filter((r) => r.departement === departement);
            const actif = duMois.find((r) => r.statut === "ACTIF");
            const remplaces = duMois.filter((r) => r.statut === "REMPLACE");
            const Icone = departement === "CAFETERIA" ? Coffee : BedDouble;
            return (
              <View key={departement} style={styles.carte}>
                <View style={styles.carteEntete}>
                  <Icone size={20} color={couleurs.bleu} />
                  <Text style={styles.carteTitre}>Rapport {LIBELLES[departement]}</Text>
                </View>

                {actif ? (
                  <>
                    <Text style={styles.ligne}>
                      N° {actif.numero} · par {actif.genereParNom} le {dateHeure(actif.genereLe)}
                    </Text>
                    <View style={styles.badges}>
                      {actif.concordant ? (
                        <View style={styles.badgeOk}>
                          <CircleCheck size={13} color={couleurs.succes} />
                          <Text style={styles.badgeOkTexte}>Concordant</Text>
                        </View>
                      ) : (
                        <View style={styles.badgeKo}>
                          <FileWarning size={13} color={couleurs.danger} />
                          <Text style={styles.badgeKoTexte}>Écart détecté</Text>
                        </View>
                      )}
                      {actif.provisoire && (
                        <View style={styles.badgeProvisoire}>
                          <Text style={styles.badgeProvisoireTexte}>Provisoire</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.actions}>
                      <Pressable
                        style={[styles.bouton, styles.boutonPrimaire]}
                        onPress={() => ouvrir(actif.id)}
                        disabled={enCours !== null}
                        accessibilityRole="button"
                      >
                        <FileText size={16} color="#fff" />
                        <Text style={styles.boutonPrimaireTexte}>
                          {enCours === `ouverture-${actif.id}` ? "Ouverture…" : "Ouvrir le PDF"}
                        </Text>
                      </Pressable>
                      {peutGenerer(departement) && (
                        <Pressable
                          style={[styles.bouton, styles.boutonSecondaire]}
                          onPress={() => generer(departement)}
                          disabled={enCours !== null}
                          accessibilityRole="button"
                        >
                          <RefreshCw size={16} color={couleurs.bleu} />
                          <Text style={styles.boutonSecondaireTexte}>
                            {enCours === departement ? "…" : "Régénérer"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.discret}>Aucun rapport pour ce mois.</Text>
                    {peutGenerer(departement) && (
                      <Pressable
                        style={[styles.bouton, styles.boutonPrimaire, { alignSelf: "flex-start", marginTop: espacements.s3 }]}
                        onPress={() => generer(departement)}
                        disabled={enCours !== null}
                        accessibilityRole="button"
                      >
                        <Text style={styles.boutonPrimaireTexte}>
                          {enCours === departement ? "Génération…" : "Générer le rapport"}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}

                {remplaces.length > 0 && (
                  <Pressable
                    style={styles.revisions}
                    onPress={() => setRevisionsOuvertes((v) => ({ ...v, [departement]: !v[departement] }))}
                  >
                    <Text style={styles.revisionsTexte}>Révisions précédentes ({remplaces.length})</Text>
                  </Pressable>
                )}
                {revisionsOuvertes[departement] &&
                  remplaces.map((r) => (
                    <View key={r.id} style={styles.revisionLigne}>
                      <Text style={styles.revisionTexte}>
                        {r.numero} — {r.genereParNom}, {dateHeure(r.genereLe)}
                      </Text>
                      <Pressable onPress={() => ouvrir(r.id)} disabled={enCours !== null}>
                        <Text style={styles.revisionOuvrir}>Ouvrir</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            );
          })}
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { gap: espacements.s4 },
  selecteur: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s3,
  },
  selecteurTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre, textTransform: "capitalize" },
  moisOption: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s3,
  },
  moisOptionActive: { backgroundColor: couleurs.bleuClair },
  moisOptionTexte: { fontSize: 14, color: couleurs.encre, textTransform: "capitalize" },
  moisOptionTexteActif: { fontSize: 14, color: couleurs.bleu, fontWeight: "600", textTransform: "capitalize" },
  erreur: { color: couleurs.danger, fontSize: 14 },
  discret: { color: couleurs.encreFaible, fontSize: 14 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    padding: espacements.s4,
    gap: espacements.s2,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  carteEntete: { flexDirection: "row", alignItems: "center", gap: espacements.s3, marginBottom: espacements.s1 },
  carteTitre: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  ligne: { fontSize: 14, color: couleurs.encre },
  badges: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s1 },
  badgeOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: couleurs.succesClair,
    borderRadius: rayons.pill,
    paddingHorizontal: espacements.s3,
    paddingVertical: 3,
  },
  badgeOkTexte: { fontSize: 12, color: couleurs.succes, fontWeight: "600" },
  badgeKo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: couleurs.dangerClair,
    borderRadius: rayons.pill,
    paddingHorizontal: espacements.s3,
    paddingVertical: 3,
  },
  badgeKoTexte: { fontSize: 12, color: couleurs.danger, fontWeight: "600" },
  badgeProvisoire: {
    backgroundColor: couleurs.infoClair,
    borderRadius: rayons.pill,
    paddingHorizontal: espacements.s3,
    paddingVertical: 3,
  },
  badgeProvisoireTexte: { fontSize: 12, color: couleurs.info, fontWeight: "600" },
  actions: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s3 },
  bouton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: rayons.md, paddingVertical: 10, paddingHorizontal: 14 },
  boutonPrimaire: { backgroundColor: couleurs.bleu },
  boutonPrimaireTexte: { color: "#fff", fontSize: 14, fontWeight: "600" },
  boutonSecondaire: { borderWidth: 1, borderColor: couleurs.bleu, backgroundColor: couleurs.surface200 },
  boutonSecondaireTexte: { color: couleurs.bleu, fontSize: 14, fontWeight: "600" },
  revisions: { marginTop: espacements.s3 },
  revisionsTexte: { fontSize: 13, color: couleurs.encreFaible, textDecorationLine: "underline" },
  revisionLigne: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: espacements.s2 },
  revisionTexte: { fontSize: 13, color: couleurs.encreFaible, flex: 1 },
  revisionOuvrir: { fontSize: 13, color: couleurs.bleu, fontWeight: "600" },
});
