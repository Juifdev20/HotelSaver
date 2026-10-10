import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { Devise, Facture, ModePaiement, Reservation, VenteCafeteria, peutOperer } from "@hotel-chicago/types";
import type { TauxChange } from "@hotel-chicago/api-client";
import { construireRecuFacture, enteteHotel } from "@hotel-chicago/receipts";
import { estRecuProvisoire } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { imprimerLignes } from "../impression/imprimante";
import { lireMontant } from "@hotel-chicago/regles";

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
 * Facturer et check-out un séjour EN_COURS (section 11.2), paiement croisé
 * inclus (section 9.4) : une facture libellée en USD peut être réglée en
 * CDF ou inversement — l'écran affiche le montant remis, le taux appliqué
 * et la monnaie à rendre avant l'envoi. Borne serveur : une facture MIXTE
 * (chambre + cafétaria dans deux devises différentes) ne peut pas être
 * réglée en croisé — affiché comme tel. Le vrai montant facturé et la
 * monnaie restent calculés côté serveur (encaissement.util.ts) ; ici c'est
 * une prévisualisation fidèle.
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

  // Paiement croisé (section 9.4) : devise remise, montant remis, devise du rendu.
  const [taux, setTaux] = useState<TauxChange | null>(null);
  const [deviseReglee, setDeviseReglee] = useState<Devise>(Devise.USD);
  const [montantRegle, setMontantRegle] = useState("");
  const [deviseRendu, setDeviseRendu] = useState<Devise>(Devise.USD);

  useEffect(() => {
    Promise.all([client.obtenirReservation(reservationId), client.listerVentesCafeteria(reservationId), client.tauxActuel()])
      .then(([r, ventes, t]) => {
        setReservation(r);
        setVentesLiees(ventes.filter((v) => !v.annuleLe));
        setTaux(t);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [reservationId, client]);

  const apercu = useMemo(() => (reservation ? calculerApercu(reservation, ventesLiees) : null), [reservation, ventesLiees]);

  // Facture mixte (chambre USD + cafétaria CDF, ou l'inverse) : le serveur
  // refuse tout paiement croisé — le règlement se fait forcément en deux
  // montants, le bloc de détail n'est pas affiché.
  const factureMixte = apercu ? apercu.totalUSD > 0 && apercu.totalCDF > 0 : false;
  const deviseDue: Devise | null = apercu ? (apercu.totalUSD > 0 ? Devise.USD : apercu.totalCDF > 0 ? Devise.CDF : null) : null;
  const cdfParUsd = taux ? Number(taux.cdfParUsd) : undefined;
  const regleLu = montantRegle.trim() === "" ? null : lireMontant(montantRegle, deviseReglee, { max: 1_000_000_000 });
  const regle = regleLu && regleLu.ok ? regleLu.valeur : NaN;
  const detailSaisi = regleLu !== null && regleLu.ok;
  const erreurMontantRegle = regleLu && !regleLu.ok ? regleLu.message : null;

  /** Prévisualisation de la monnaie — même règles que
   * apps/api/src/factures/encaissement.util.ts (calcul de référence
   * côté serveur). */
  const apercuMonnaie = useMemo(() => {
    if (!apercu || !deviseDue || !detailSaisi || factureMixte) return null;
    const du = deviseDue === Devise.USD ? apercu.totalUSD : apercu.totalCDF;
    const croise = deviseReglee !== deviseDue;
    if (croise && !cdfParUsd) return { statut: "taux-manquant" as const };
    const duReglee = croise ? (deviseDue === Devise.USD ? du * cdfParUsd! : du / cdfParUsd!) : du;
    const reste = regle - duReglee;
    if (reste < -0.005) return { statut: "insuffisant" as const, duReglee, croise };
    const monnaieReglee = Math.max(0, reste);
    const monnaieRendue =
      deviseRendu === deviseReglee
        ? monnaieReglee
        : deviseReglee === Devise.USD
          ? monnaieReglee * cdfParUsd!
          : monnaieReglee / cdfParUsd!;
    return {
      statut: "ok" as const,
      duReglee,
      croise,
      monnaie: deviseRendu === Devise.CDF ? Math.round(monnaieRendue) : Math.round(monnaieRendue * 100) / 100,
      deviseMonnaie: deviseRendu,
    };
  }, [apercu, deviseDue, deviseReglee, deviseRendu, detailSaisi, regle, cdfParUsd, factureMixte]);

  const bloquerPaiement =
    erreurMontantRegle !== null || ((detailSaisi && (apercuMonnaie?.statut === "insuffisant" || apercuMonnaie?.statut === "taux-manquant")) ?? false);

  async function facturerEtCheckOut() {
    setEnCours(true);
    setErreur(null);
    try {
      const facture = await client.creerFacture({
        reservationId,
        modePaiement,
        ...(detailSaisi
          ? { deviseRegleeParClient: deviseReglee, montantRegleParClient: regle, deviseRenduChoisie: deviseRendu }
          : {}),
      });
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
      await imprimerLignes(construireRecuFacture(factureCreee, reservation, utilisateur.nom, ventesLiees, enteteHotel(utilisateur)));
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
          {estRecuProvisoire(factureCreee.numeroRecu) && (
            <Text style={styles.avertissement}>
              Reçu provisoire : le numéro définitif sera attribué à la synchronisation (le reçu reste valable).
            </Text>
          )}
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
        <ConteneurFormulaire styleContenu={styles.contenu}>
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

          {factureMixte && (
            <Text style={styles.noteMixte}>
              Facture en deux devises : le règlement croisé n'est pas possible —
              encaisser les montants USD et CDF séparément.
            </Text>
          )}

          {!factureMixte && deviseDue && (
            <View style={styles.carte}>
              <Text style={styles.champLabel}>Détail du règlement (optionnel)</Text>
              <Text style={styles.sousLabel}>Devise remise par le client</Text>
              <View style={styles.selecteurMode}>
                {[Devise.USD, Devise.CDF].map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.optionMode, deviseReglee === d && styles.optionModeActive]}
                    onPress={() => setDeviseReglee(d)}
                  >
                    <Text style={[styles.optionModeTexte, deviseReglee === d && styles.optionModeTexteActif]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
              {deviseReglee !== deviseDue && (
                <Text style={styles.equivalence}>
                  {taux
                    ? `Dû : ${formatMontant(
                        deviseDue === Devise.USD ? apercu.totalUSD * cdfParUsd! : apercu.totalCDF / cdfParUsd!,
                        deviseReglee
                      )} (1 $ = ${formatMontant(cdfParUsd!, Devise.CDF)})`
                    : "Aucun taux de change défini par le patron — paiement croisé impossible."}
                </Text>
              )}
              <Text style={styles.sousLabel}>Montant remis</Text>
              <TextInput
                style={styles.champ}
                value={montantRegle}
                onChangeText={setMontantRegle}
                placeholder={`Ex. ${deviseReglee === Devise.USD ? "100.00" : "280 000"}`}
                placeholderTextColor={couleurs.encreFaible}
                keyboardType="numeric"
              />
              {erreurMontantRegle && <Text style={styles.avertissement}>{erreurMontantRegle}</Text>}
              {detailSaisi && (
                <>
                  <Text style={styles.sousLabel}>Rendre la monnaie en</Text>
                  <View style={styles.selecteurMode}>
                    {[Devise.USD, Devise.CDF].map((d) => (
                      <Pressable
                        key={d}
                        style={[styles.optionMode, deviseRendu === d && styles.optionModeActive]}
                        onPress={() => setDeviseRendu(d)}
                      >
                        <Text style={[styles.optionModeTexte, deviseRendu === d && styles.optionModeTexteActif]}>{d}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              {apercuMonnaie?.statut === "insuffisant" && (
                <Text style={styles.erreurBloc}>
                  Montant insuffisant : il faut {formatMontant(apercuMonnaie.duReglee, deviseReglee)}.
                </Text>
              )}
              {apercuMonnaie?.statut === "taux-manquant" && (
                <Text style={styles.erreurBloc}>Aucun taux de change défini par le patron.</Text>
              )}
              {apercuMonnaie?.statut === "ok" && (
                <Text style={styles.monnaie}>
                  Monnaie à rendre : {formatMontant(apercuMonnaie.monnaie, apercuMonnaie.deviseMonnaie)}
                </Text>
              )}
            </View>
          )}

          {peutOperer(utilisateur) ? (
            <Pressable style={[styles.bouton, bloquerPaiement && styles.boutonInactif]} onPress={facturerEtCheckOut} disabled={enCours || bloquerPaiement}>
              <Text style={styles.boutonTexte}>{enCours ? "…" : "Facturer et check-out"}</Text>
            </Pressable>
          ) : (
            <Text style={styles.monnaie}>Lecture seule — la facturation est réservée au personnel de la réception.</Text>
          )}
        </ConteneurFormulaire>
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
  boutonInactif: { opacity: 0.45 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sousLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s3 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  equivalence: { fontSize: 12, color: couleurs.bleu, marginTop: espacements.s2 },
  noteMixte: { fontSize: 13, color: couleurs.alerte },
  erreurBloc: { fontSize: 13, color: couleurs.danger, marginTop: espacements.s2 },
  monnaie: { fontSize: 14, fontWeight: "700", color: couleurs.succes, marginTop: espacements.s2 },
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
