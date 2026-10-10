import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import type { Chambre, Client, Reservation } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { SelecteurDate, saisieDepuisIso } from "../composants/SelecteurDate";
import { useSession } from "../contexteSession";
import { lireMontant } from "@hotel-chicago/regles";
import { ajouterJours, dateComplete, midiLubumbashi } from "../dates";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";

export interface EcranNouvelleReservationProps {
  onRetour: () => void;
  /** Après création (locale ou en ligne) : le hub affiche le détail. */
  onCree: (reservationId: string) => void;
  /** Pré-remplissage depuis le planning (cellule chambre × date). */
  chambreInitialeId?: string;
  dateArriveeInitiale?: string; // ISO
}

const STATUTS_OCCUPANTS = new Set(["CONFIRMEE", "EN_COURS"]); // mêmes que reservations.service.ts

/** Aujourd'hui « JJ/MM/AAAA » au jour de Lubumbashi (pas celui du fuseau réglé sur le téléphone). */
function aujourdhuiSaisie(): string {
  return dateComplete(new Date());
}

/** « JJ/MM/AAAA » → midi à Lubumbashi ce jour-là (ISO), null si la date n'existe pas. */
function isoDepuisSaisie(saisie: string): string | null {
  const m = saisie.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, j, mo, a] = m;
  return midiLubumbashi(`${a}-${mo}-${j}`);
}

/** Au-delà, la liste des clients demande d'affiner la recherche (les téléphones d'entrée de gamme rament sur de longues listes). */
const MAX_CLIENTS_AFFICHES = 30;

/** Chevauchement CONFIRMEE/EN_COURS sur la base locale — même règle que
 * verifierAbsenceDeConflit côté serveur (recalculée là-bas au push, mais
 * prévenir vaut mieux que rattraper un rejet de la file). */
function chambresOccupeesSurPeriode(reservations: Reservation[], arrivee: string, depart: string): Set<string> {
  const occupees = new Set<string>();
  for (const r of reservations) {
    if (!STATUTS_OCCUPANTS.has(r.statut)) continue;
    if (r.dateArrivee < depart && r.dateDepart > arrivee) occupees.add(r.chambreId);
  }
  return occupees;
}

/**
 * Création d'une réservation — toujours écrite en local d'abord (base de
 * l'appareil + file d'envoi), le serveur la confirme en arrière-plan. Le
 * « check-in immédiat » (client déjà là) marche aussi hors ligne.
 */
export function EcranNouvelleReservation({ onRetour, onCree, chambreInitialeId, dateArriveeInitiale }: EcranNouvelleReservationProps) {
  const { client } = useSession();

  const [saisieArrivee, setSaisieArrivee] = useState(() =>
    dateArriveeInitiale ? saisieDepuisIso(dateArriveeInitiale.slice(0, 10)) : aujourdhuiSaisie()
  );
  const [nuits, setNuits] = useState(1);
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);
  const [modeClient, setModeClient] = useState<"nouveau" | "existant">("nouveau");
  const [clientChoisi, setClientChoisi] = useState<Client | null>(null);
  const [rechercheClient, setRechercheClient] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [typePiece, setTypePiece] = useState("");
  const [numeroPiece, setNumeroPiece] = useState("");
  const [acompteSaisi, setAcompteSaisi] = useState("");
  const [note, setNote] = useState("");
  const [checkInImmediat, setCheckInImmediat] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const charger = useCallback(() => {
    Promise.all([client.listerChambres(), client.listerReservations(), client.listerClients()])
      .then(([c, r, cl]) => {
        setChambres(c);
        setReservations(r);
        setClients(cl);
        if (chambreInitialeId) {
          const initiale = c.find((x) => x.id === chambreInitialeId);
          if (initiale) setChambreChoisie(initiale);
        }
      })
      .catch((e: unknown) => setErreurChargement(messageErreur(e, "Les chambres ou les clients n'ont pas pu être chargés. Réessayez.")));
  }, [client, chambreInitialeId]);

  useEffect(charger, [charger]);

  const dateArrivee = isoDepuisSaisie(saisieArrivee);
  const dateDepart = useMemo(() => {
    if (!dateArrivee) return null;
    return ajouterJours(new Date(dateArrivee), nuits).toISOString();
  }, [dateArrivee, nuits]);

  const chambresOccupees = useMemo(
    () => (dateArrivee && dateDepart ? chambresOccupeesSurPeriode(reservations, dateArrivee, dateDepart) : new Set<string>()),
    [reservations, dateArrivee, dateDepart]
  );

  // Un client créé sur cet appareil et pas encore envoyé reste sélectionnable :
  // la base locale résout son identifiant au moment de l'envoi.
  const clientsSelectionnables = useMemo(() => {
    const terme = rechercheClient.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (!terme || c.nom.toLowerCase().includes(terme) || (c.telephone ?? "").includes(rechercheClient.trim()))
    );
  }, [clients, rechercheClient]);
  const clientsAffiches = clientsSelectionnables.slice(0, MAX_CLIENTS_AFFICHES);

  /** Une saisie existe : « Retour » demande d'abord confirmation au lieu de la jeter (retour U5). */
  const saisieEntamee =
    nom.trim() !== "" ||
    telephone.trim() !== "" ||
    email.trim() !== "" ||
    typePiece.trim() !== "" ||
    numeroPiece.trim() !== "" ||
    note.trim() !== "" ||
    acompteSaisi.trim() !== "" ||
    clientChoisi !== null ||
    (chambreChoisie !== null && chambreChoisie.id !== chambreInitialeId);

  function retour() {
    if (enCours) return;
    if (!saisieEntamee) return onRetour();
    confirmerAction({
      titre: "Abandonner cette réservation ?",
      message: "Les informations saisies ne seront pas enregistrées.",
      libelleConfirmer: "Abandonner",
      libelleRefuser: "Continuer la saisie",
      destructif: true,
      onConfirmer: onRetour,
    });
  }

  const total = chambreChoisie ? Number(chambreChoisie.prixParNuit) * nuits : 0;
  const acompteLu = acompteSaisi.trim()
    ? lireMontant(acompteSaisi, chambreChoisie?.devise ?? "USD", { autoriserZero: true, max: 100_000_000 })
    : ({ ok: true, valeur: 0 } as const);
  const acompte = acompteLu.ok ? acompteLu.valeur : NaN;

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
    if (!acompteLu.ok) {
      setErreur(`Acompte : ${acompteLu.message}`);
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
      const nouveauClient =
        modeClient === "nouveau"
          ? {
              nom: nom.trim(),
              telephone: telephone.trim() || undefined,
              email: email.trim() || undefined,
              typePiece: typePiece.trim() || undefined,
              numeroPiece: numeroPiece.trim() || undefined,
            }
          : undefined;
      const noteTrim = note.trim() || undefined;
      // Arrivée express : la réservation naît EN_COURS et la chambre passe
      // OCCUPEE dans la même écriture (installerImmediatement).
      const creee = await client.creerReservation({
        chambreId: chambreChoisie.id,
        ...(clientChoisi ? { clientId: clientChoisi.id } : { client: nouveauClient }),
        dateArrivee,
        dateDepart,
        acompte: acompte || undefined,
        note: noteTrim,
        ...(checkInImmediat ? { installerImmediatement: true } : {}),
      });
      onCree(creee.id);
    } catch (e) {
      setErreur(messageErreur(e, "La réservation n'a pas pu être créée. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Nouvelle réservation" onRetour={retour} />

      {erreurChargement && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreurChargement}
        </Text>
      )}

      <ConteneurFormulaire styleContenu={styles.contenu}>
        <View style={styles.carte}>
          <Text style={styles.champLabel}>Arrivée (JJ/MM/AAAA)</Text>
          <SelecteurDate
            libelle="Date d'arrivée"
            valeur={isoDepuisSaisie(saisieArrivee)?.slice(0, 10) ?? ""}
            onChange={(iso) => setSaisieArrivee(iso ? saisieDepuisIso(iso) : "")}
          />
          <Text style={styles.champLabel}>Nombre de nuits</Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepperBouton}
              onPress={() => setNuits(Math.max(1, nuits - 1))}
              accessibilityRole="button"
              accessibilityLabel="Une nuit de moins"
              accessibilityState={{ disabled: nuits <= 1 }}
            >
              <Text style={styles.stepperTexte}>-</Text>
            </Pressable>
            <Text style={styles.stepperValeur} accessibilityLabel={`${nuits} nuit${nuits > 1 ? "s" : ""}`}>
              {nuits}
            </Text>
            <Pressable
              style={styles.stepperBouton}
              onPress={() => setNuits(Math.min(60, nuits + 1))}
              accessibilityRole="button"
              accessibilityLabel="Une nuit de plus"
              accessibilityState={{ disabled: nuits >= 60 }}
            >
              <Text style={styles.stepperTexte}>+</Text>
            </Pressable>
            {dateDepart && <Text style={styles.departInfo}>Départ le {dateComplete(dateDepart)}</Text>}
          </View>
        </View>

        <View style={styles.carte}>
          <Text style={styles.champLabel}>Chambre</Text>
          {dateArrivee && dateDepart && (
            // Liste bornée en hauteur et défilante : une centaine de chambres ne doit pas allonger toute la page.
            <ScrollView style={styles.listeChambres} nestedScrollEnabled keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup">
              {(chambres ?? []).map((chambre) => {
                const occupee = chambresOccupees.has(chambre.id);
                const choisie = chambreChoisie?.id === chambre.id;
                return (
                  <Pressable
                    key={chambre.id}
                    style={[styles.chambre, choisie && styles.chambreChoisie, occupee && styles.chambreOccupee]}
                    disabled={occupee}
                    onPress={() => setChambreChoisie(chambre)}
                    accessibilityRole="radio"
                    accessibilityLabel={`Chambre ${chambre.numero}, ${chambre.type}, ${formatMontant(chambre.prixParNuit, chambre.devise)} par nuit${occupee ? ", occupée sur ces dates" : ""}`}
                    accessibilityState={{ checked: choisie, disabled: occupee }}
                  >
                    <Text style={[styles.chambreNumero, occupee && styles.texteBarre]}>{chambre.numero}</Text>
                    <Text style={styles.chambreInfo} numberOfLines={1}>
                      {chambre.type} · {formatMontant(chambre.prixParNuit, chambre.devise)}
                      {occupee ? " · occupée" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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
                accessibilityRole="radio"
                accessibilityLabel={m === "nouveau" ? "Nouveau client" : "Client existant"}
                accessibilityState={{ checked: modeClient === m }}
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
              <TextInput style={styles.champ} value={nom} onChangeText={setNom} accessibilityLabel="Nom du client, obligatoire" autoComplete="name" placeholder="Nom du client" placeholderTextColor={couleurs.encreFaible} />
              <Text style={styles.champLabel}>Téléphone</Text>
              <TextInput style={styles.champ} value={telephone} onChangeText={setTelephone} accessibilityLabel="Téléphone du client" autoComplete="tel" placeholder="+243 …" placeholderTextColor={couleurs.encreFaible} keyboardType="phone-pad" />
              <Text style={styles.champLabel}>Email</Text>
              <TextInput style={styles.champ} value={email} onChangeText={setEmail} accessibilityLabel="Email du client" autoComplete="email" placeholder="Optionnel" placeholderTextColor={couleurs.encreFaible} keyboardType="email-address" autoCapitalize="none" />
              <Text style={styles.champLabel}>Type de pièce (optionnel)</Text>
              <TextInput style={styles.champ} value={typePiece} onChangeText={setTypePiece} accessibilityLabel="Type de pièce d'identité" placeholder="CNI, passeport, permis…" placeholderTextColor={couleurs.encreFaible} />
              <Text style={styles.champLabel}>N° de pièce (optionnel)</Text>
              <TextInput style={styles.champ} value={numeroPiece} onChangeText={setNumeroPiece} accessibilityLabel="Numéro de la pièce d'identité" placeholder="Numéro de la pièce d'identité" placeholderTextColor={couleurs.encreFaible} />
            </>
          ) : (
            <>
              <Text style={styles.champLabel}>Rechercher (nom ou téléphone)</Text>
              <TextInput style={styles.champ} value={rechercheClient} onChangeText={setRechercheClient} accessibilityLabel="Rechercher un client par nom ou téléphone" returnKeyType="search" placeholder="Nom ou téléphone" placeholderTextColor={couleurs.encreFaible} />
              <ScrollView style={styles.listeClients} nestedScrollEnabled keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup">
                {clientsAffiches.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.ligneClient, clientChoisi?.id === c.id && styles.ligneClientChoisie]}
                    onPress={() => setClientChoisi(c)}
                    accessibilityRole="radio"
                    accessibilityLabel={`${c.nom}${c.telephone ? `, ${c.telephone}` : ""}`}
                    accessibilityState={{ checked: clientChoisi?.id === c.id }}
                  >
                    <Text style={styles.ligneClientNom}>{c.nom}</Text>
                    {c.telephone && <Text style={styles.ligneClientInfo}>{c.telephone}</Text>}
                  </Pressable>
                ))}
                {clientsSelectionnables.length === 0 && (
                  <Text style={styles.info}>Aucun client ne correspond.</Text>
                )}
                {clientsSelectionnables.length > clientsAffiches.length && (
                  <Text style={styles.info}>
                    {clientsSelectionnables.length - clientsAffiches.length} autres clients : précisez la recherche pour les voir.
                  </Text>
                )}
              </ScrollView>
            </>
          )}
        </View>

        <View style={styles.carte}>
          <Text style={styles.champLabel}>Acompte versé{chambreChoisie ? ` (${chambreChoisie.devise})` : ""}</Text>
          <TextInput
            style={styles.champ}
            value={acompteSaisi}
            onChangeText={setAcompteSaisi}
            accessibilityLabel={`Acompte versé${chambreChoisie ? ` en ${chambreChoisie.devise}` : ""}`}
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

        <View style={styles.carte}>
          <Text style={styles.champLabel}>Demandes spéciales (optionnel)</Text>
          <TextInput
            style={[styles.champ, styles.champMulti]}
            value={note}
            onChangeText={setNote}
            accessibilityLabel="Demandes spéciales, optionnel"
            placeholder="Lit bébé, étage élevé, régime alimentaire…"
            placeholderTextColor={couleurs.encreFaible}
            multiline
          />
        </View>

        <Pressable
          style={styles.checkInLigne}
          onPress={() => setCheckInImmediat(!checkInImmediat)}
          accessibilityRole="checkbox"
          accessibilityLabel="Le client est déjà là : enregistrer l'arrivée tout de suite (check-in)"
          accessibilityState={{ checked: checkInImmediat }}
        >
          <View style={[styles.case, checkInImmediat && styles.caseCochee]}>
            {checkInImmediat && <Text style={styles.caseTexte}>✓</Text>}
          </View>
          <Text style={styles.checkInTexte}>Le client est déjà là — enregistrer l'arrivée tout de suite (check-in)</Text>
        </Pressable>

        {erreur && (
          <Text style={styles.erreurBas} accessibilityRole="alert">
            {erreur}
          </Text>
        )}

        <Pressable
          style={styles.bouton}
          onPress={creer}
          disabled={enCours}
          accessibilityRole="button"
          accessibilityState={{ disabled: enCours, busy: enCours }}
        >
          <Text style={styles.boutonTexte}>
            {enCours ? "…" : checkInImmediat ? "Créer et enregistrer l'arrivée" : "Créer la réservation"}
          </Text>
        </Pressable>
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  erreurBas: { color: couleurs.danger, fontSize: 13, fontWeight: "600" },
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
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  stepperBouton: {
    width: 44,
    height: 44,
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
  listeChambres: { marginTop: espacements.s2, maxHeight: 320 },
  chambre: {
    marginBottom: espacements.s2,
    minHeight: 44,
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
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  selecteurOptionActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  selecteurTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  selecteurTexteActif: { color: "#fff" },
  listeClients: { marginTop: espacements.s2, maxHeight: 260 },
  ligneClient: {
    marginBottom: espacements.s1,
    minHeight: 44,
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
  checkInLigne: { flexDirection: "row", alignItems: "center", gap: espacements.s3, minHeight: 44 },
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
  champMulti: { minHeight: 72, textAlignVertical: "top", paddingTop: espacements.s3 },
  bouton: { minHeight: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  info: { fontSize: 13, color: couleurs.encreAttenuee, paddingVertical: espacements.s2 },
  infoHorsLigne: { fontSize: 12, color: couleurs.encreAttenuee, textAlign: "center" },
});
