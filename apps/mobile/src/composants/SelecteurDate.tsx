import * as React from "react";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface SelecteurDateProps {
  /** Date au format ISO "AAAA-MM-JJ" (chaîne vide = non renseignée). */
  valeur: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}

const JOURS_SEMAINE = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

function isoDepuisSaisie(saisie: string): string | null {
  const m = saisie.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, j, mo, a] = m;
  const d = new Date(Number(a), Number(mo) - 1, Number(j));
  if (d.getFullYear() !== Number(a) || d.getMonth() !== Number(mo) - 1 || d.getDate() !== Number(j)) return null;
  return `${a}-${mo}-${j}`;
}

export function saisieDepuisIso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function isoDuJour(a: number, mo: number, j: number): string {
  return `${a}-${String(mo + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

function aujourdhuiIso(): string {
  const d = new Date();
  return isoDuJour(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Champ de date à double saisie : texte libre JJ/MM/AAAA (convention de l'app)
 * ou choix dans un calendrier en dialogue centré. La valeur exposée reste
 * toujours l'ISO AAAA-MM-JJ attendu par l'API.
 */
export function SelecteurDate({ valeur, onChange, placeholder = "JJ/MM/AAAA" }: SelecteurDateProps) {
  const [saisie, setSaisie] = useState(saisieDepuisIso(valeur));
  const [calendrierOuvert, setCalendrierOuvert] = useState(false);
  const initiale = valeur.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${valeur}T12:00:00`) : new Date();
  const [moisVisible, setMoisVisible] = useState({ a: initiale.getFullYear(), mo: initiale.getMonth() });

  function changerSaisie(texte: string) {
    setSaisie(texte);
    if (!texte.trim()) {
      onChange("");
      return;
    }
    const iso = isoDepuisSaisie(texte);
    if (iso) onChange(iso);
  }

  function choisir(jour: number) {
    const iso = isoDuJour(moisVisible.a, moisVisible.mo, jour);
    onChange(iso);
    setSaisie(saisieDepuisIso(iso));
    setCalendrierOuvert(false);
  }

  function changerMois(delta: number) {
    setMoisVisible((m) => {
      const d = new Date(m.a, m.mo + delta, 1);
      return { a: d.getFullYear(), mo: d.getMonth() };
    });
  }

  const semaines = useMemo(() => {
    const premier = new Date(moisVisible.a, moisVisible.mo, 1);
    const nbJours = new Date(moisVisible.a, moisVisible.mo + 1, 0).getDate();
    const decalage = (premier.getDay() + 6) % 7; // lundi = 0
    const cellules: (number | null)[] = Array(decalage).fill(null);
    for (let j = 1; j <= nbJours; j++) cellules.push(j);
    while (cellules.length % 7 !== 0) cellules.push(null);
    const lignes: (number | null)[][] = [];
    for (let i = 0; i < cellules.length; i += 7) lignes.push(cellules.slice(i, i + 7));
    return lignes;
  }, [moisVisible]);

  const aujourdHui = aujourdhuiIso();
  const titreMois = new Date(moisVisible.a, moisVisible.mo, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <View>
      <View style={styles.ligneChamp}>
        <TextInput
          style={[styles.champ, styles.champFlex]}
          value={saisie}
          onChangeText={changerSaisie}
          placeholder={placeholder}
          placeholderTextColor={couleurs.encreFaible}
          keyboardType="numbers-and-punctuation"
        />
        <Pressable
          style={styles.boutonCalendrier}
          onPress={() => setCalendrierOuvert(true)}
          accessibilityLabel="Choisir dans le calendrier"
        >
          <CalendarDays size={20} color={couleurs.bleu} />
        </Pressable>
      </View>

      <Modal visible={calendrierOuvert} transparent animationType="fade" onRequestClose={() => setCalendrierOuvert(false)}>
        <Pressable style={styles.fond} onPress={() => setCalendrierOuvert(false)}>
          <Pressable style={styles.carte} onPress={(e) => e.stopPropagation()}>
            <View style={styles.enteteMois}>
              <Pressable onPress={() => changerMois(-1)} hitSlop={10} accessibilityLabel="Mois précédent">
                <ChevronLeft size={22} color={couleurs.encre} />
              </Pressable>
              <Text style={styles.titreMois}>{titreMois}</Text>
              <Pressable onPress={() => changerMois(1)} hitSlop={10} accessibilityLabel="Mois suivant">
                <ChevronRight size={22} color={couleurs.encre} />
              </Pressable>
            </View>

            <View style={styles.ligneJours}>
              {JOURS_SEMAINE.map((j) => (
                <Text key={j} style={styles.jourSemaine}>{j}</Text>
              ))}
            </View>

            {semaines.map((sem, i) => (
              <View key={i} style={styles.ligneJours}>
                {sem.map((jour, k) => {
                  if (jour === null) return <View key={k} style={styles.cellule} />;
                  const iso = isoDuJour(moisVisible.a, moisVisible.mo, jour);
                  const selectionne = iso === valeur;
                  const estAujourdHui = iso === aujourdHui;
                  return (
                    <Pressable
                      key={k}
                      style={[styles.cellule, estAujourdHui && styles.celluleAujourdhui, selectionne && styles.celluleSelectionnee]}
                      onPress={() => choisir(jour)}
                    >
                      <Text style={[styles.jour, estAujourdHui && styles.jourAujourdhui, selectionne && styles.jourSelectionne]}>
                        {jour}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Pressable
              style={styles.boutonAujourdhui}
              onPress={() => {
                const d = new Date();
                setMoisVisible({ a: d.getFullYear(), mo: d.getMonth() });
                choisir(d.getDate());
              }}
            >
              <Text style={styles.boutonAujourdhuiTexte}>Aujourd'hui</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  ligneChamp: { flexDirection: "row", gap: espacements.s2, alignItems: "center" },
  champ: {
    borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3, minHeight: 44, fontSize: 15,
    color: couleurs.encre, backgroundColor: couleurs.surface200,
  },
  champFlex: { flex: 1 },
  boutonCalendrier: {
    width: 44, height: 44, borderRadius: rayons.sm,
    borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200,
    alignItems: "center", justifyContent: "center",
  },
  // Dialogue centré : marge sur les quatre côtés, taille contenue.
  fond: {
    flex: 1, backgroundColor: "rgba(15,39,66,0.4)",
    alignItems: "center", justifyContent: "center", padding: espacements.s5,
  },
  carte: {
    width: "100%", maxWidth: 360, backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg, padding: espacements.s4, gap: espacements.s2,
    // Ombre légère, cohérente avec les cartes de l'app.
    elevation: 8,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  enteteMois: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: espacements.s2 },
  titreMois: { fontSize: 16, fontWeight: "700", color: couleurs.encre, textTransform: "capitalize" },
  ligneJours: { flexDirection: "row" },
  jourSemaine: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, paddingVertical: espacements.s1 },
  cellule: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: rayons.pill },
  celluleAujourdhui: { borderWidth: 1, borderColor: couleurs.bleu },
  celluleSelectionnee: { backgroundColor: couleurs.bleu },
  jour: { fontSize: 14, color: couleurs.encre },
  jourAujourdhui: { color: couleurs.bleu, fontWeight: "700" },
  jourSelectionne: { color: "#fff", fontWeight: "700" },
  boutonAujourdhui: { alignSelf: "center", paddingVertical: espacements.s2, paddingHorizontal: espacements.s4 },
  boutonAujourdhuiTexte: { color: couleurs.bleu, fontWeight: "600", fontSize: 14 },
});
