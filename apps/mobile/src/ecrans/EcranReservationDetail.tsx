import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { codeSuivi, lienSuivi, peutOperer } from "@hotel-chicago/types";
import type { Reservation, StatutReservation } from "@hotel-chicago/types";
import { construireRecuFacture, enteteHotel } from "@hotel-chicago/receipts";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { Link2, MessageCircle, Pencil } from "lucide-react-native";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurDate } from "../composants/SelecteurDate";
import { useSession } from "../contexteSession";
import { imprimerLignes } from "../impression/imprimante";
import { lireMontant, lireQuantite, lireTauxChange } from "@hotel-chicago/regles";

export interface EcranReservationDetailProps {
  /** Id de la réservation (local ou serveur — le miroir résout les deux). */
  reservationId: string;
  onRetour: () => void;
  /** Ouvre la facturation pour cette réservation. */
  onFacturer: (reservationId: string) => void;
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
 * Fiche d'une réservation lue dans la base locale. Toutes les actions
 * (confirmation, check-in, annulation, modification) s'écrivent d'abord en
 * local puis partent au serveur dès que le réseau revient.
 */
export function EcranReservationDetail({ reservationId, onRetour, onFacturer, onChange }: EcranReservationDetailProps) {
  const { client, miroir, utilisateur } = useSession();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<"annuler" | "modifier" | "whatsapp" | "reponse" | null>(null);
  const [motif, setMotif] = useState("");
  const [saisieArrivee, setSaisieArrivee] = useState("");
  const [saisieDepart, setSaisieDepart] = useState("");
  const [saisieAcompte, setSaisieAcompte] = useState("");
  const [saisieNote, setSaisieNote] = useState("");
  const [saisieReponse, setSaisieReponse] = useState("");
  const [messageImpression, setMessageImpression] = useState<string | null>(null);
  const [messageWhatsApp, setMessageWhatsApp] = useState("");

  const recharger = useCallback(() => {
    client
      .obtenirReservation(reservationId)
      .then(setReservation)
      .catch((e: Error) => setErreur(e.message));
  }, [reservationId]);

  useEffect(recharger, [recharger]);

  const enAttente = reservation ? miroir.estCreationEnAttente(reservation.id) : false;
  const idServeur = reservation?.id ?? reservationId;

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
      recharger();
    });
  }

  function checkIn() {
    if (!reservation) return;
    void executer("checkin", async () => {
      await client.checkIn(idServeur);
      recharger();
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
      recharger();
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
    const acompteLu = saisieAcompte.trim()
      ? lireMontant(saisieAcompte, reservation.chambre.devise, { autoriserZero: true, max: 100_000_000 })
      : null;
    if (acompteLu && !acompteLu.ok) {
      setErreur(`Acompte : ${acompteLu.message}`);
      return;
    }
    const acompte = acompteLu && acompteLu.ok ? acompteLu.valeur : undefined;
    const noteModifiee = saisieNote.trim() !== (reservation.note ?? "") ? saisieNote.trim() : undefined;
    setFeuille(null);
    void executer("modifier", async () => {
      await client.modifierReservation(idServeur, {
        dateArrivee: dateArrivee ?? undefined,
        dateDepart: dateDepart ?? undefined,
        acompte,
        note: noteModifiee,
      });
      recharger();
    });
  }

  /** Réponse visible par le client sur sa page « Ma réservation » — la voix
   * de l'hôtel (ex. « acompte attendu à l'arrivée »). Fonctionne hors ligne. */
  function repondre() {
    if (!reservation) return;
    const texte = saisieReponse.trim();
    setFeuille(null);
    void executer("repondre", async () => {
      await client.modifierReservation(idServeur, { reponseReception: texte });
      recharger();
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
      await imprimerLignes(construireRecuFacture(facture, reservationComplete, utilisateur.nom, ventes, enteteHotel(utilisateur), { duplicata: true }));
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnCours(null);
    }
  }

  /** Message WhatsApp pré-rempli, adapté au statut : pour une demande EN
   * ATTENTE on « accuse réception » pour ouvrir la discussion avant de
   * confirmer ; ensuite c'est la vraie confirmation avec montants. */
  /** Lien « Ma réservation » du client — null tant que la réservation n'est
   * pas synchronisée (le jeton vient du serveur) ou si le profil en cache
   * date d'avant cette fonctionnalité (hotelUrlSite absent). */
  const lienClient =
    reservation?.jetonSuivi && utilisateur.hotelUrlSite ? lienSuivi(utilisateur.hotelUrlSite, reservation.jetonSuivi) : null;
  const suiviModifiable = reservation?.statut === "EN_ATTENTE" || reservation?.statut === "CONFIRMEE";

  function partagerLien() {
    if (!lienClient || !reservation) return;
    Share.share({
      message: `Suivez votre réservation et pré-enregistrez-vous avant votre arrivée : ${lienClient}`,
    }).catch(() => setErreur("Partage impossible sur cet appareil."));
  }

  function construireMessageWhatsApp(): string {
    if (!reservation) return "";
    const nuitsCalc = Math.max(
      1,
      Math.round((new Date(reservation.dateDepart).getTime() - new Date(reservation.dateArrivee).getTime()) / 86400000)
    );
    const total = Number(reservation.chambre.prixParNuit) * nuitsCalc;
    const lignes: (string | null)[] =
      reservation.statut === "EN_ATTENTE"
        ? [
            utilisateur.hotelNom,
            ``,
            `Bonjour ${reservation.client.nom}, nous avons bien reçu votre demande de réservation :`,
            `Chambre ${reservation.chambre.numero} (${reservation.chambre.type}) — du ${dateCourte(reservation.dateArrivee)} au ${dateCourte(reservation.dateDepart)}, ${nuitsCalc} nuit${nuitsCalc > 1 ? "s" : ""}`,
            `Total estimé : ${formatMontant(total, reservation.chambre.devise)}`,
            `Nous souhaitons échanger avec vous avant de confirmer votre réservation. Merci de nous répondre ici.`,
            lienClient ? `Suivez votre demande ici : ${lienClient}` : null,
            ``,
            `Cordialement, la réception`,
          ]
        : [
            utilisateur.hotelNom,
            ``,
            `Confirmation de réservation`,
            `Client : ${reservation.client.nom}`,
            `Chambre ${reservation.chambre.numero} (${reservation.chambre.type})`,
            `Du ${dateCourte(reservation.dateArrivee)} au ${dateCourte(reservation.dateDepart)} — ${nuitsCalc} nuit${nuitsCalc > 1 ? "s" : ""}`,
            `Total : ${formatMontant(total, reservation.chambre.devise)}`,
            Number(reservation.acompte) > 0
              ? `Acompte reçu : ${formatMontant(reservation.acompte, reservation.chambre.devise)} · Reste : ${formatMontant(Math.max(0, total - Number(reservation.acompte)), reservation.chambre.devise)}`
              : null,
            reservation.note ? `Note : ${reservation.note}` : null,
            lienClient && suiviModifiable ? `Gagnez du temps à l'arrivée, pré-enregistrez-vous ici : ${lienClient}` : null,
            ``,
            `À bientôt !`,
          ];
    return lignes.filter((l): l is string => l !== null).join("\n");
  }

  /** Ouvre la feuille d'édition du message avant l'envoi vers WhatsApp. */
  function ouvrirWhatsApp() {
    if (!reservation) return;
    setMessageWhatsApp(construireMessageWhatsApp());
    setFeuille("whatsapp");
  }

  /** Envoie le texte (tel qu'édité) vers WhatsApp — le téléphone du client
   * s'il existe, sinon le choix du contact (wa.me exige un numéro). */
  function envoyerWhatsApp() {
    if (!reservation) return;
    const numerique = (reservation.client.telephone ?? "").replace(/\D/g, "");
    const texte = encodeURIComponent(messageWhatsApp);
    const url = numerique ? `https://wa.me/${numerique}?text=${texte}` : `whatsapp://send?text=${texte}`;
    setFeuille(null);
    Linking.openURL(url).catch(() => setErreur("WhatsApp n'est pas installé sur cet appareil."));
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
            {reservation.note && <Text style={styles.note}>Note : {reservation.note}</Text>}
            {statut === "ANNULEE" && reservation.motifAnnulation && (
              <Text style={styles.ligneSecondaire}>Motif d'annulation : {reservation.motifAnnulation}</Text>
            )}
            {enAttente && (
              <Text style={styles.horsLigne}>Créée sur cet appareil — en attente de synchronisation.</Text>
            )}
          </View>

          <View style={styles.carte}>
            <Text style={styles.titre}>Client</Text>
            <Text style={styles.ligne}>{reservation.client.nom}</Text>
            {reservation.client.telephone && <Text style={styles.ligneSecondaire}>{reservation.client.telephone}</Text>}
            {reservation.client.email && <Text style={styles.ligneSecondaire}>{reservation.client.email}</Text>}
            {(reservation.client.typePiece || reservation.client.numeroPiece) && (
              <Text style={styles.ligneSecondaire}>
                Pièce : {[reservation.client.typePiece, reservation.client.numeroPiece].filter(Boolean).join(" · ")}
              </Text>
            )}
            <Pressable style={styles.whatsapp} onPress={ouvrirWhatsApp} accessibilityRole="button">
              <MessageCircle size={16} color="#1FA855" />
              <Text style={styles.whatsappTexte}>Contacter le client par WhatsApp</Text>
            </Pressable>
          </View>

          <View style={styles.carte}>
            <View style={styles.ligneEntete}>
              <Text style={styles.titre}>Suivi en ligne</Text>
              {reservation.jetonSuivi && <Text style={styles.ligneSecondaire}>{codeSuivi(reservation.jetonSuivi)}</Text>}
            </View>
            {reservation.preEnregistreLe ? (
              <>
                <Text style={styles.preEnregistre}>
                  ✓ Pré-enregistré le {dateCourte(reservation.preEnregistreLe)}
                  {reservation.heureArriveePrevue ? ` · arrivée vers ${reservation.heureArriveePrevue}` : ""}
                </Text>
                {reservation.demandeClient && <Text style={styles.note}>Demande du client : {reservation.demandeClient}</Text>}
              </>
            ) : (
              <Text style={styles.ligneSecondaire}>
                {suiviModifiable ? "Pas encore pré-enregistré — envoyez-lui le lien." : "Pas de pré-enregistrement."}
              </Text>
            )}
            {reservation.reponseReception && (
              <Text style={styles.note}>Votre réponse au client : {reservation.reponseReception}</Text>
            )}
            {suiviModifiable && (
              <Pressable
                style={styles.whatsapp}
                onPress={() => {
                  setSaisieReponse(reservation.reponseReception ?? "");
                  setErreur(null);
                  setFeuille("reponse");
                }}
                accessibilityRole="button"
              >
                <Pencil size={16} color={couleurs.bleu} />
                <Text style={[styles.whatsappTexte, { color: couleurs.bleu }]}>
                  {reservation.reponseReception ? "Modifier votre réponse" : "Répondre au client"}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.whatsapp, !lienClient && styles.boutonInactif]}
              onPress={partagerLien}
              disabled={!lienClient}
              accessibilityRole="button"
            >
              <Link2 size={16} color={couleurs.bleu} />
              <Text style={[styles.whatsappTexte, { color: couleurs.bleu }]}>
                {lienClient ? "Partager le lien de suivi" : "Lien disponible après synchronisation"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            {peutOperer(utilisateur) && statut === "EN_ATTENTE" &&
              bouton("confirmer", "Confirmer la demande", confirmer, true)}
            {peutOperer(utilisateur) && statut === "CONFIRMEE" &&
              bouton("checkin", "Check-in", checkIn, true)}
            {peutOperer(utilisateur) && (statut === "CONFIRMEE" || statut === "EN_COURS") &&
              bouton(
                "modifier",
                "Modifier dates / acompte",
                () => {
                  setSaisieArrivee(saisieDepuisIso(reservation.dateArrivee));
                  setSaisieDepart(saisieDepuisIso(reservation.dateDepart));
                  setSaisieAcompte(reservation.acompte !== "0" ? String(reservation.acompte) : "");
                  setSaisieNote(reservation.note ?? "");
                  setErreur(null);
                  setFeuille("modifier");
                },
                true,
                true
              )}
            {peutOperer(utilisateur) && statut === "EN_COURS" &&
              bouton("facturer", "Facturer et check-out", () => onFacturer(idServeur), true)}
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
                true,
                true
              )}
            {statut === "TERMINEE" &&
              bouton("impression", "Réimprimer le reçu", reimprimerRecu, true, true)}
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
        <SelecteurDate
          valeur={isoDepuisSaisie(saisieArrivee)?.slice(0, 10) ?? ""}
          onChange={(iso) => setSaisieArrivee(iso ? saisieDepuisIso(iso) : "")}
        />
        <Text style={styles.champLabel}>Départ (JJ/MM/AAAA)</Text>
        <SelecteurDate
          valeur={isoDepuisSaisie(saisieDepart)?.slice(0, 10) ?? ""}
          onChange={(iso) => setSaisieDepart(iso ? saisieDepuisIso(iso) : "")}
        />
        <Text style={styles.champLabel}>Acompte ({reservation?.chambre.devise})</Text>
        <TextInput style={styles.champ} value={saisieAcompte} onChangeText={setSaisieAcompte} placeholder="0" placeholderTextColor={couleurs.encreFaible} keyboardType="numeric" />
        <Text style={styles.champLabel}>Demandes spéciales</Text>
        <TextInput
          style={styles.champ}
          value={saisieNote}
          onChangeText={setSaisieNote}
          placeholder="Lit bébé, étage élevé…"
          placeholderTextColor={couleurs.encreFaible}
          multiline
        />
        <Pressable style={styles.bouton} onPress={modifier}>
          <Text style={styles.boutonTexte}>Enregistrer</Text>
        </Pressable>
      </FeuilleModale>

      <FeuilleModale visible={feuille === "whatsapp"} onFermer={() => setFeuille(null)} titre="Message WhatsApp">
        <Text style={styles.champLabel}>Message au client (modifiable)</Text>
        <TextInput
          style={styles.champMultiligne}
          value={messageWhatsApp}
          onChangeText={setMessageWhatsApp}
          placeholder="Votre message…"
          placeholderTextColor={couleurs.encreFaible}
          multiline
        />
        <Pressable style={styles.boutonWhatsApp} onPress={envoyerWhatsApp} accessibilityRole="button">
          <MessageCircle size={16} color="#fff" />
          <Text style={styles.boutonTexte}>Ouvrir WhatsApp</Text>
        </Pressable>
        <Pressable style={styles.boutonSecondaire} onPress={() => setMessageWhatsApp(construireMessageWhatsApp())}>
          <Text style={styles.boutonSecondaireTexte}>Réinitialiser le texte</Text>
        </Pressable>
      </FeuilleModale>

      <FeuilleModale visible={feuille === "reponse"} onFermer={() => setFeuille(null)} titre="Répondre au client">
        <Text style={styles.champLabel}>Message visible sur la page de suivi du client</Text>
        <TextInput
          style={styles.champMultiligne}
          value={saisieReponse}
          onChangeText={setSaisieReponse}
          placeholder="Ex. Demande bien reçue — acompte de 30 $ attendu à l'arrivée."
          placeholderTextColor={couleurs.encreFaible}
          multiline
        />
        <Pressable style={styles.bouton} onPress={repondre}>
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
  note: { fontSize: 13, color: couleurs.violet, fontStyle: "italic", marginTop: 2 },
  preEnregistre: { fontSize: 14, fontWeight: "600", color: couleurs.succes },
  whatsapp: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    marginTop: espacements.s2,
    minHeight: 36,
  },
  whatsappTexte: { fontSize: 14, fontWeight: "600", color: "#1FA855" },
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
  champMultiligne: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    paddingVertical: espacements.s2,
    minHeight: 160,
    fontSize: 14,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
    textAlignVertical: "top",
  },
  boutonWhatsApp: {
    height: 48,
    borderRadius: rayons.sm,
    backgroundColor: "#1FA855",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    marginTop: espacements.s2,
  },
});
