import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, CircleCheck, Minus, Plus, Search, UserPlus } from "lucide-react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { Devise } from "@hotel-chicago/types";
import type { Chambre, Client, Reservation } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { SelecteurDate, saisieDepuisIso } from "../composants/SelecteurDate";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { chambresIndisponibles, choixAcompteDe, lireMontant, montantAcompteRapide, typesDeChambres } from "@hotel-chicago/regles";
import type { ChoixAcompte } from "@hotel-chicago/regles";
import { ajouterJours, dateCourte, dateComplete, memeJour, midiLubumbashi } from "../dates";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { ChampTypePiece } from "../composants/ChampTypePiece";

export interface EcranNouvelleReservationProps {
  onRetour: () => void;
  /** Après création (locale ou en ligne) : le hub affiche le détail. */
  onCree: (reservationId: string) => void;
  /** Pré-remplissage depuis le planning (cellule chambre × date). */
  chambreInitialeId?: string;
  dateArriveeInitiale?: string; // ISO
  /** « Enregistrer une arrivée » (depuis une chambre libre) : la case « le client est déjà là » est cochée d'avance. */
  arriveeImmediateParDefaut?: boolean;
}

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

/**
 * Création d'une réservation — toujours écrite en local d'abord (base de
 * l'appareil + file d'envoi), le serveur la confirme en arrière-plan. Le
 * « check-in immédiat » (client déjà là) marche aussi hors ligne.
 */
export function EcranNouvelleReservation({ onRetour, onCree, chambreInitialeId, dateArriveeInitiale, arriveeImmediateParDefaut = false }: EcranNouvelleReservationProps) {
  const { client } = useSession();
  const etatSync = useSyncEtat();

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
  const [checkInImmediat, setCheckInImmediat] = useState(arriveeImmediateParDefaut);
  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [filtreType, setFiltreType] = useState<string | null>(null);
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

  const indisponibles = useMemo(
    () => (dateArrivee && dateDepart ? chambresIndisponibles(reservations, dateArrivee, dateDepart) : new Map()),
    [reservations, dateArrivee, dateDepart]
  );
  // Si les dates changent et que la chambre choisie n'est plus libre, on la désélectionne : on ne laisse pas partir une réservation en conflit.
  useEffect(() => {
    if (chambreChoisie && indisponibles.has(chambreChoisie.id)) setChambreChoisie(null);
  }, [indisponibles, chambreChoisie]);
  const typesDispo = useMemo(() => typesDeChambres((chambres ?? []).filter((c) => !indisponibles.has(c.id))), [chambres, indisponibles]);
  const nbLibres = (chambres ?? []).filter((c) => !indisponibles.has(c.id)).length;
  const chambresAffichees = (chambres ?? []).filter((c) => !filtreType || c.type.trim() === filtreType);

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
    if (etape > 1) {
      setErreur(null);
      setEtape((etape - 1) as 1 | 2);
      return;
    }
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

  /** Passe à l'étape suivante si l'étape courante est complète ; sinon dit précisément ce qui manque. */
  function continuer() {
    setErreur(null);
    if (etape === 1) {
      if (!dateArrivee || !dateDepart) return setErreur("Date d'arrivée invalide — format JJ/MM/AAAA.");
      if (!chambreChoisie) return setErreur("Choisissez une chambre pour continuer.");
      return setEtape(2);
    }
    if (etape === 2) {
      if (modeClient === "existant" && !clientChoisi) return setErreur("Choisissez un client déjà venu, ou passez en « Nouveau client ».");
      if (modeClient === "nouveau" && !nom.trim()) return setErreur("Le nom du client est obligatoire.");
      return setEtape(3);
    }
    void creer();
  }

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
        ...(arriveeImmediateParDefaut || (checkInImmediat && memeJour(dateArrivee)) ? { installerImmediatement: true } : {}),
      });
      onCree(creee.id);
    } catch (e) {
      setErreur(messageErreur(e, "La réservation n'a pas pu être créée. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  const estAujourdhui = dateArrivee ? memeJour(dateArrivee) : false;
  const arriveeMaintenant = arriveeImmediateParDefaut || (checkInImmediat && estAujourdhui);
  const titre = arriveeImmediateParDefaut ? "Enregistrer une arrivée" : "Nouvelle réservation";
  const devise: Devise = chambreChoisie?.devise ?? Devise.USD;
  const choixActif = acompteLu.ok ? choixAcompteDe(total, acompte || 0) : null;
  const nomClient = modeClient === "existant" ? (clientChoisi?.nom ?? "") : nom.trim();
  const libelleBouton = etape < 3 ? "Continuer" : arriveeMaintenant ? "Enregistrer l'arrivée" : "Créer la réservation";

  function choisirAcompte(choix: ChoixAcompte) {
    const montant = montantAcompteRapide(total, choix);
    setAcompteSaisi(montant > 0 ? String(montant) : "");
  }

  const ETAPES = ["Séjour", "Client", "Confirmer"];

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre={titre} onRetour={retour} />

      <View style={styles.etapes} accessibilityRole="progressbar" accessibilityLabel={`Étape ${etape} sur 3 : ${ETAPES[etape - 1]}`}>
        {ETAPES.map((nomEtape, k) => {
          const numero = k + 1;
          const faite = numero < etape;
          const active = numero === etape;
          return (
            <React.Fragment key={nomEtape}>
              {k > 0 && <View style={[styles.etapeTrait, numero <= etape && styles.etapeTraitFait]} />}
              <View style={styles.etape}>
                <View style={[styles.etapeRond, (faite || active) && styles.etapeRondActif, faite && styles.etapeRondFait]}>
                  {faite ? <Check size={16} color="#fff" strokeWidth={3} /> : <Text style={[styles.etapeNumero, active && { color: "#fff" }]}>{numero}</Text>}
                </View>
                <Text style={[styles.etapeLibelle, active && styles.etapeLibelleActif]}>{nomEtape}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {erreurChargement && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreurChargement}
        </Text>
      )}

      <ConteneurFormulaire styleContenu={styles.contenu}>
        {etape === 1 && (
          <>
            <View style={styles.carte}>
              <View style={styles.ligneDates}>
                <View>
                  <Text style={styles.champLabel}>ARRIVÉE</Text>
                  {arriveeImmediateParDefaut ? (
                    <View style={styles.dateFixe}>
                      <Text style={styles.dateFixeTexte}>Aujourd'hui</Text>
                    </View>
                  ) : (
                    <SelecteurDate
                      libelle="Date d'arrivée"
                      valeur={isoDepuisSaisie(saisieArrivee)?.slice(0, 10) ?? ""}
                      onChange={(iso) => setSaisieArrivee(iso ? saisieDepuisIso(iso) : "")}
                    />
                  )}
                </View>
                <View>
                  <Text style={styles.champLabel}>NUITS</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      style={styles.stepperBouton}
                      onPress={() => setNuits(Math.max(1, nuits - 1))}
                      accessibilityRole="button"
                      accessibilityLabel="Une nuit de moins"
                      accessibilityState={{ disabled: nuits <= 1 }}
                    >
                      <Minus size={18} color={couleurs.encre} />
                    </Pressable>
                    <Text style={styles.stepperValeur} accessibilityLabel={`${nuits} nuit${nuits > 1 ? "s" : ""}`}>
                      {nuits}
                    </Text>
                    <Pressable
                      style={[styles.stepperBouton, styles.stepperPlus]}
                      onPress={() => setNuits(Math.min(60, nuits + 1))}
                      accessibilityRole="button"
                      accessibilityLabel="Une nuit de plus"
                      accessibilityState={{ disabled: nuits >= 60 }}
                    >
                      <Plus size={18} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              </View>
              {dateDepart && <Text style={styles.departInfo}>Départ prévu le {dateComplete(dateDepart)}</Text>}
            </View>

            {etatSync && !etatSync.enLigne && (
              <Text style={styles.avisHorsLigne} accessibilityRole="alert">
                Vous êtes sans connexion : les chambres affichées sont celles de la dernière synchronisation. Si un client en a payé une en ligne entre-temps, votre
                réservation sera refusée à la reconnexion et vous serez prévenu pour proposer une autre chambre.
              </Text>
            )}

            <Text style={styles.titreSection}>
              CHOISIR UNE CHAMBRE{dateArrivee && dateDepart ? ` · libres du ${dateCourte(dateArrivee)} au ${dateCourte(dateDepart)}` : ""}
            </Text>
            {typesDispo.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Pressable style={[styles.chip, !filtreType && styles.chipActif]} onPress={() => setFiltreType(null)} accessibilityRole="button" accessibilityState={{ selected: !filtreType }}>
                  <Text style={[styles.chipTexte, !filtreType && styles.chipTexteActif]}>Toutes · {nbLibres}</Text>
                </Pressable>
                {typesDispo.map(({ type, nombre }) => {
                  const actif = filtreType === type;
                  return (
                    <Pressable key={type} style={[styles.chip, actif && styles.chipActif]} onPress={() => setFiltreType(actif ? null : type)} accessibilityRole="button" accessibilityState={{ selected: actif }}>
                      <Text style={[styles.chipTexte, actif && styles.chipTexteActif]}>
                        {type} · {nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {!chambres && <Text style={styles.info}>Chargement des chambres…</Text>}
            {chambres && nbLibres === 0 && dateArrivee && <Text style={styles.info}>Aucune chambre libre sur ces dates. Changez les dates ou le nombre de nuits.</Text>}
            {dateArrivee && dateDepart && (
              <View style={styles.grille} accessibilityRole="radiogroup">
                {chambresAffichees.map((chambre) => {
                  const motif = indisponibles.get(chambre.id);
                  const choisie = chambreChoisie?.id === chambre.id;
                  const anettoyer = !motif && chambre.statut === "NETTOYAGE";
                  return (
                    <Pressable
                      key={chambre.id}
                      style={[styles.cellule, choisie && styles.celluleChoisie, motif && styles.celluleIndispo]}
                      disabled={!!motif}
                      onPress={() => {
                        setChambreChoisie(chambre);
                        setErreur(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={`Chambre ${chambre.numero}, ${chambre.type}, ${formatMontant(chambre.prixParNuit, chambre.devise)} par nuit${motif ? (motif === "occupee" ? ", occupée sur ces dates" : ", déjà réservée sur ces dates") : anettoyer ? ", à nettoyer" : ""}`}
                      accessibilityState={{ checked: choisie, disabled: !!motif }}
                    >
                      <View style={styles.celluleEntete}>
                        <Text style={[styles.celluleNumero, motif && styles.texteBarre]}>{chambre.numero}</Text>
                        {choisie && (
                          <View style={styles.coche}>
                            <Check size={13} color="#fff" strokeWidth={3} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.celluleType} numberOfLines={1}>
                        {chambre.type}
                      </Text>
                      {motif ? (
                        <Text style={styles.celluleMotif}>{motif === "occupee" ? "Occupée" : "Réservée"}</Text>
                      ) : anettoyer ? (
                        <Text style={styles.celluleNettoyage}>À nettoyer</Text>
                      ) : null}
                      <Text style={styles.cellulePrix}>{formatMontant(chambre.prixParNuit, chambre.devise)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {etape === 2 && (
          <>
            <View style={styles.selecteur}>
              {(["nouveau", "existant"] as const).map((m) => {
                const Icone = m === "nouveau" ? UserPlus : Search;
                const actif = modeClient === m;
                return (
                  <Pressable
                    key={m}
                    style={[styles.selecteurOption, actif && styles.selecteurOptionActive]}
                    onPress={() => {
                      setModeClient(m);
                      setClientChoisi(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={m === "nouveau" ? "Nouveau client" : "Client déjà venu"}
                    accessibilityState={{ checked: actif }}
                  >
                    <Icone size={17} color={actif ? "#fff" : couleurs.encreAttenuee} />
                    <Text style={[styles.selecteurTexte, actif && styles.selecteurTexteActif]}>{m === "nouveau" ? "Nouveau client" : "Client déjà venu"}</Text>
                  </Pressable>
                );
              })}
            </View>

            {modeClient === "nouveau" ? (
              <View style={styles.carte}>
                <Text style={styles.champLabel}>NOM ET PRÉNOM</Text>
                <TextInput style={styles.champ} value={nom} onChangeText={setNom} accessibilityLabel="Nom du client, obligatoire" autoComplete="name" placeholder="Nom du client" placeholderTextColor={couleurs.encreFaible} />
                <Text style={styles.champLabel}>TÉLÉPHONE</Text>
                <TextInput style={styles.champ} value={telephone} onChangeText={setTelephone} accessibilityLabel="Téléphone du client" autoComplete="tel" placeholder="+243 …" placeholderTextColor={couleurs.encreFaible} keyboardType="phone-pad" />
                <View style={styles.pieceCarte}>
                  <Text style={styles.pieceTitre}>Pièce d'identité (registre de l'hôtel) · facultatif</Text>
                  <ChampTypePiece valeur={typePiece} onChange={setTypePiece} libelle="Type de pièce" />
                  <Text style={styles.champLabel}>NUMÉRO</Text>
                  <TextInput style={styles.champ} value={numeroPiece} onChangeText={setNumeroPiece} accessibilityLabel="Numéro de la pièce d'identité" placeholder="Numéro de la pièce d'identité" placeholderTextColor={couleurs.encreFaible} />
                </View>
                <Text style={styles.champLabel}>E-MAIL (FACULTATIF)</Text>
                <TextInput style={styles.champ} value={email} onChangeText={setEmail} accessibilityLabel="Email du client" autoComplete="email" placeholder="Pour envoyer le reçu" placeholderTextColor={couleurs.encreFaible} keyboardType="email-address" autoCapitalize="none" />
              </View>
            ) : (
              <View style={styles.carte}>
                <Text style={styles.champLabel}>RECHERCHER (NOM OU TÉLÉPHONE)</Text>
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
                  {clientsSelectionnables.length === 0 && <Text style={styles.info}>Aucun client ne correspond.</Text>}
                  {clientsSelectionnables.length > clientsAffiches.length && (
                    <Text style={styles.info}>{clientsSelectionnables.length - clientsAffiches.length} autres clients : précisez la recherche pour les voir.</Text>
                  )}
                </ScrollView>
              </View>
            )}
          </>
        )}

        {etape === 3 && chambreChoisie && (
          <>
            <View style={styles.carte}>
              <Text style={styles.recapNom}>{nomClient}</Text>
              {modeClient === "nouveau" && (telephone.trim() || typePiece.trim() || numeroPiece.trim()) ? (
                <Text style={styles.info}>{[telephone.trim(), [typePiece.trim(), numeroPiece.trim()].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</Text>
              ) : null}
              <View style={styles.recapSeparateur} />
              <View style={styles.ligneApercu}>
                <Text style={styles.libelleApercu}>Chambre</Text>
                <Text style={styles.valeurApercu}>
                  {chambreChoisie.numero} · {chambreChoisie.type}
                </Text>
              </View>
              <View style={styles.ligneApercu}>
                <Text style={styles.libelleApercu}>Séjour</Text>
                <Text style={styles.valeurApercu}>
                  {dateArrivee ? dateCourte(dateArrivee) : ""} → {dateDepart ? dateCourte(dateDepart) : ""} · {nuits} nuit{nuits > 1 ? "s" : ""}
                </Text>
              </View>
              <View style={styles.ligneApercu}>
                <Text style={styles.libelleApercu}>
                  {nuits} nuit{nuits > 1 ? "s" : ""} × {formatMontant(chambreChoisie.prixParNuit, devise)}
                </Text>
                <Text style={styles.valeurApercu}>{formatMontant(total, devise)}</Text>
              </View>
            </View>

            <View style={styles.carte}>
              <Text style={styles.titreCarte}>Acompte versé ({devise})</Text>
              <View style={styles.chipsAcompte}>
                {(
                  [
                    ["aucun", "0"],
                    ["moitie", "50 %"],
                    ["tout", "Tout payer"],
                  ] as const
                ).map(([choix, libelle]) => {
                  const actif = choixActif === choix;
                  return (
                    <Pressable key={choix} style={[styles.chipAcompte, actif && styles.chipActif]} onPress={() => choisirAcompte(choix)} accessibilityRole="button" accessibilityState={{ selected: actif }} accessibilityLabel={`Acompte : ${libelle}`}>
                      <Text style={[styles.chipAcompteTexte, actif && styles.chipTexteActif]}>{libelle}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.champ}
                value={acompteSaisi}
                onChangeText={setAcompteSaisi}
                accessibilityLabel={`Acompte versé en ${devise}`}
                placeholder="0"
                placeholderTextColor={couleurs.encreFaible}
                keyboardType="numeric"
              />
              <View style={styles.ligneApercu}>
                <Text style={styles.libelleApercu}>Reste à payer {arriveeMaintenant ? "au départ" : "à l'arrivée"}</Text>
                <Text style={[styles.valeurApercu, { color: couleurs.alerte }]}>{formatMontant(Math.max(0, total - (Number.isNaN(acompte) ? 0 : acompte)), devise)}</Text>
              </View>
            </View>

            <View style={styles.carte}>
              <Text style={styles.champLabel}>DEMANDES SPÉCIALES (FACULTATIF)</Text>
              <TextInput
                style={[styles.champ, styles.champMulti]}
                value={note}
                onChangeText={setNote}
                accessibilityLabel="Demandes spéciales, optionnel"
                placeholder="Lit bébé, étage élevé…"
                placeholderTextColor={couleurs.encreFaible}
                multiline
              />
            </View>

            {!arriveeImmediateParDefaut && estAujourdhui && (
              <Pressable
                style={styles.checkInLigne}
                onPress={() => setCheckInImmediat(!checkInImmediat)}
                accessibilityRole="checkbox"
                accessibilityLabel="Le client est déjà là : enregistrer l'arrivée tout de suite (check-in)"
                accessibilityState={{ checked: checkInImmediat }}
              >
                <View style={[styles.case, checkInImmediat && styles.caseCochee]}>{checkInImmediat && <Text style={styles.caseTexte}>✓</Text>}</View>
                <Text style={styles.checkInTexte}>Le client est déjà là — enregistrer l'arrivée tout de suite (check-in)</Text>
              </Pressable>
            )}
            {arriveeMaintenant && <Text style={styles.infoHorsLigne}>Le client sera installé tout de suite : la chambre {chambreChoisie.numero} passera en « Occupée ».</Text>}
          </>
        )}

        {erreur && (
          <Text style={styles.erreurBas} accessibilityRole="alert">
            {erreur}
          </Text>
        )}
      </ConteneurFormulaire>

      <View style={styles.pied}>
        <View style={{ flex: 1 }}>
          {etape === 1 && (
            <>
              <Text style={styles.piedLibelle}>{chambreChoisie ? `Chambre ${chambreChoisie.numero} · ${nuits} nuit${nuits > 1 ? "s" : ""}` : "Aucune chambre choisie"}</Text>
              {chambreChoisie && <Text style={styles.piedValeur}>{formatMontant(total, devise)}</Text>}
            </>
          )}
          {etape === 2 && (
            <>
              <Text style={styles.piedLibelle}>Client</Text>
              <Text style={styles.piedValeur} numberOfLines={1}>
                {nomClient || "—"}
              </Text>
            </>
          )}
          {etape === 3 && (
            <>
              <Text style={styles.piedLibelle}>Total du séjour</Text>
              <Text style={styles.piedValeur}>{formatMontant(total, devise)}</Text>
            </>
          )}
        </View>
        <Pressable
          style={[styles.boutonPied, etape === 3 && styles.boutonPiedFinal, enCours && { opacity: 0.6 }]}
          onPress={continuer}
          disabled={enCours}
          accessibilityRole="button"
          accessibilityState={{ disabled: enCours, busy: enCours }}
        >
          {etape === 3 && <CircleCheck size={19} color="#fff" />}
          <Text style={styles.boutonTexte}>{enCours ? "…" : libelleBouton}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  etapes: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: espacements.s6, paddingBottom: espacements.s2 },
  etape: { alignItems: "center", gap: 4, width: 64 },
  etapeRond: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, alignItems: "center", justifyContent: "center" },
  etapeRondActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  etapeRondFait: { backgroundColor: couleurs.succes, borderColor: couleurs.succes },
  etapeNumero: { fontSize: 14, fontWeight: "800", color: couleurs.encreAttenuee },
  etapeLibelle: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  etapeLibelleActif: { color: couleurs.bleu, fontWeight: "800" },
  etapeTrait: { flex: 1, height: 2, backgroundColor: couleurs.bordure, marginTop: 14 },
  etapeTraitFait: { backgroundColor: couleurs.succes },
  ligneDates: { gap: espacements.s2 },
  dateFixe: { minHeight: 44, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.sm, backgroundColor: couleurs.surface100, justifyContent: "center", paddingHorizontal: espacements.s3 },
  dateFixeTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  stepperPlus: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  titreSection: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  chips: { gap: espacements.s2 },
  chip: { minHeight: 36, paddingHorizontal: espacements.s3, borderRadius: rayons.pill, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, justifyContent: "center" },
  chipActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  chipTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  chipTexteActif: { color: "#fff" },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  cellule: { width: "31.5%", minHeight: 96, borderRadius: rayons.md, borderWidth: 1.5, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, padding: espacements.s2, gap: 2 },
  celluleChoisie: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  celluleIndispo: { opacity: 0.5, backgroundColor: couleurs.surface100 },
  celluleEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  celluleNumero: { fontSize: 18, fontWeight: "800", color: couleurs.encre },
  celluleType: { fontSize: 12, color: couleurs.encreAttenuee },
  celluleMotif: { fontSize: 11, fontWeight: "700", color: couleurs.danger },
  celluleNettoyage: { fontSize: 11, fontWeight: "700", color: couleurs.violet },
  cellulePrix: { fontSize: 14, fontWeight: "800", color: couleurs.encre, marginTop: "auto" },
  coche: { width: 20, height: 20, borderRadius: 10, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  pieceCarte: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.md, padding: espacements.s3, gap: 2, marginTop: espacements.s2, backgroundColor: couleurs.surface100 },
  pieceTitre: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  recapNom: { fontSize: 17, fontWeight: "800", color: couleurs.encre },
  recapSeparateur: { height: 1, backgroundColor: couleurs.bordure, marginVertical: espacements.s2 },
  titreCarte: { fontSize: 14, fontWeight: "700", color: couleurs.encre, marginBottom: espacements.s2 },
  chipsAcompte: { flexDirection: "row", gap: espacements.s2, marginBottom: espacements.s2 },
  chipAcompte: { flex: 1, minHeight: 44, borderRadius: rayons.sm, borderWidth: 1.5, borderColor: couleurs.bordure, backgroundColor: couleurs.surface100, alignItems: "center", justifyContent: "center" },
  chipAcompteTexte: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  pied: { flexDirection: "row", alignItems: "center", gap: espacements.s3, padding: espacements.s3, paddingHorizontal: espacements.s4, backgroundColor: couleurs.surface200, borderTopWidth: 1, borderTopColor: couleurs.bordure },
  piedLibelle: { fontSize: 12, color: couleurs.encreAttenuee },
  piedValeur: { fontSize: 18, fontWeight: "800", color: couleurs.encre },
  boutonPied: { minHeight: 50, paddingHorizontal: espacements.s5, borderRadius: rayons.md, backgroundColor: couleurs.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  boutonPiedFinal: { backgroundColor: couleurs.succes },
  avisHorsLigne: { fontSize: 13, color: couleurs.alerte, backgroundColor: couleurs.alerteClair, padding: espacements.s3, borderRadius: rayons.sm },
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
    flexDirection: "row",
    gap: 6,
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
