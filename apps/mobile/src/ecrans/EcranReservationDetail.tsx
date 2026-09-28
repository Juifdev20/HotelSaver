import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { Devise, ModePaiement, StatutChambre } from "@hotel-chicago/types";
import type { StatutReservation } from "@hotel-chicago/types";
import { construireRecuFacture } from "@hotel-chicago/receipts";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { imprimerLignes } from "../impression/imprimante";
import {
  ReservationMiroir,
  ecrireStatutReservationLocal,
  modifierReservationLocale,
  obtenirReservationMiroir,
} from "../stockage/reservationsMirroir";
import { ecrireStatutChambreLocal } from "../stockage/chambresMirroir";

export interface EcranReservationDetailProps {
  /** Id local miroir (les ids locaux non synchronisés fonctionnent aussi). */
  reservationId: string;
  onRetour: () => void;
  /** Ouvre la facturation pour cette réservation (id serveur — l'écran
   * facturation appelle l'API directement). */
  onFacturer: (reservationIdServeur: string) => void;
  /** Appelé après chaque action pour que le hub recharge son miroir. */
  onChange: () => void;
}

const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

const COULEUR_STATUT: Record<StatutReservation, { fond: string; texte: string }> = {
  EN_ATTENTE: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  CONFIRMEE: { fond: couleurs.bleuClair, texte: couleurs.bleu },
  EN_COURS: { fond: couleurs.succesClair, texte: couleurs.succes },
  TERMINEE: { fond: couleurs.bordure, texte: couleurs.encreAttenuee },
  ANNULEE: { fond: couleurs.dangerClair, texte: couleurs.danger },
};

function dateCourte(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function isoDepuisSaisie(saisie: string): string | null {
  const m = saisie.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, j, mo, a] = m;
  const date = new Date(Number(a), Number(mo) - 1, Number(j), 12, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(j)) return null;
  return date.toISOString();
}

function saisieDepuisIso(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Fiche d'une réservation lue dans le miroir. La modification des dates et
 * de l'acompte passe par la file de sync (fonctionne hors ligne dès que la
 * réservation a un remoteId) ; les transitions de statut sont des actions
 * transactionnelles qui exigent le réseau — comme l'encaissement cafétaria.
 */
export function EcranReservationDetail({ reservationId, onRetour, onFacturer, onChange }: EcranReservationDetailProps) {
  const { client, moteurSync, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  const [reservation, setReservation] = useState<ReservationMiroir | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<"annuler" | "modifier" | null>(null);
  const [motif, setMotif] = useState("");
  const [saisieArrivee, setSaisieArrivee] = useState("");
  const [saisieDepart, setSaisieDepart] = useState("");
  const [saisieAcompte, setSaisieAcompte] = useState("");
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  const recharger = useCallback(() => {
    obtenirReservationMiroir(reservationId)
      .then(setReservation)
      .catch((e: Error) => setErreur(e.message));
  }, [reservationId]);

  useEffect(recharger, [recharger]);

  const estSynchronisee = reservation?.remoteId != null;
  const enLigne = etatSync.enLigne;
  const actionsEnLignePossibles = enLigne && estSynchronisee;
  const idServeur = reservation?.remoteId ?? reservationId;

  async function executer(nom: string, action: () => Promise<void>) {
    setEnCours(nom);
    setErreur(null);
    try {
      await action();
      onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(null);
    }
  }

  function confirmer() {
    if (!reservation) return;
    void executer("confirmer", async () => {
      await client.confirmerReservation(idServeur);
      await ecrireStatutReservationLocal(reservation.id, "CONFIRMEE");
      await recharger();
    });
  }

  function checkIn() {
    if (!reservation) return;
    void executer("checkin", async () => {
      await client.checkIn(idServeur);
      await ecrireStatutReservationLocal(reservation.id, "EN_COURS");
      await ecrireStatutChambreLocal(reservation.chambreId, StatutChambre.OCCUPEE);
      await recharger();
    });
  }

  function annuler() {
    if (!reservation || !motif.trim()) {
      setErreur("Le motif d'annulation est obligatoire.");
      return;
    }
    const motifFinal = motif.trim();
    setFeuille(null);
    setMotif("");
    void executer("annuler", async () => {
      await client.annulerReservation(idServeur, motifFinal);
      await ecrireStatutReservationLocal(reservation.id, "ANNULEE", {
        annuleLe: new Date().toISOString(),
        motifAnnulation: motifFinal,
      });
      await recharger();
    });
  }

  function modifier() {
    if (!reservation) return;
    const dateArrivee = saisieArrivee.trim() ? isoDepuisSaisie(saisieArrivee) : undefined;
    const dateDepart = saisieDepart.trim() ? isoDepuisSaisie(saisieDepart) : undefined;
    if (saisieArrivee.trim() && !dateArrivee) {
      setErreur("Date d'arrivée invalide — format JJ/MM/AAAA.");
      return;
    }
    if (saisieDepart.trim() && !dateDepart) {
      setErreur("Date de départ invalide — format JJ/MM/AAAA.");
      return;
    }
    const arriveeFinale = dateArrivee ?? reservation.dateArrivee;
    const departFinal = dateDepart ?? reservation.dateDepart;
    if (new Date(arriveeFinale) >= new Date(departFinal)) {
      setErreur("La date de départ doit être postérieure à la date d'arrivée.");
      return;
    }
    const acompte = saisieAcompte.trim() ? Number(saisieAcompte.replace(/\s/g, "").replace(",", ".")) : undefined;
    if (acompte !== undefined && (Number.isNaN(acompte) || acompte < 0)) {
      setErreur("Acompte invalide.");
      return;
    }
    setFeuille(null);
    void executer("modifier", async () => {
      // Écriture optimiste + file UPDATE : fonctionne aussi hors ligne
      // (remoteId + baseSyncVersion présents car l'action n'est proposée que
      // pour les réservations déjà synchronisées).
      const payload = await modifierReservationLocale(reservation, {
        dateArrivee: dateArrivee ?? undefined,
        dateDepart: dateDepart ?? undefined,
        acompte,
      });
      await moteurSync.mettreEnFile({
        entiteType: "Reservation",
        localId: reservation.id,
        remoteId: reservation.remoteId!,
        operation: "UPDATE",
        payload,
        baseSyncVersion: reservation.syncVersion,
      });
      await recharger();
    });
  }

  async function reimprimerRecu() {
    if (!reservation) return;
    setEnCours("impression");
    setMessageImpression(null);
    try {
      const factures = await client.listerFactures(idServeur);
      const facture = factures[0];
      if (!facture) {
        setMessageImpression("Aucune facture liée à ce séjour.");
        return;
      }
      const [reservationComplete, ventes] = await Promise.all([
        client.obtenirReservation(idServeur),
        client.listerVentesCafeteria(idServeur),
      ]);
      await imprimerLignes(construireRecuFacture(facture, reservationComplete, utilisateur.nom, ventes));
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnCours(null);
    }
  }

  function bouton(nom: string, libelle: string, action: () => void, actif: boolean, secondaire = false) {
    const inactif = !actif;
    return (
      <Pressable
        key={nom}
        style={[secondaire ? styles.boutonSecondaire : styles.bouton, inactif && styles.boutonInactif]}
        onPress={action}
        disabled={inactif || enCours !== null}
      >
        <Text style={[secondaire ? styles.boutonSecondaireTexte : styles.boutonTexte]}>
          {enCours === nom ? "…" : libelle}
        </Text>
      </Pressable>
    );
  }

  if (!reservation && !erreur) {
    return (
      <View style={styles.page}>
        <EnteteMobile />
        <EnteteRetour titre="Réservation" onRetour={onRetour} />
        <ActivityIndicator style={{ marginTop: espacements.s6 }} color={couleurs.bleu} />
      </View>
    );
  }

  const statut = reservation?.statut;
  const nuits = reservation
    ? Math.max(1, Math.round((new Date(reservation.dateDepart).getTime() - new Date(reservation.dateArrivee).getTime()) / 86400000))
    : 0;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre={reservation ? `${reservation.client.nom}` : "Réservation"}
        sousTitre={reservation ? `Chambre ${reservation.chambre.numero} · ${reservation.chambre.type}` : undefined}
        onRetour={onRetour}
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {messageImpression && <Text style={styles.messageInfo}>{messageImpression}</Text>}

      {reservation && statut && (
        <ConteneurFormulaire styleContenu={styles.contenu}>
          <View style={styles.carte}>
            <View style={styles.ligneEntete}>
              <Text style={styles.titre}>Séjour</Text>
              <View style={[styles.badge, { backgroundColor: COULEUR_STATUT[statut].fond }]}>
                <Text style={[styles.badgeTexte, { color: COULEUR_STATUT[statut].texte }]}>{LABEL_STATUT[statut]}</Text>
              </View>
            </View>
            <Text style={styles.ligne}>
              {dateCourte(reservation.dateArrivee)} → {dateCourte(reservation.dateDepart)} · {nuits} nuit{nuits > 1 ? "s" : ""}
            </Text>
            <Text style={styles.ligneSecondaire}>
              {formatMontant(reservation.chambre.prixParNuit, reservation.chambre.devise)} / nuit · Acompte{" "}
              {formatMontant(reservation.acompte, reservation.chambre.devise)}
            </Text>
            {reservation.origine === "SITE_PUBLIC" && <Text style={styles.ligneSecondaire}>Demande reçue du site public</Text>}
            {statut === "ANNULEE" && reservation.motifAnnulation && (
              <Text style={styles.ligneSecondaire}>Motif d'annulation : {reservation.motifAnnulation}</Text>
            )}
            {!estSynchronisee && (
              <Text style={styles.horsLigne}>Créée hors ligne — en attente de synchronisation.</Text>
            )}
            {estSynchronisee && !enLigne && (
              <Text style={styles.horsLigne}>Hors ligne — check-in, annulation et facturation indisponibles.</Text>
            )}
          </View>

          <View style={styles.carte}>
            <Text style={styles.titre}>Client</Text>
            <Text style={styles.ligne}>{reservation.client.nom}</Text>
            {reservation.client.telephone && <Text style={styles.ligneSecondaire}>{reservation.client.telephone}</Text>}
            {reservation.client.email && <Text style={styles.ligneSecondaire}>{reservation.client.email}</Text>}
          </View>

          <View style={styles.actions}>
            {statut === "EN_ATTENTE" &&
              bouton("confirmer", "Confirmer la demande", confirmer, actionsEnLignePossibles)}
            {statut === "CONFIRMEE" &&
              bouton("checkin", "Check-in", checkIn, actionsEnLignePossibles)}
            {(statut === "CONFIRMEE" || statut === "EN_COURS") &&
              bouton(
                "modifier",
                "Modifier dates / acompte",
                () => {
                  setSaisieArrivee(saisieDepuisIso(reservation.dateArrivee));
                  setSaisieDepart(saisieDepuisIso(reservation.dateDepart));
                  setSaisieAcompte(reservation.acompte !== "0" ? String(reservation.acompte) : "");
                  setErreur(null);
                  setFeuille("modifier");
                },
                estSynchronisee,
                true
              )}
            {statut === "EN_COURS" &&
              bouton("facturer", "Facturer et check-out", () => onFacturer(idServeur), actionsEnLignePossibles)}
            {(statut === "EN_ATTENTE" ||
              statut === "CONFIRMEE" ||
              statut === "EN_COURS") &&
              bouton(
                "annuler",
                "Annuler la réservation",
                () => {
                  setMotif("");
                  setErreur(null);
                  setFeuille("annuler");
                },
                actionsEnLignePossibles,
                true
              )}
            {statut === "TERMINEE" &&
              bouton("impression", "Réimprimer le reçu", reimprimerRecu, actionsEnLignePossibles, true)}
          </View>
        </ConteneurFormulaire>
      )}

      <FeuilleModale visible={feuille === "annuler"} onFermer={() => setFeuille(null)} titre="Annuler la réservation">
        <Text style={styles.champLabel}>Motif d'annulation (obligatoire)</Text>
        <TextInput
          style={styles.champ}
          value={motif}
          onChangeText={setMotif}
          placeholder="Ex. Le client ne se présente pas"
          placeholderTextColor={couleurs.encreFaible}
          multiline
        />
        <Pressable style={styles.boutonDanger} onPress={annuler}>
          <Text style={styles.boutonTexte}>Confirmer l'annulation</Text>
        </Pressable>
      </FeuilleModale>

      <FeuilleModale visible={feuille === "modifier"} onFermer={() => setFeuille(null)} titre="Modifier la réservation">
        <Text style={styles.champLabel}>Arrivée (JJ/MM/AAAA)</Text>
        <TextInput style={styles.champ} value={saisieArrivee} onChangeText={setSaisieArrivee} placeholder="JJ/MM/AAAA" placeholderTextColor={couleurs.encreFaible} keyboardType="numbers-and-punctuation" />
        <Text style={styles.champLabel}>Départ (JJ/MM/AAAA)</Text>
        <TextInput style={styles.champ} value={saisieDepart} onChangeText={setSaisieDepart} placeholder="JJ/MM/AAAA" placeholderTextColor={couleurs.encreFaible} keyboardType="numbers-and-punctuation" />
        <Text style={styles.champLabel}>Acompte ({reservation?.chambre.devise})</Text>
        <TextInput style={styles.champ} value={saisieAcompte} onChangeText={setSaisieAcompte} placeholder="0" placeholderTextColor={couleurs.encreFaible} keyboardType="numeric" />
        <Pressable style={styles.bouton} onPress={modifier}>
          <Text style={styles.boutonTexte}>Enregistrer</Text>
        </Pressable>
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  messageInfo: { color: couleurs.succes, fontSize: 13, paddingHorizontal: espacements.s4 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  ligneEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titre: { fontSize: 15, fontWeight: "700", color: couleurs.navy },
  ligne: { fontSize: 14, color: couleurs.encre },
  ligneSecondaire: { fontSize: 13, color: couleurs.encreAttenuee },
  horsLigne: { fontSize: 12, color: couleurs.alerte, marginTop: espacements.s2 },
  badge: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  actions: { gap: espacements.s2 },
  bouton: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonSecondaire: {
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface200,
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "700", fontSize: 14 },
  boutonDanger: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.danger, alignItems: "center", justifyContent: "center" },
  boutonInactif: { opacity: 0.45 },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
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
});
