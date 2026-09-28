import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import {
  ClientMiroir,
  ReservationMiroir,
  listerClientsMiroir,
  listerReservationsMiroir,
} from "../stockage/reservationsMirroir";

export interface EcranClientsProps {
  onRetour: () => void;
}

function dateCourte(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const LABEL_STATUT: Record<string, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

/**
 * Répertoire des clients — lecture du miroir local (fonctionne hors ligne).
 * La création de clients se fait implicitement à la réservation (client
 * inline) ; un client créé hors ligne apparaît ici dès l'écriture
 * optimiste, marqué « en attente de synchro » jusqu'à son remoteId.
 */
export function EcranClients({ onRetour }: EcranClientsProps) {
  const { moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const [clients, setClients] = useState<ClientMiroir[] | null>(null);
  const [reservations, setReservations] = useState<ReservationMiroir[]>([]);
  const [recherche, setRecherche] = useState("");
  const [clientChoisi, setClientChoisi] = useState<ClientMiroir | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const recharger = useCallback(() => {
    Promise.all([listerClientsMiroir(), listerReservationsMiroir()])
      .then(([c, r]) => {
        setClients(c);
        setReservations(r);
      })
      .catch((e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    recharger();
    moteurSync.forcerSynchronisation();
  }, [recharger, moteurSync]);

  useEffect(() => {
    if (etatSync.dernierePousseeLe) recharger();
  }, [etatSync.dernierePousseeLe, recharger]);

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    recharger();
    setRafraichissement(false);
  }

  const liste = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (clients ?? []).filter(
      (c) => !terme || c.nom.toLowerCase().includes(terme) || (c.telephone ?? "").includes(recherche.trim())
    );
  }, [clients, recherche]);

  const sejoursDuClient = useMemo(() => {
    if (!clientChoisi) return [];
    return reservations.filter((r) => r.clientId === clientChoisi.id || r.clientId === clientChoisi.remoteId);
  }, [clientChoisi, reservations]);

  if (clientChoisi) {
    return (
      <View style={styles.page}>
        <EnteteMobile />
        <EnteteRetour titre={clientChoisi.nom} sousTitre="Fiche client" onRetour={() => setClientChoisi(null)} />
        <ScrollView contentContainerStyle={styles.contenu}>
          <View style={styles.carte}>
            {clientChoisi.telephone && <Text style={styles.ligne}>{clientChoisi.telephone}</Text>}
            {clientChoisi.email && <Text style={styles.ligne}>{clientChoisi.email}</Text>}
            {!clientChoisi.telephone && !clientChoisi.email && (
              <Text style={styles.ligneSecondaire}>Aucune coordonnée enregistrée.</Text>
            )}
            {clientChoisi.remoteId === null && <Text style={styles.horsLigne}>Créé hors ligne — en attente de synchronisation.</Text>}
          </View>

          <Text style={styles.titreSection}>Séjours ({sejoursDuClient.length})</Text>
          {sejoursDuClient.map((r) => (
            <View key={r.id} style={styles.carte}>
              <Text style={styles.ligne}>
                Ch. {r.chambre.numero} · {dateCourte(r.dateArrivee)} → {dateCourte(r.dateDepart)}
              </Text>
              <Text style={styles.ligneSecondaire}>{LABEL_STATUT[r.statut] ?? r.statut}</Text>
            </View>
          ))}
          {sejoursDuClient.length === 0 && <Text style={styles.ligneSecondaire}>Aucun séjour enregistré.</Text>}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Clients" sousTitre={clients ? `${clients.length} client${clients.length > 1 ? "s" : ""}` : undefined} onRetour={onRetour} />

      <View style={styles.rechercheConteneur}>
        <TextInput
          style={styles.champ}
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Rechercher par nom ou téléphone"
          placeholderTextColor={couleurs.encreFaible}
        />
      </View>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {clients && liste.length === 0 && (
        <View style={styles.videConteneur}>
          <Text style={styles.videTexte}>
            {recherche ? "Aucun client ne correspond à la recherche." : "Aucun client — ils sont créés à la première réservation."}
          </Text>
        </View>
      )}

      <FlatList
        data={liste}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => (
          <Pressable style={styles.carte} onPress={() => setClientChoisi(item)}>
            <Text style={styles.clientNom}>{item.nom}</Text>
            <Text style={styles.ligneSecondaire}>
              {[item.telephone, item.remoteId === null ? "en attente de synchro" : null].filter(Boolean).join(" · ") || "—"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  rechercheConteneur: { paddingHorizontal: espacements.s4, paddingBottom: espacements.s2 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface200,
  },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  liste: { padding: espacements.s4, gap: espacements.s2 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 3,
  },
  clientNom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  ligne: { fontSize: 14, color: couleurs.encre },
  ligneSecondaire: { fontSize: 12, color: couleurs.encreAttenuee },
  horsLigne: { fontSize: 12, color: couleurs.alerte, marginTop: espacements.s2 },
  titreSection: {
    fontSize: 12,
    fontWeight: "700",
    color: couleurs.encreAttenuee,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: espacements.s2,
  },
  videConteneur: { alignItems: "center", padding: espacements.s7 },
  videTexte: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center" },
});
