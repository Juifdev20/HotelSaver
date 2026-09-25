import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Devise, Facture, ModePaiement, Reservation, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuFacture } from "@hotel-chicago/receipts";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { imprimerLignes } from "../impression/imprimante";

export interface EcranFacturationProps {
  reservationId: string;
  onRetour: () => void;
}

function nombreDeNuits(dateArrivee: string, dateDepart: string): number {
  const millisecondesParJour = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.round((new Date(dateDepart).getTime() - new Date(dateArrivee).getTime()) / millisecondesParJour));
}

/** Même calcul que factures.service.ts::create — juste pour prévisualiser le
 * total avant d'envoyer, la vraie valeur facturée reste toujours celle
 * calculée côté serveur. */
function calculerApercu(reservation: Reservation, ventesLiees: VenteCafeteria[]) {
  const nuits = nombreDeNuits(reservation.dateArrivee, reservation.dateDepart);
  const montantChambre = Number(reservation.chambre.prixParNuit) * nuits;
  const montantDu = Math.max(0, montantChambre - Number(reservation.acompte));
  const deviseChambre = reservation.chambre.devise;
  const cafeteriaUSD = ventesLiees.reduce((s, v) => s + Number(v.montantTotalUSD), 0);
  const cafeteriaCDF = ventesLiees.reduce((s, v) => s + Number(v.montantTotalCDF), 0);
  return {
    nuits,
    montantChambre,
    totalUSD: (deviseChambre === Devise.USD ? montantDu : 0) + cafeteriaUSD,
    totalCDF: (deviseChambre === Devise.CDF ? montantDu : 0) + cafeteriaCDF,
  };
}

/**
 * Facturer et check-out un séjour EN_COURS (section 11.2). Pas de paiement
 * croisé/monnaie rendue ici — même simplification que l'encaissement Caisse
 * (`EcranCompteCafeteria.tsx`) : le serveur refuse de toute façon le paiement
 * croisé automatique dès que la facture mélange USD et CDF (chambre +
 * cafétaria dans des devises différentes), voir factures.service.ts.
 * Facturer et check-out sont deux appels indépendants côté API — si le
 * check-out échoue après une facture réussie, rien n'est perdu (la facture
 * existe déjà), juste signalé pour un check-out manuel plus tard.
 */
export function EcranFacturation({ reservationId, onRetour }: EcranFacturationProps) {
  const { client, utilisateur } = useSession();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [ventesLiees, setVentesLiees] = useState<VenteCafeteria[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.CASH);
  const [enCours, setEnCours] = useState(false);
  const [factureCreee, setFactureCreee] = useState<Facture | null>(null);
  const [avertissementCheckOut, setAvertissementCheckOut] = useState<string | null>(null);
  const [enImpression, setEnImpression] = useState(false);
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([client.obtenirReservation(reservationId), client.listerVentesCafeteria(reservationId)])
      .then(([r, ventes]) => {
        setReservation(r);
        setVentesLiees(ventes.filter((v) => !v.annuleLe));
      })
      .catch((e: Error) => setErreur(e.message));
  }, [reservationId, client]);

  const apercu = useMemo(() => (reservation ? calculerApercu(reservation, ventesLiees) : null), [reservation, ventesLiees]);

  async function facturerEtCheckOut() {
    setEnCours(true);
    setErreur(null);
    try {
      const facture = await client.creerFacture({ reservationId, modePaiement });
      setFactureCreee(facture);
      try {
        await client.checkOut(reservationId);
      } catch (e) {
        setAvertissementCheckOut(
          "Facture créée, mais le check-out a échoué : " +
            (e instanceof Error ? e.message : "erreur inconnue") +
            ". La chambre peut être passée en Nettoyage manuellement depuis Chambres."
        );
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  async function imprimerRecu() {
    if (!factureCreee || !reservation) return;
    setEnImpression(true);
    setMessageImpression(null);
    try {
      await imprimerLignes(construireRecuFacture(factureCreee, reservation, utilisateur.nom, ventesLiees));
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnImpression(false);
    }
  }

  if (factureCreee) {
    return (
      <View style={styles.page}>
        <EnteteMobile />
        <EnteteRetour titre="Facture créée" onRetour={onRetour} />
        <View style={styles.contenu}>
          <View style={styles.carteSucces}>
            <Text style={styles.numeroRecu}>{factureCreee.numeroRecu}</Text>
            {Number(factureCreee.montantTotalUSD) > 0 && (
              <Text style={styles.montantTotal}>{formatMontant(factureCreee.montantTotalUSD, Devise.USD)}</Text>
            )}
            {Number(factureCreee.montantTotalCDF) > 0 && (
              <Text style={styles.montantTotal}>{formatMontant(factureCreee.montantTotalCDF, Devise.CDF)}</Text>
            )}
          </View>
          {avertissementCheckOut && <Text style={styles.avertissement}>{avertissementCheckOut}</Text>}
          {messageImpression && <Text style={styles.confirmationImpression}>{messageImpression}</Text>}
          <Pressable style={styles.boutonSecondaireLarge} onPress={imprimerRecu} disabled={enImpression}>
            <Text style={styles.boutonSecondaireLargeTexte}>{enImpression ? "…" : "Imprimer le reçu"}</Text>
          </Pressable>
          <Pressable style={styles.bouton} onPress={onRetour}>
            <Text style={styles.boutonTexte}>Retour aux réservations</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Facturation" onRetour={onRetour} />

      {!reservation && !erreur && <ActivityIndicator style={styles.chargement} color={couleurs.bleu} />}
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {reservation && apercu && (
        <ScrollView contentContainerStyle={styles.contenu}>
          <View style={styles.carte}>
            <Text style={styles.champLabel}>Client</Text>
            <Text style={styles.champValeur}>{reservation.client.nom}</Text>
            <Text style={styles.champLabel}>Chambre</Text>
            <Text style={styles.champValeur}>
              {reservation.chambre.numero} ({reservation.chambre.type})
            </Text>
            <Text style={styles.champLabel}>Séjour</Text>
            <Text style={styles.champValeur}>{apercu.nuits} nuit{apercu.nuits > 1 ? "s" : ""}</Text>
          </View>

          <View style={styles.carte}>
            <View style={styles.ligneMontant}>
              <Text style={styles.libelleMontant}>Prix chambre</Text>
              <Text style={styles.valeurMontant}>{formatMontant(apercu.montantChambre, reservation.chambre.devise)}</Text>
            </View>
            {Number(reservation.acompte) > 0 && (
              <View style={styles.ligneMontant}>
                <Text style={styles.libelleMontant}>Acompte versé</Text>
                <Text style={styles.valeurMontant}>-{formatMontant(reservation.acompte, reservation.chambre.devise)}</Text>
              </View>
            )}
            {ventesLiees.length > 0 && (
              <>
                <Text style={[styles.champLabel, { marginTop: espacements.s2 }]}>Consommations cafétaria liées</Text>
                {ventesLiees.map((v) => (
                  <View key={v.id} style={styles.ligneMontant}>
                    <Text style={styles.libelleMontant}>Reçu {v.numeroRecu}</Text>
                    <Text style={styles.valeurMontant}>
                      {Number(v.montantTotalUSD) > 0 ? formatMontant(v.montantTotalUSD, Devise.USD) : formatMontant(v.montantTotalCDF, Devise.CDF)}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>

          <View style={styles.carteTotal}>
            <Text style={styles.labelTotal}>Total à payer</Text>
            {apercu.totalUSD > 0 && <Text style={styles.montantTotal}>{formatMontant(apercu.totalUSD, Devise.USD)}</Text>}
            {apercu.totalCDF > 0 && <Text style={styles.montantTotal}>{formatMontant(apercu.totalCDF, Devise.CDF)}</Text>}
            {apercu.totalUSD === 0 && apercu.totalCDF === 0 && <Text style={styles.montantTotal}>0</Text>}
          </View>

          <Text style={styles.champLabel}>Mode de paiement</Text>
          <View style={styles.selecteurMode}>
            {[ModePaiement.CASH, ModePaiement.MOBILE_MONEY].map((m) => (
              <Pressable
                key={m}
                style={[styles.optionMode, modePaiement === m && styles.optionModeActive]}
                onPress={() => setModePaiement(m)}
              >
                <Text style={[styles.optionModeTexte, modePaiement === m && styles.optionModeTexteActif]}>
                  {m === ModePaiement.CASH ? "Espèces" : "Mobile money"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.bouton} onPress={facturerEtCheckOut} disabled={enCours}>
            <Text style={styles.boutonTexte}>{enCours ? "…" : "Facturer et check-out"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  chargement: { marginTop: espacements.s6 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 2,
  },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  champValeur: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  ligneMontant: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  libelleMontant: { fontSize: 14, color: couleurs.encre },
  valeurMontant: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  carteTotal: { backgroundColor: couleurs.bleuClair, borderRadius: rayons.lg, padding: espacements.s4, gap: 2 },
  labelTotal: { fontSize: 12, fontWeight: "700", color: couleurs.bleu, textTransform: "uppercase" },
  montantTotal: { fontSize: 20, fontWeight: "800", color: couleurs.navy },
  selecteurMode: { flexDirection: "row", gap: espacements.s2 },
  optionMode: {
    flex: 1,
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  optionModeActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  optionModeTexte: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  optionModeTexteActif: { color: "#fff" },
  bouton: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  carteSucces: { backgroundColor: couleurs.succesClair, borderRadius: rayons.lg, padding: espacements.s5, alignItems: "center", gap: 4 },
  numeroRecu: { fontSize: 16, fontWeight: "700", color: couleurs.succes, marginBottom: espacements.s2 },
  avertissement: { color: couleurs.alerte, fontSize: 13 },
  confirmationImpression: { color: couleurs.succes, fontSize: 13, textAlign: "center" },
  boutonSecondaireLarge: {
    height: 48,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireLargeTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 15 },
});
