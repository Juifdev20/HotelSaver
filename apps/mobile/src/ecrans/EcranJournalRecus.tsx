import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { Devise, Facture, Role, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuFacture, construireRecuVente, enteteHotel } from "@hotel-chicago/receipts";
import { ReceiptText } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { useSession } from "../contexteSession";
import { imprimerLignes } from "../impression/imprimante";
import { estRecuProvisoire } from "@hotel-chicago/regles";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { dateComplete, heureCourte } from "../dates";

export interface EcranJournalRecusProps {
  onRetour: () => void;
}

type Segment = "sejours" | "cafeteria";

/** « JJ/MM/AAAA HH:MM » à l'heure de Lubumbashi. */
function dateCourte(iso: string): string {
  return `${dateComplete(iso)} ${heureCourte(iso)}`;
}

/** Reçu créé hors ligne : son numéro définitif n'existe pas encore (voir recu-provisoire.ts). */
function BadgeProvisoire() {
  return (
    <View style={styles.badgeProvisoire} accessible accessibilityLabel="Reçu provisoire : numéro définitif attribué à la synchronisation">
      <Text style={styles.badgeProvisoireTexte}>Provisoire</Text>
    </View>
  );
}

function libelleMode(mode: string): string {
  return mode === "CASH" ? "Espèces" : mode === "MOBILE_MONEY" ? "Mobile money" : mode;
}

/** Montants affichés côte à côte (une ligne peut être dans une seule devise). */
function montants(usd: string, cdf: string): string {
  const parties: string[] = [];
  if (Number(usd) > 0) parties.push(formatMontant(usd, Devise.USD));
  if (Number(cdf) > 0) parties.push(formatMontant(cdf, Devise.CDF));
  return parties.length ? parties.join(" + ") : "0";
}

/** Détail du règlement commun à Facture et VenteCafeteria — mêmes champs
 * (devise remise, montant remis, taux, monnaie rendue, motif). */
function DetailPaiement({ recu }: { recu: Facture | VenteCafeteria }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.ligneDetail}>Mode : {libelleMode(recu.modePaiement)}</Text>
      {recu.deviseRegleeParClient && recu.montantRegleParClient && (
        <Text style={styles.ligneDetail}>
          Montant remis : {formatMontant(recu.montantRegleParClient, recu.deviseRegleeParClient)}
        </Text>
      )}
      {recu.tauxChangeApplique && (
        <Text style={styles.ligneDetail}>
          Taux appliqué : 1 $ = {formatMontant(recu.tauxChangeApplique, Devise.CDF)}
        </Text>
      )}
      {recu.deviseMonnaieRendue && recu.montantMonnaieRendue && (
        <Text style={styles.ligneDetail}>
          Monnaie rendue : {formatMontant(recu.montantMonnaieRendue, recu.deviseMonnaieRendue)}
        </Text>
      )}
      <Text style={styles.ligneDetail}>Encaissé le {dateCourte(recu.createdAt)}</Text>
      {recu.imprimeLe && <Text style={styles.ligneDetail}>Imprimé le {dateCourte(recu.imprimeLe)}</Text>}
      {recu.annuleLe && (
        <Text style={styles.annule}>
          Annulé le {dateCourte(recu.annuleLe)}
          {recu.motifAnnulation ? ` — ${recu.motifAnnulation}` : ""}
        </Text>
      )}
    </View>
  );
}

/**
 * Journal des reçus (Phase 16, retour terrain) : retrouver un paiement
 * encaissé, voir son détail complet (montant remis, devise, taux, monnaie
 * rendue) et le réimprimer — côté réception (factures de séjour) comme côté
 * cafétaria (ventes). PATRON voit les deux segments et peut annuler une
 * pièce avec motif ; RECEPTIONNISTE n'a que Séjours, CAFETARIA que
 * Cafétaria (matrice 9.3 : l'API liste `ventes` refuserait un filtre vide à
 * la réception, et le module cafétaria reste fermé à ce rôle).
 * Lu dans la base locale (reçus provisoires TEMP-… inclus) ; l'annulation d'un reçu exige la connexion.
 */
export function EcranJournalRecus({ onRetour }: EcranJournalRecusProps) {
  const { client, utilisateur } = useSession();
  const estPatron = utilisateur.role === Role.PATRON;
  const segments: Segment[] =
    utilisateur.role === Role.PATRON ? ["sejours", "cafeteria"] : utilisateur.role === Role.CAFETARIA ? ["cafeteria"] : ["sejours"];

  const [segment, setSegment] = useState<Segment>(segments[0]);
  const [factures, setFactures] = useState<Facture[] | null>(null);
  const [ventes, setVentes] = useState<VenteCafeteria[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  // Feuille de détail : la facture ou la vente ouverte, jamais les deux.
  const [detailFacture, setDetailFacture] = useState<Facture | null>(null);
  const [detailVente, setDetailVente] = useState<VenteCafeteria | null>(null);
  const [motifAnnulation, setMotifAnnulation] = useState("");
  const [enAction, setEnAction] = useState(false);
  const [message, setMessage] = useState<{ texte: string; reussi: boolean } | null>(null);

  const charger = useCallback(() => {
    const requete = segment === "sejours" ? client.listerFactures() : client.listerVentesCafeteria();
    requete
      .then((liste) => {
        const triees = [...liste].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (segment === "sejours") setFactures(triees as Facture[]);
        else setVentes(triees as VenteCafeteria[]);
        setErreur(null);
      })
      .catch((e: unknown) => setErreur(messageErreur(e, "Impossible de charger les reçus. Réessayez.")));
  }, [client, segment]);

  useEffect(charger, [charger]);

  function actualiser() {
    setRafraichissement(true);
    charger();
    setRafraichissement(false);
  }

  async function reimprimerFacture(facture: Facture) {
    setEnAction(true);
    setMessage(null);
    try {
      const [reservation, ventesLiees] = await Promise.all([
        client.obtenirReservation(facture.reservationId),
        client.listerVentesCafeteria(facture.reservationId),
      ]);
      await imprimerLignes(construireRecuFacture(facture, reservation, utilisateur.nom, ventesLiees, enteteHotel(utilisateur), { duplicata: true }));
      // Atteint seulement si l'envoi a réussi.
      setMessage({ texte: `Reçu ${facture.numeroRecu} envoyé à l'imprimante.`, reussi: true });
    } catch (e) {
      setMessage({ texte: `Impression impossible : ${messageErreur(e, "l'imprimante n'a pas répondu.")}`, reussi: false });
    } finally {
      setEnAction(false);
    }
  }

  async function reimprimerVente(vente: VenteCafeteria) {
    setEnAction(true);
    setMessage(null);
    try {
      const compte = await client.obtenirCompteCafeteria(vente.compteId);
      await imprimerLignes(construireRecuVente(vente, compte, utilisateur.nom, enteteHotel(utilisateur), { duplicata: true }));
      setMessage({ texte: `Reçu ${vente.numeroRecu} envoyé à l'imprimante.`, reussi: true });
    } catch (e) {
      setMessage({ texte: `Impression impossible : ${messageErreur(e, "l'imprimante n'a pas répondu.")}`, reussi: false });
    } finally {
      setEnAction(false);
    }
  }

  /** Vérifie le motif puis demande confirmation : annuler un paiement ne se défait pas (retour U3). */
  function demanderAnnulation() {
    const piece = detailFacture ?? detailVente;
    if (!piece) return;
    if (!motifAnnulation.trim()) {
      setMessage({ texte: "Le motif d'annulation est obligatoire.", reussi: false });
      return;
    }
    confirmerAction({
      titre: `Annuler le reçu ${piece.numeroRecu} ?`,
      message: `${segment === "sejours" ? "Facture de séjour" : "Vente cafétaria"} de ${montants(piece.montantTotalUSD, piece.montantTotalCDF)}.\nMotif : ${motifAnnulation.trim()}\n\nL'annulation est définitive.`,
      libelleConfirmer: "Annuler le reçu",
      libelleRefuser: "Non, garder le reçu",
      destructif: true,
      onConfirmer: annuler,
    });
  }

  async function annuler() {
    const piece = detailFacture ?? detailVente;
    if (!piece || enAction) return;
    setEnAction(true);
    setMessage(null);
    try {
      if (detailFacture) await client.annulerFacture(detailFacture.id, motifAnnulation.trim());
      else if (detailVente) await client.annulerVenteCafeteria(detailVente.id, motifAnnulation.trim());
      setDetailFacture(null);
      setDetailVente(null);
      setMotifAnnulation("");
      charger();
    } catch (e) {
      setMessage({ texte: messageErreur(e, "L'annulation a échoué. Réessayez."), reussi: false });
    } finally {
      setEnAction(false);
    }
  }

  function ouvrirDetail(piece: Facture | VenteCafeteria) {
    setMotifAnnulation("");
    setMessage(null);
    if (segment === "sejours") setDetailFacture(piece as Facture);
    else setDetailVente(piece as VenteCafeteria);
  }

  function fermerDetail() {
    setDetailFacture(null);
    setDetailVente(null);
  }

  const liste: Array<Facture | VenteCafeteria> = (segment === "sejours" ? factures : ventes) ?? [];
  const pieceOuverte = detailFacture ?? detailVente;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Journal des reçus" sousTitre="Paiements encaissés — détail et réimpression." onRetour={onRetour} />

      {segments.length > 1 && (
        <View style={styles.segments}>
          {segments.map((s) => (
            <Pressable
              key={s}
              style={[styles.segment, segment === s && styles.segmentActif]}
              onPress={() => {
                setSegment(s);
                setErreur(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === s }}
            >
              <Text style={[styles.segmentTexte, segment === s && styles.segmentTexteActif]}>
                {s === "sejours" ? "Séjours" : "Cafétaria"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {erreur && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}

      {liste.length === 0 && !erreur && (
        <View style={styles.videConteneur}>
          <ReceiptText size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun reçu encaissé pour le moment.</Text>
        </View>
      )}

      <FlatList
        data={liste}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.carte}
            onPress={() => ouvrirDetail(item)}
            accessibilityRole="button"
            accessibilityLabel={`Reçu ${item.numeroRecu}${estRecuProvisoire(item.numeroRecu) ? ", provisoire" : ""}, ${montants(item.montantTotalUSD, item.montantTotalCDF)}, ${item.annuleLe ? "annulé" : "réglé"}`}
          >
            <View style={styles.carteEntete}>
              <Text style={styles.numeroRecu}>{item.numeroRecu}</Text>
              <View style={styles.badges}>
                {estRecuProvisoire(item.numeroRecu) && <BadgeProvisoire />}
                {item.annuleLe ? <Text style={styles.badgeAnnule}>Annulé</Text> : <Text style={styles.badgeRegle}>Réglé</Text>}
              </View>
            </View>
            <Text style={styles.date}>{dateCourte(item.createdAt)}</Text>
            <Text style={styles.montant}>{montants(item.montantTotalUSD, item.montantTotalCDF)}</Text>
          </Pressable>
        )}
      />

      <FeuilleModale
        visible={pieceOuverte !== null}
        onFermer={fermerDetail}
        titre={pieceOuverte ? `Reçu ${pieceOuverte.numeroRecu}` : "Reçu"}
        modifie={motifAnnulation.trim() !== ""}
        enCours={enAction}
      >
        {pieceOuverte && (
          <>
            {estRecuProvisoire(pieceOuverte.numeroRecu) && (
              <View style={styles.badges}>
                <BadgeProvisoire />
                <Text style={styles.ligneDetail}>Numéro définitif attribué à la synchronisation.</Text>
              </View>
            )}
            <Text style={styles.totalDetail}>{montants(pieceOuverte.montantTotalUSD, pieceOuverte.montantTotalCDF)}</Text>
            <DetailPaiement recu={pieceOuverte} />

            {message && (
              <Text
                style={[styles.message, !message.reussi && styles.messageErreur]}
                accessibilityRole={message.reussi ? undefined : "alert"}
                accessibilityLiveRegion="polite"
              >
                {message.texte}
              </Text>
            )}

            <Pressable
              style={styles.boutonSecondaire}
              disabled={enAction}
              onPress={() => (detailFacture ? reimprimerFacture(detailFacture) : detailVente && reimprimerVente(detailVente))}
              accessibilityRole="button"
              accessibilityState={{ disabled: enAction, busy: enAction }}
            >
              <Text style={styles.boutonSecondaireTexte}>{enAction ? "…" : "Réimprimer le reçu"}</Text>
            </Pressable>

            {estPatron && !pieceOuverte.annuleLe && (
              <>
                <Text style={styles.label}>Motif d'annulation (obligatoire)</Text>
                <TextInput
                  style={styles.champ}
                  value={motifAnnulation}
                  onChangeText={setMotifAnnulation}
                  placeholder="Ex. paiement encaissé en double"
                  placeholderTextColor={couleurs.encreFaible}
                  accessibilityLabel="Motif d'annulation (obligatoire)"
                />
                <Pressable
                  style={styles.boutonDanger}
                  onPress={demanderAnnulation}
                  disabled={enAction}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: enAction, busy: enAction }}
                >
                  <Text style={styles.boutonTexte}>{enAction ? "…" : "Annuler ce reçu"}</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  segments: { flexDirection: "row", gap: espacements.s2, paddingHorizontal: espacements.s4, paddingTop: espacements.s2 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface200,
  },
  segmentActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  segmentTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  segmentTexteActif: { color: "#fff" },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  liste: { padding: espacements.s4, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 2,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  numeroRecu: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  badges: { flexDirection: "row", alignItems: "center", gap: espacements.s2, flexShrink: 1, flexWrap: "wrap" },
  badgeProvisoire: { backgroundColor: couleurs.alerteClair, borderWidth: 1, borderColor: couleurs.alerte, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 1 },
  badgeProvisoireTexte: { fontSize: 11, fontWeight: "700", color: couleurs.alerte },
  badgeRegle: { fontSize: 11, fontWeight: "700", color: couleurs.succes },
  badgeAnnule: { fontSize: 11, fontWeight: "700", color: couleurs.danger },
  date: { fontSize: 12, color: couleurs.encreAttenuee },
  montant: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  totalDetail: { fontSize: 20, fontWeight: "800", color: couleurs.navy, marginBottom: espacements.s2 },
  ligneDetail: { fontSize: 13, color: couleurs.encre },
  annule: { fontSize: 13, fontWeight: "600", color: couleurs.danger, marginTop: espacements.s1 },
  message: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: espacements.s3 },
  messageErreur: { color: couleurs.danger },
  boutonSecondaire: {
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s3,
  },
  boutonSecondaireTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
  boutonDanger: {
    minHeight: 44,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s3,
  },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s4, marginBottom: espacements.s1 },
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
