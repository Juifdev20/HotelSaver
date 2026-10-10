import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { FeuilleModale } from "../composants/FeuilleModale";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import type { ClientAvecSejours } from "@hotel-chicago/api-client";

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
 * Répertoire des clients — lu dans la base locale (fonctionne hors ligne).
 * La création de clients se fait implicitement à la réservation ; un client
 * créé hors ligne apparaît ici tout de suite, marqué « en attente de
 * synchro » jusqu'à son enregistrement par le serveur. La fiche (registre
 * de police, notes) se modifie aussi hors ligne.
 */
export function EcranClients({ onRetour }: EcranClientsProps) {
  const { moteurSync, client: api, miroir } = useSession();
  const etatSync = useSyncEtat();
  const [clients, setClients] = useState<ClientAvecSejours[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [clientChoisi, setClientChoisi] = useState<ClientAvecSejours | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState({ nom: "", telephone: "", email: "", typePiece: "", numeroPiece: "", notes: "" });
  const [enCours, setEnCours] = useState(false);

  const recharger = useCallback(() => {
    api
      .listerClients()
      .then((c) => {
        setClients(c);
        setClientChoisi((choisi) => (choisi ? (c.find((x) => x.id === choisi.id) ?? choisi) : choisi));
      })
      .catch((e: Error) => setErreur(e.message));
  }, [api]);

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

  const sejoursDuClient = clientChoisi?.reservations ?? [];

  /** Registre de police + notes : écrit en local, envoyé au serveur dès que possible. */
  async function enregistrerFiche() {
    if (!clientChoisi) return;
    if (!saisie.nom.trim()) {
      setErreur("Le nom du client est obligatoire.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await api.modifierClient(clientChoisi.id, {
        nom: saisie.nom.trim(),
        telephone: saisie.telephone.trim(),
        email: saisie.email.trim(),
        typePiece: saisie.typePiece.trim(),
        numeroPiece: saisie.numeroPiece.trim(),
        notes: saisie.notes.trim(),
      });
      setEdition(false);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'enregistrer la fiche.");
    } finally {
      setEnCours(false);
    }
  }

  function ouvrirEdition() {
    if (!clientChoisi) return;
    setSaisie({
      nom: clientChoisi.nom,
      telephone: clientChoisi.telephone ?? "",
      email: clientChoisi.email ?? "",
      typePiece: clientChoisi.typePiece ?? "",
      numeroPiece: clientChoisi.numeroPiece ?? "",
      notes: clientChoisi.notes ?? "",
    });
    setErreur(null);
    setEdition(true);
  }

  if (clientChoisi) {
    return (
      <View style={styles.page}>
        <EnteteMobile />
        <EnteteRetour titre={clientChoisi.nom} sousTitre="Fiche client" onRetour={() => setClientChoisi(null)} />
        <ConteneurFormulaire styleContenu={styles.contenu}>
          <View style={styles.carte}>
            {clientChoisi.telephone && <Text style={styles.ligne}>{clientChoisi.telephone}</Text>}
            {clientChoisi.email && <Text style={styles.ligne}>{clientChoisi.email}</Text>}
            {(clientChoisi.typePiece || clientChoisi.numeroPiece) && (
              <Text style={styles.ligneSecondaire}>
                Pièce : {[clientChoisi.typePiece, clientChoisi.numeroPiece].filter(Boolean).join(" · ")}
              </Text>
            )}
            {clientChoisi.notes && <Text style={styles.note}>{clientChoisi.notes}</Text>}
            {!clientChoisi.telephone && !clientChoisi.email && !clientChoisi.typePiece && (
              <Text style={styles.ligneSecondaire}>Aucune coordonnée ni pièce enregistrée.</Text>
            )}
            {miroir.estCreationEnAttente(clientChoisi.id) && (
              <Text style={styles.horsLigne}>Créé sur cet appareil — en attente de synchronisation.</Text>
            )}
            <Pressable style={styles.boutonModifier} onPress={ouvrirEdition} accessibilityRole="button">
              <Text style={styles.boutonModifierTexte}>Compléter la fiche</Text>
            </Pressable>
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
        </ConteneurFormulaire>

        <FeuilleModale visible={edition} onFermer={() => setEdition(false)} titre="Fiche client">
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          <Text style={styles.champLabel}>Nom</Text>
          <TextInput style={styles.champ} value={saisie.nom} onChangeText={(v) => setSaisie((s) => ({ ...s, nom: v }))} placeholder="Nom du client" placeholderTextColor={couleurs.encreFaible} />
          <Text style={styles.champLabel}>Téléphone</Text>
          <TextInput style={styles.champ} value={saisie.telephone} onChangeText={(v) => setSaisie((s) => ({ ...s, telephone: v }))} placeholder="+243 …" placeholderTextColor={couleurs.encreFaible} keyboardType="phone-pad" />
          <Text style={styles.champLabel}>Email</Text>
          <TextInput style={styles.champ} value={saisie.email} onChangeText={(v) => setSaisie((s) => ({ ...s, email: v }))} placeholder="Optionnel" placeholderTextColor={couleurs.encreFaible} keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.champLabel}>Type de pièce</Text>
          <TextInput style={styles.champ} value={saisie.typePiece} onChangeText={(v) => setSaisie((s) => ({ ...s, typePiece: v }))} placeholder="CNI, passeport, permis…" placeholderTextColor={couleurs.encreFaible} />
          <Text style={styles.champLabel}>N° de pièce</Text>
          <TextInput style={styles.champ} value={saisie.numeroPiece} onChangeText={(v) => setSaisie((s) => ({ ...s, numeroPiece: v }))} placeholder="Numéro de la pièce" placeholderTextColor={couleurs.encreFaible} />
          <Text style={styles.champLabel}>Notes (suivi interne)</Text>
          <TextInput style={[styles.champ, styles.champMulti]} value={saisie.notes} onChangeText={(v) => setSaisie((s) => ({ ...s, notes: v }))} placeholder="VIP, habitudes, restrictions…" placeholderTextColor={couleurs.encreFaible} multiline />
          <Pressable style={styles.bouton} onPress={enregistrerFiche} disabled={enCours}>
            <Text style={styles.boutonTexte}>{enCours ? "…" : "Enregistrer"}</Text>
          </Pressable>
        </FeuilleModale>
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
              {[item.telephone, miroir.estCreationEnAttente(item.id) ? "en attente de synchro" : null].filter(Boolean).join(" · ") || "—"}
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
  note: { fontSize: 13, color: couleurs.violet, fontStyle: "italic", marginTop: 2 },
  boutonModifier: { marginTop: espacements.s3, alignSelf: "flex-start" },
  boutonModifierTexte: { fontSize: 13, fontWeight: "700", color: couleurs.bleu },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  champMulti: { minHeight: 64, textAlignVertical: "top", paddingTop: espacements.s3 },
  bouton: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s3 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
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
