import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ConflitSync, LigneFileAttente } from "@hotel-chicago/sync-engine";
import { SEUIL_ECHEC_DEFINITIF } from "@hotel-chicago/sync-engine";
import { CloudOff, RefreshCw } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { supprimerEcritureCafeteriaLocale } from "../stockage/cafeteriaMirroir";
import { supprimerEcritureReservationLocale } from "../stockage/reservationsMirroir";

export interface EcranSynchronisationProps {
  onRetour: () => void;
}

const LIBELLE_ENTITE: Record<string, string> = {
  Chambre: "Chambre",
  Reservation: "Réservation",
  Produit: "Produit",
  MouvementStock: "Mouvement de stock",
  CompteCafeteria: "Compte cafétaria",
  SousCompte: "Sous-compte",
  LigneCommande: "Ligne de commande",
};

function resumerChamps(donnees: unknown): string {
  if (!donnees || typeof donnees !== "object") return String(donnees);
  return Object.entries(donnees as Record<string, unknown>)
    .filter(([cle]) => !["id", "updatedAt", "createdAt", "syncVersion"].includes(cle))
    .map(([cle, valeur]) => `${cle} : ${valeur}`)
    .join(" · ");
}

function formaterHeure(horodatage: string | null): string {
  if (!horodatage) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(horodatage));
}

/** État du moteur de synchronisation (voir @hotel-chicago/sync-engine) et
 * liste des conflits — jamais résolus silencieusement (section 10.4) : ici,
 * l'utilisateur voit son changement, la version serveur, et choisit de
 * garder cette dernière (le serveur avait déjà gagné côté données ; ce bouton
 * l'acte simplement dans le miroir local pour éviter un `baseSyncVersion`
 * périmé au prochain essai). */
export function EcranSynchronisation({ onRetour }: EcranSynchronisationProps) {
  const { moteurSync } = useSession();
  const etat = useSyncEtat();
  const [conflits, setConflits] = useState<ConflitSync[]>([]);
  const [actionsEchouees, setActionsEchouees] = useState<LigneFileAttente[]>([]);
  const [enResolution, setEnResolution] = useState<string | null>(null);

  async function rechargerConflits() {
    setConflits(await moteurSync.listerConflits());
  }

  async function rechargerActionsEchouees() {
    const file = await moteurSync.listerFileAttente();
    setActionsEchouees(file.filter((l) => l.attempts >= SEUIL_ECHEC_DEFINITIF));
  }

  useEffect(() => {
    rechargerConflits();
    rechargerActionsEchouees();
  }, [etat.conflits, etat.enAttente]);

  async function garderVersionServeur(conflit: ConflitSync) {
    setEnResolution(conflit.id);
    try {
      await moteurSync.resoudreConflitGarderServeur(conflit.id, conflit.entiteType, conflit.donneesServeur);
      await rechargerConflits();
    } finally {
      setEnResolution(null);
    }
  }

  async function retirerActionEchouee(ligne: LigneFileAttente) {
    setEnResolution(ligne.id);
    try {
      await moteurSync.annulerOperation(ligne.id);
      if (ligne.operation === "CREATE") {
        if (ligne.entiteType === "Reservation") {
          await supprimerEcritureReservationLocale(ligne.localId);
        } else {
          await supprimerEcritureCafeteriaLocale(ligne.entiteType, ligne.localId);
        }
      }
      await rechargerActionsEchouees();
    } finally {
      setEnResolution(null);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Synchronisation" onRetour={onRetour} />

      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.carteEtat}>
          <View style={styles.ligneEtat}>
            <Text style={styles.label}>État</Text>
            <Text style={[styles.valeur, { color: etat.enLigne ? couleurs.succes : couleurs.encreFaible }]}>
              {etat.enLigne ? "En ligne" : "Hors ligne"}
            </Text>
          </View>
          <View style={styles.ligneEtat}>
            <Text style={styles.label}>En attente d'envoi</Text>
            <Text style={styles.valeur}>{etat.enAttente}</Text>
          </View>
          <View style={styles.ligneEtat}>
            <Text style={styles.label}>Dernière synchro</Text>
            <Text style={styles.valeur}>{formaterHeure(etat.dernierePousseeLe)}</Text>
          </View>
          {etat.derniereErreur && <Text style={styles.erreur}>{etat.derniereErreur}</Text>}
          <Pressable style={styles.bouton} onPress={() => moteurSync.forcerSynchronisation()}>
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.boutonTexte}>Synchroniser maintenant</Text>
          </Pressable>
        </View>

        <Text style={styles.titreSection}>Conflits à vérifier</Text>

        {conflits.length === 0 && (
          <View style={styles.videConteneur}>
            <CloudOff size={28} color={couleurs.encreFaible} />
            <Text style={styles.videTexte}>Aucun conflit.</Text>
          </View>
        )}

        {conflits.map((conflit) => (
          <View key={conflit.id} style={styles.carteConflit}>
            <Text style={styles.nomEntite}>{LIBELLE_ENTITE[conflit.entiteType] ?? conflit.entiteType}</Text>
            <Text style={styles.ligneConflitLabel}>Vous avez essayé :</Text>
            <Text style={styles.ligneConflitValeur}>{resumerChamps(conflit.monChangement)}</Text>
            <Text style={styles.ligneConflitLabel}>État actuel du serveur :</Text>
            <Text style={styles.ligneConflitValeur}>{resumerChamps(conflit.donneesServeur)}</Text>
            <Pressable
              style={styles.boutonSecondaire}
              onPress={() => garderVersionServeur(conflit)}
              disabled={enResolution === conflit.id}
            >
              <Text style={styles.boutonSecondaireTexte}>
                {enResolution === conflit.id ? "…" : "Garder la version du serveur"}
              </Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.titreSection}>Actions échouées</Text>

        {actionsEchouees.length === 0 && (
          <View style={styles.videConteneur}>
            <CloudOff size={28} color={couleurs.encreFaible} />
            <Text style={styles.videTexte}>Aucune action bloquée.</Text>
          </View>
        )}

        {actionsEchouees.map((ligne) => (
          <View key={ligne.id} style={styles.carteConflit}>
            <Text style={styles.nomEntite}>{LIBELLE_ENTITE[ligne.entiteType] ?? ligne.entiteType}</Text>
            <Text style={styles.ligneConflitLabel}>Vous avez essayé :</Text>
            <Text style={styles.ligneConflitValeur}>{resumerChamps(ligne.payload)}</Text>
            <Text style={styles.ligneConflitLabel}>Erreur du serveur ({ligne.attempts} essais) :</Text>
            <Text style={styles.ligneConflitValeur}>{ligne.lastError ?? "Erreur inconnue."}</Text>
            <Pressable
              style={styles.boutonSecondaire}
              onPress={() => retirerActionEchouee(ligne)}
              disabled={enResolution === ligne.id}
            >
              <Text style={styles.boutonSecondaireTexte}>
                {enResolution === ligne.id ? "…" : "Retirer cette action"}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carteEtat: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
  },
  ligneEtat: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, color: couleurs.encreAttenuee },
  valeur: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  erreur: { fontSize: 12, color: couleurs.danger },
  bouton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    height: 42,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    marginTop: espacements.s2,
  },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  titreSection: {
    fontSize: 12,
    fontWeight: "700",
    color: couleurs.encreAttenuee,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: espacements.s2,
  },
  videConteneur: { alignItems: "center", padding: espacements.s6, gap: espacements.s2 },
  videTexte: { fontSize: 14, color: couleurs.encreAttenuee },
  carteConflit: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.alerte,
    padding: espacements.s4,
    gap: 4,
  },
  nomEntite: { fontSize: 15, fontWeight: "700", color: couleurs.encre, marginBottom: 4 },
  ligneConflitLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s1 },
  ligneConflitValeur: { fontSize: 13, color: couleurs.encre },
  boutonSecondaire: {
    marginTop: espacements.s3,
    height: 40,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
});
