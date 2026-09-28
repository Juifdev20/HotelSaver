import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import type { Chambre } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { listerChambresMiroir } from "../stockage/chambresMirroir";
import {
  ClientMiroir,
  ReservationMiroir,
  creerReservationLocale,
  listerClientsMiroir,
  listerReservationsMiroir,
} from "../stockage/reservationsMirroir";

export interface EcranNouvelleReservationProps {
  onRetour: () => void;
  /** Après création (locale ou en ligne) : le hub affiche le détail. */
  onCree: (reservationId: string) => void;
}

const STATUTS_OCCUPANTS = new Set(["CONFIRMEE", "EN_COURS"]); // mêmes que reservations.service.ts

function aujourdhuiSaisie(): string {
  const d = new Date();
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

/** Chevauchement CONFIRMEE/EN_COURS sur le miroir local — même règle que
 * verifierAbsenceDeConflit côté serveur (recalculée là-bas au push, mais
 * prévenir vaut mieux que rattraper un rejet de la file). */
function chambresOccupeesSurPeriode(reservations: ReservationMiroir[], arrivee: string, depart: string): Set<string> {
  const occupees = new Set<string>();
  for (const r of reservations) {
    if (!STATUTS_OCCUPANTS.has(r.statut)) continue;
    if (r.dateArrivee < depart && r.dateDepart > arrivee) occupees.add(r.chambreId);
  }
  return occupees;
}

/**
 * Création d'une réservation — hors ligne : écriture optimiste dans le
 * miroir + file de sync (la confirmation serveur arrive en arrière-plan).
 * « Check-in immédiat » (walk-in du jour) n'est proposé qu'en ligne : le
 * check-in est une action transactionnelle hors de la file générique, il
 * faut l'id serveur tout de suite — la réservation est alors créée en
 * appel direct, pas via la file.
 */
export function EcranNouvelleReservation({ onRetour, onCree }: EcranNouvelleReservationProps) {
  const { client, moteurSync, utilisateur } = useSession();
  const etatSync = useSyncEtat();

  const [saisieArrivee, setSaisieArrivee] = useState(aujourdhuiSaisie());
  const [nuits, setNuits] = useState(1);
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [reservations, setReservations] = useState<ReservationMiroir[]>([]);
  const [clients, setClients] = useState<ClientMiroir[]>([]);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);
  const [modeClient, setModeClient] = useState<"nouveau" | "existant">("nouveau");
  const [clientChoisi, setClientChoisi] = useState<ClientMiroir | null>(null);
  const [rechercheClient, setRechercheClient] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [acompteSaisi, setAcompteSaisi] = useState("");
  const [checkInImmediat, setCheckInImmediat] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    Promise.all([listerChambresMiroir(), listerReservationsMiroir(), listerClientsMiroir()])
      .then(([c, r, cl]) => {
        setChambres(c);
        setReservations(r);
        setClients(cl);
      })
      .catch((e: Error) => setErreur(e.message));
  }, []);

  useEffect(charger, [charger]);

  const dateArrivee = isoDepuisSaisie(saisieArrivee);
  const dateDepart = useMemo(() => {
    if (!dateArrivee) return null;
    const depart = new Date(dateArrivee);
    depart.setDate(depart.getDate() + nuits);
    return depart.toISOString();
  }, [dateArrivee, nuits]);

  const chambresOccupees = useMemo(
    () => (dateArrivee && dateDepart ? chambresOccupeesSurPeriode(reservations, dateArrivee, dateDepart) : new Set<string>()),
    [reservations, dateArrivee, dateDepart]
  );

  // Clients sélectionnables = connus du serveur (remoteId) : un client créé
  // localement mais pas encore synchronisé ne peut pas être référencé dans
  // une nouvelle réservation (le push échouerait, id inconnu du serveur) —
  // on propose alors « Nouveau client » et il naîtra avec cette réservation.
  const clientsSelectionnables = useMemo(() => {
    const terme = rechercheClient.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.remoteId !== null &&
        (!terme || c.nom.toLowerCase().includes(terme) || (c.telephone ?? "").includes(rechercheClient.trim()))
    );
  }, [clients, rechercheClient]);

  const total = chambreChoisie ? Number(chambreChoisie.prixParNuit) * nuits : 0;
  const acompte = acompteSaisi.trim() ? Number(acompteSaisi.replace(/\s/g, "").replace(",", ".")) : 0;

  async function creer() {
    setErreur(null);
    if (!dateArrivee || !dateDepart) {
      setErreur("Date d'arrivée invalide — format JJ/MM/AAAA.");
      return;
    }
    if (!chambreChoisie) {
      setErreur("Choisissez une chambre.");
      return;
    }
    if (Number.isNaN(acompte) || acompte < 0) {
      setErreur("Acompte invalide.");
      return;
    }
    if (modeClient === "existant" && !clientChoisi) {
      setErreur("Choisissez un client existant ou passez en « Nouveau client ».");
      return;
    }
    if (modeClient === "nouveau" && !nom.trim()) {
      setErreur("Le nom du client est obligatoire.");
      return;
    }

    setEnCours(true);
    try {
      const nouveauClient = modeClient === "nouveau" ? { nom: nom.trim(), telephone: telephone.trim() || undefined, email: email.trim() || undefined } : undefined;
      if (checkInImmediat && etatSync.enLigne) {
        // En ligne + check-in immédiat : appel direct (l'id serveur est
        // nécessaire tout de suite pour enchaîner le check-in — la file de
        // sync ne le connaîtrait qu'après le prochain push).
        const creee = await client.creerReservation({
          chambreId: chambreChoisie.id,
          ...(clientChoisi ? { clientId: clientChoisi.remoteId! } : { client: nouveauClient }),
          dateArrivee,
          dateDepart,
          acompte: acompte || undefined,
        });
        try {
          await client.checkIn(creee.id);
        } catch {
          // La réservation existe (CONFIRMEE) — le check-in pourra être
          // refait depuis son détail ; on signale sans faire échouer.
        }
        await moteurSync.forcerSynchronisation();
        onCree(creee.id);
        return;
      }

      const { reservation, payload } = await creerReservationLocale({
        chambre: chambreChoisie,
        dateArrivee,
        dateDepart,
        acompte,
        clientExistant: clientChoisi ?? undefined,
        nouveauClient,
        createdBy: utilisateur.userId,
      });
      await moteurSync.mettreEnFile({
        entiteType: "Reservation",
        localId: reservation.id,
        operation: "CREATE",
        payload,
      });
      onCree(reservation.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Nouvelle réservation" onRetour={onRetour} />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <ConteneurFormulaire styleContenu={styles.contenu}>
        <View style={styles.carte}>
          <Text style={styles.champLabel}>Arrivée (JJ/MM/AAAA)</Text>
          <TextInput
            style={styles.champ}
            value={saisieArrivee}
            onChangeText={setSaisieArrivee}
            placeholder="JJ/MM/AAAA"
            placeholderTextColor={couleurs.encreFaible}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.champLabel}>Nombre de nuits</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepperBouton} onPress={() => setNuits(Math.max(1, nuits - 1))}>
              <Text style={styles.stepperTexte}>-</Text>
            </Pressable>
            <Text style={styles.stepperValeur}>{nuits}</Text>
            <Pressable style={styles.stepperBouton} onPress={() => setNuits(Math.min(60, nuits + 1))}>
              <Text style={styles.stepperTexte}>+</Text>
            </Pressable>
            {dateDepart && (
              <Text style={styles.departInfo}>
                Départ le {new Date(dateDepart).toLocaleDateString("fr-FR")}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.carte}>
          <Text style={styles.champLabel}>Chambre</Text>
          {dateArrivee && dateDepart && (
            <View style={styles.listeChambres}>
              {(chambres ?? []).map((chambre) => {
                const occupee = chambresOccupees.has(chambre.id);
                const choisie = chambreChoisie?.id === chambre.id;
                return (
                  <Pressable
                    key={chambre.id}
                    style={[styles.chambre, choisie && styles.chambreChoisie, occupee && styles.chambreOccupee]}
                    disabled={occupee}
                    onPress={() => setChambreChoisie(chambre)}
                  >
                    <Text style={[styles.chambreNumero, occupee && styles.texteBarre]}>{chambre.numero}</Text>
                    <Text style={styles.chambreInfo} numberOfLines={1}>
                      {chambre.type} · {formatMontant(chambre.prixParNuit, chambre.devise)}
                      {occupee ? " · occupée" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!chambres && <Text style={styles.info}>Chargement des chambres…</Text>}
        </View>

        <View style={styles.carte}>
          <View style={styles.selecteur}>
            {(["nouveau", "existant"] as const).map((m) => (
              <Pressable
                key={m}
                style={[styles.selecteurOption, modeClient === m && styles.selecteurOptionActive]}
                onPress={() => {
                  setModeClient(m);
                  setClientChoisi(null);
                }}
              >
                <Text style={[styles.selecteurTexte, modeClient === m && styles.selecteurTexteActif]}>
                  {m === "nouveau" ? "Nouveau client" : "Client existant"}
                </Text>
              </Pressable>
            ))}
          </View>

          {modeClient === "nouveau" ? (
            <>
              <Text style={styles.champLabel}>Nom (obligatoire)</Text>
              <TextInput style={styles.champ} value={nom} onChangeText={setNom} placeholder="Nom du client" placeholderTextColor={couleurs.encreFaible} />
              <Text style={styles.champLabel}>Téléphone</Text>
              <TextInput style={styles.champ} value={telephone} onChangeText={setTelephone} placeholder="+243 …" placeholderTextColor={couleurs.encreFaible} keyboardType="phone-pad" />
              <Text style={styles.champLabel}>Email</Text>
              <TextInput style={styles.champ} value={email} onChangeText={setEmail} placeholder="Optionnel" placeholderTextColor={couleurs.encreFaible} keyboardType="email-address" autoCapitalize="none" />
            </>
          ) : (
            <>
              <Text style={styles.champLabel}>Rechercher (nom ou téléphone)</Text>
              <TextInput style={styles.champ} value={rechercheClient} onChangeText={setRechercheClient} placeholder="Nom ou téléphone" placeholderTextColor={couleurs.encreFaible} />
              <View style={styles.listeClients}>
                {clientsSelectionnables.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.ligneClient, clientChoisi?.id === c.id && styles.ligneClientChoisie]}
                    onPress={() => setClientChoisi(c)}
                  >
                    <Text style={styles.ligneClientNom}>{c.nom}</Text>
                    {c.telephone && <Text style={styles.ligneClientInfo}>{c.telephone}</Text>}
                  </Pressable>
                ))}
                {clientsSelectionnables.length === 0 && (
                  <Text style={styles.info}>Aucun client synchronisé ne correspond.</Text>
                )}
              </View>
            </>
          )}
        </View>

        <View style={styles.carte}>
          <Text style={styles.champLabel}>Acompte versé{chambreChoisie ? ` (${chambreChoisie.devise})` : ""}</Text>
          <TextInput
            style={styles.champ}
            value={acompteSaisi}
            onChangeText={setAcompteSaisi}
            placeholder="0"
            placeholderTextColor={couleurs.encreFaible}
            keyboardType="numeric"
          />
          {chambreChoisie && (
            <View style={styles.apercu}>
              <View style={styles.ligneApercu}>
                <Text style={styles.libelleApercu}>Total séjour</Text>
                <Text style={styles.valeurApercu}>{formatMontant(total, chambreChoisie.devise)}</Text>
              </View>
              <View style={styles.ligneApercu}>
                <Text style={styles.libelleApercu}>Reste à payer à l'arrivée</Text>
                <Text style={styles.valeurApercu}>{formatMontant(Math.max(0, total - acompte), chambreChoisie.devise)}</Text>
              </View>
            </View>
          )}
        </View>

        {etatSync.enLigne && (
          <Pressable style={styles.checkInLigne} onPress={() => setCheckInImmediat(!checkInImmediat)}>
            <View style={[styles.case, checkInImmediat && styles.caseCochee]}>
              {checkInImmediat && <Text style={styles.caseTexte}>✓</Text>}
            </View>
            <Text style={styles.checkInTexte}>Le client est déjà là — enregistrer l'arrivée tout de suite (check-in)</Text>
          </Pressable>
        )}

        <Pressable style={styles.bouton} onPress={creer} disabled={enCours}>
          <Text style={styles.boutonTexte}>
            {enCours ? "…" : checkInImmediat && etatSync.enLigne ? "Créer et enregistrer l'arrivée" : "Créer la réservation"}
          </Text>
        </Pressable>
        {!etatSync.enLigne && (
          <Text style={styles.infoHorsLigne}>Hors ligne : la réservation sera envoyée au serveur dès le retour de la connexion.</Text>
        )}
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
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
  stepper: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  stepperBouton: {
    width: 40,
    height: 40,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface100,
  },
  stepperTexte: { fontSize: 20, fontWeight: "700", color: couleurs.encre },
  stepperValeur: { fontSize: 17, fontWeight: "700", color: couleurs.navy, minWidth: 24, textAlign: "center" },
  departInfo: { fontSize: 13, color: couleurs.encreAttenuee, flex: 1 },
  listeChambres: { gap: espacements.s2, marginTop: espacements.s2 },
  chambre: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    padding: espacements.s3,
    backgroundColor: couleurs.surface100,
  },
  chambreChoisie: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  chambreOccupee: { opacity: 0.5 },
  chambreNumero: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  chambreInfo: { fontSize: 12, color: couleurs.encreAttenuee },
  texteBarre: { textDecorationLine: "line-through" },
  selecteur: { flexDirection: "row", gap: espacements.s2, marginBottom: espacements.s2 },
  selecteurOption: {
    flex: 1,
    height: 40,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  selecteurOptionActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  selecteurTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  selecteurTexteActif: { color: "#fff" },
  listeClients: { gap: espacements.s1, marginTop: espacements.s2, maxHeight: 220 },
  ligneClient: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    padding: espacements.s3,
    backgroundColor: couleurs.surface100,
  },
  ligneClientChoisie: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  ligneClientNom: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  ligneClientInfo: { fontSize: 12, color: couleurs.encreAttenuee },
  apercu: { marginTop: espacements.s3, gap: 4 },
  ligneApercu: { flexDirection: "row", justifyContent: "space-between" },
  libelleApercu: { fontSize: 13, color: couleurs.encreAttenuee },
  valeurApercu: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  checkInLigne: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  case: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface200,
  },
  caseCochee: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  caseTexte: { color: "#fff", fontSize: 13, fontWeight: "700" },
  checkInTexte: { flex: 1, fontSize: 13, color: couleurs.encre },
  bouton: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  info: { fontSize: 13, color: couleurs.encreAttenuee, paddingVertical: espacements.s2 },
  infoHorsLigne: { fontSize: 12, color: couleurs.encreAttenuee, textAlign: "center" },
});
