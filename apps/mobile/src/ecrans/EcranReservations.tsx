import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { peutOperer } from "@hotel-chicago/types";
import { actionPourSejour, demandesSurChambrePrise, sejoursDuJour } from "@hotel-chicago/regles";
import type { ProposeActionSejour } from "@hotel-chicago/regles";
import type { Reservation, StatutReservation } from "@hotel-chicago/types";
import { CalendarDays, LogIn } from "lucide-react-native";
import { CarteSejour, resteAPayerChambre } from "../sejours/CarteSejour";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { useAcomptesEnLigne } from "../hooks/useAcomptesEnLigne";
import { BadgePayeEnLigne } from "../composants/PayeEnLigne";
import { EcranReservationDetail } from "./EcranReservationDetail";
import { EcranNouvelleReservation } from "./EcranNouvelleReservation";
import type { DemandeSejour } from "../sejours/ContexteDemandeSejour";
import { EcranFacturation } from "./EcranFacturation";
import { EcranPlanning } from "./EcranPlanning";
import { dateCourte, finJournee, formaterLubumbashi } from "../dates";
import { messageErreur } from "../messagesErreur";
import { parTheme } from "../theme/theme";

type Ligne = { cle: string; titre: string } | { cle: string; sejour: Reservation; genre: "arrivee" | "depart" | "present" };
type ElementListe = Ligne | Reservation;

export interface EcranReservationsProps {
  /** Segment affiché à l'ouverture — "aujourdhui" quand l'écran sert de vue
   * « Arrivées et départs » depuis l'onglet Plus. */
  segmentInitial?: SegmentId;
  /** « Retour » en en-tête : vers la liste Plus quand l'écran y est
   * embarqué, vers l'Accueil depuis l'onglet Réserv. */
  onRetour?: () => void;
  /** Deep-link notification : ouvre directement le détail de la réservation. */
  reservationInitiale?: string;
  /** Demande d'un autre onglet (Chambres) : enregistrer une arrivée, voir un séjour, le facturer. */
  demandeInitiale?: DemandeSejour | null;
}

type SegmentId = "aujourdhui" | "avenir" | "encours" | "historique" | "planning";
type Vue =
  | { id: "liste" }
  | { id: "detail"; reservationId: string }
  | { id: "nouveau"; chambreInitialeId?: string; dateArriveeInitiale?: string; arriveeImmediate?: boolean }
  | { id: "facturation"; reservationId: string; checkOut: boolean };

const SEGMENTS: { id: SegmentId; libelle: string }[] = [
  { id: "aujourdhui", libelle: "Aujourd'hui" },
  { id: "avenir", libelle: "À venir" },
  { id: "encours", libelle: "En cours" },
  { id: "historique", libelle: "Historique" },
  { id: "planning", libelle: "Planning" },
];

const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

const COULEUR_STATUT: Record<StatutReservation, { fond: string; texte: string }> = parTheme(() => ({
  EN_ATTENTE: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  CONFIRMEE: { fond: couleurs.bleuClair, texte: couleurs.bleu },
  EN_COURS: { fond: couleurs.succesClair, texte: couleurs.succes },
  TERMINEE: { fond: couleurs.bordure, texte: couleurs.encre },
  ANNULEE: { fond: couleurs.dangerClair, texte: couleurs.danger },
}));

/** « Aujourd'hui », « À venir » : le jour de Lubumbashi (dates.ts), quel que soit le fuseau réglé sur le téléphone. */
function filtrer(reservations: Reservation[], segment: SegmentId): Reservation[] {
  const aujourdhui = new Date();
  const finDuJour = finJournee(aujourdhui);
  switch (segment) {
    case "aujourdhui": {
      const j = sejoursDuJour(reservations, aujourdhui);
      return [...j.arrivees, ...j.departs, ...j.presents];
    }
    case "avenir":
      return reservations.filter(
        (r) => (r.statut === "CONFIRMEE" || r.statut === "EN_ATTENTE") && new Date(r.dateArrivee) >= finDuJour
      );
    case "encours":
      return reservations.filter((r) => r.statut === "EN_COURS");
    case "historique":
      return reservations.filter((r) => r.statut === "TERMINEE" || r.statut === "ANNULEE");
    case "planning":
      return reservations; // affiché par EcranPlanning, pas par la liste
  }
}

const VIDE_PAR_SEGMENT: Record<SegmentId, string> = {
  aujourdhui: "Rien à faire aujourd'hui : aucune arrivée, aucun départ, aucun client présent.",
  avenir: "Aucune réservation à venir.",
  encours: "Aucun client présent.",
  historique: "Aucun séjour passé.",
  planning: "Aucune réservation sur la fenêtre.",
};

/**
 * Hub Réception : lit toujours le miroir SQLite (fonctionne hors ligne), la
 * synchronisation tourne en tâche de fond (montage, pull-to-refresh, cycle
 * du moteur). Liste → Détail (actions) → Nouvelle réservation →
 * Facturation, tout géré par un état local — même principe que
 * EcranOngletCaisse, sans stack de navigation.
 */
export function EcranReservations({ segmentInitial = "aujourdhui", onRetour, reservationInitiale, demandeInitiale = null }: EcranReservationsProps) {
  const { client, moteurSync, miroir, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  const acomptes = useAcomptesEnLigne(client);
  const [vue, setVue] = useState<Vue>(() => {
    if (reservationInitiale) return { id: "detail", reservationId: reservationInitiale };
    if (demandeInitiale?.type === "nouvelle") return { id: "nouveau", chambreInitialeId: demandeInitiale.chambreId || undefined, arriveeImmediate: true };
    if (demandeInitiale?.type === "detail") return { id: "detail", reservationId: demandeInitiale.reservationId };
    if (demandeInitiale?.type === "facturer") return { id: "facturation", reservationId: demandeInitiale.reservationId, checkOut: true };
    return { id: "liste" };
  });
  const [segment, setSegment] = useState<SegmentId>(segmentInitial);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  // Demandes en attente dont la chambre est DÉJÀ prise par un autre client (acompte payé, réservation confirmée).
  const demandesBloquees = useMemo(() => demandesSurChambrePrise(reservations ?? []), [reservations]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  /** Rappel après un check-in : ce qui reste à payer. */
  const [info, setInfo] = useState<string | null>(null);
  const operer = peutOperer(utilisateur);

  const rechargerMiroir = useCallback(() => {
    client
      .listerReservations()
      .then(setReservations)
      .then(() => setErreur(null))
      .catch((e: unknown) => {
        setReservations((courant) => courant ?? []);
        setErreur(messageErreur(e, "Les réservations n'ont pas pu être relues sur ce téléphone. Tirez pour réessayer."));
      });
  }, [client]);

  useEffect(() => {
    rechargerMiroir();
    moteurSync.forcerSynchronisation();
  }, [rechargerMiroir, moteurSync]);

  // Une synchro vient de finir : relit le miroir (lignes tirées du serveur,
  // confirmations de push, statuts modifiés par un autre poste).
  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerMiroir();
  }, [etatSync.dernierePousseeLe, rechargerMiroir]);

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    rechargerMiroir();
    setRafraichissement(false);
  }

  const liste = useMemo(() => filtrer(reservations ?? [], segment), [reservations, segment]);
  const sousTitre = reservations ? `${liste.length} séjour${liste.length > 1 ? "s" : ""}` : "Chargement…";
  const jour = useMemo(() => sejoursDuJour(reservations ?? []), [reservations]);
  const dateDuJour = formaterLubumbashi(new Date(), { weekday: "long", day: "numeric", month: "long" });

  /** Lignes de l'écran « Aujourd'hui » : un titre par groupe puis ses séjours. */
  const lignesAujourdhui = useMemo<Ligne[]>(() => {
    const lignes: Ligne[] = [];
    const groupe = (titre: string, items: Reservation[], genre: "arrivee" | "depart" | "present") => {
      if (items.length === 0) return;
      lignes.push({ cle: `t-${genre}`, titre: `${titre} · ${items.length}` });
      for (const sejour of items) lignes.push({ cle: sejour.id, sejour, genre });
    };
    groupe("Arrivées attendues", jour.arrivees, "arrivee");
    groupe("Départs du jour", jour.departs, "depart");
    groupe("Clients présents", jour.presents, "present");
    return lignes;
  }, [jour]);

  async function lancerAction(sejour: Reservation, action: ProposeActionSejour) {
    if (action.id === "facturer") {
      setVue({ id: "facturation", reservationId: sejour.id, checkOut: true });
      return;
    }
    setActionEnCours(sejour.id);
    setErreur(null);
    setInfo(null);
    try {
      if (action.id === "checkin") {
        await client.checkIn(sejour.id);
        const reste = resteAPayerChambre(sejour);
        setInfo(
          reste > 0
            ? `${sejour.client.nom} est arrivé(e). Reste à payer : ${formatMontant(reste, sejour.chambre.devise)} — à encaisser depuis sa fiche ou au départ.`
            : `${sejour.client.nom} est arrivé(e). Le séjour est déjà payé.`
        );
      } else {
        await client.confirmerReservation(sejour.id);
        setInfo(`Réservation de ${sejour.client.nom} confirmée.`);
      }
      rechargerMiroir();
      void moteurSync.forcerSynchronisation();
    } catch (e) {
      setErreur(messageErreur(e, "L'action n'a pas pu être faite. Réessayez."));
    } finally {
      setActionEnCours(null);
    }
  }

  if (vue.id === "detail") {
    return (
      <EcranReservationDetail
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue({ id: "liste" });
          rechargerMiroir();
        }}
        onChange={rechargerMiroir}
        onFacturer={(idServeur, options) => setVue({ id: "facturation", reservationId: idServeur, checkOut: options?.checkOut ?? true })}
      />
    );
  }

  if (vue.id === "nouveau") {
    return (
      <EcranNouvelleReservation
        onRetour={() => setVue({ id: "liste" })}
        chambreInitialeId={vue.chambreInitialeId}
        dateArriveeInitiale={vue.dateArriveeInitiale}
        arriveeImmediateParDefaut={vue.arriveeImmediate === true}
        onCree={(id) => {
          rechargerMiroir();
          setVue({ id: "detail", reservationId: id });
        }}
      />
    );
  }

  if (vue.id === "facturation") {
    return (
      <EcranFacturation
        reservationId={vue.reservationId}
        checkOut={vue.checkOut}
        onRetour={() => {
          setVue({ id: "liste" });
          void moteurSync.forcerSynchronisation().then(rechargerMiroir);
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      {onRetour ? (
        <EnteteRetour titre="Séjours" sousTitre={dateDuJour} onRetour={onRetour} />
      ) : (
        <View style={styles.entete}>
          <View>
            <Text style={styles.titre} accessibilityRole="header">Séjours</Text>
            <Text style={styles.sousTitre}>{dateDuJour}</Text>
          </View>
        </View>
      )}

      {operer && (
        <View style={styles.boutons}>
          <Pressable
            style={styles.boutonArrivee}
            onPress={() => setVue({ id: "nouveau", arriveeImmediate: true })}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer une arrivée : le client est là maintenant"
          >
            <LogIn size={20} color="#fff" />
            <Text style={styles.boutonArriveeTexte}>Enregistrer une arrivée</Text>
          </Pressable>
          <Pressable
            style={styles.boutonReservation}
            onPress={() => setVue({ id: "nouveau" })}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle réservation pour une autre date"
          >
            <CalendarDays size={18} color={couleurs.encre} />
            <Text style={styles.boutonReservationTexte}>Nouvelle réservation (autre date)</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.compteurs}>
        {[
          { n: jour.arrivees.length, libelle: "Arrivées", fond: couleurs.bleuClair, texte: couleurs.bleu },
          { n: jour.departs.length, libelle: "Départs", fond: couleurs.alerteClair, texte: couleurs.alerte },
          { n: jour.presents.length, libelle: "Présents", fond: couleurs.succesClair, texte: couleurs.succes },
        ].map((c) => (
          <View key={c.libelle} style={[styles.compteur, { backgroundColor: c.fond }]} accessible accessibilityLabel={`${c.n} ${c.libelle.toLowerCase()} aujourd'hui`}>
            <Text style={[styles.compteurValeur, { color: c.texte }]}>{c.n}</Text>
            <Text style={[styles.compteurLibelle, { color: c.texte }]}>{c.libelle}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.segmentsDefilants} contentContainerStyle={styles.segments}>
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.segment, segment === s.id && styles.segmentActif]}
            onPress={() => setSegment(s.id)}
            accessibilityRole="tab"
            accessibilityLabel={s.libelle}
            accessibilityState={{ selected: segment === s.id }}
          >
            <Text style={[styles.segmentTexte, segment === s.id && styles.segmentTexteActif]}>{s.libelle}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {info && (
        <Text style={styles.info} accessibilityRole="alert">
          {info}
        </Text>
      )}

      {erreur && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}

      {segment === "planning" ? (
        <EcranPlanning
          onNouvelleReservation={(chambreId, dateIso) =>
            setVue({ id: "nouveau", chambreInitialeId: chambreId, dateArriveeInitiale: dateIso })
          }
          onOuvrirReservation={(id) => setVue({ id: "detail", reservationId: id })}
        />
      ) : (
        <>
          {reservations && liste.length === 0 && (
            <View style={styles.videConteneur}>
              <Text style={styles.videTexte}>{VIDE_PAR_SEGMENT[segment]}</Text>
            </View>
          )}

          <FlatList<ElementListe>
            data={segment === "aujourdhui" ? lignesAujourdhui : liste}
            keyExtractor={(r) => ("cle" in r ? r.cle : r.id)}
            contentContainerStyle={styles.liste}
            refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
            renderItem={({ item: element }) => {
              if ("cle" in element) {
                if ("titre" in element) {
                  return (
                    <Text style={styles.titreGroupe} accessibilityRole="header">
                      {element.titre.toUpperCase()}
                    </Text>
                  );
                }
                const { sejour, genre } = element;
                const alertes = [
                  ...(demandesBloquees.has(sejour.id) ? ["Chambre déjà réservée par un autre client"] : []),
                  ...(miroir.estCreationEnAttente(sejour.id) ? ["En attente de synchronisation"] : []),
                ];
                return (
                  <CarteSejour
                    sejour={sejour}
                    genre={genre}
                    alertes={alertes}
                    actionEnCours={actionEnCours === sejour.id}
                    action={actionPourSejour(sejour, { operer, chambrePrise: demandesBloquees.has(sejour.id), departAujourdhui: genre === "depart" })}
                    onOuvrir={() => setVue({ id: "detail", reservationId: sejour.id })}
                    onAction={(a) => void lancerAction(sejour, a)}
                  />
                );
              }
              const item = element;
              const tone = COULEUR_STATUT[item.statut];
              return (
                <Pressable
                  style={styles.carte}
                  onPress={() => setVue({ id: "detail", reservationId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.client.nom}, chambre ${item.chambre.numero}, du ${dateCourte(item.dateArrivee)} au ${dateCourte(item.dateDepart)}, ${LABEL_STATUT[item.statut]}${acomptes.has(item.id) ? ", acompte payé en ligne" : ""}${miroir.estCreationEnAttente(item.id) ? ", en attente de synchronisation" : ""}`}
                >
                  <View style={styles.carteEntete}>
                    <Text style={styles.clientNom}>{item.client.nom}</Text>
                    <View style={[styles.badge, { backgroundColor: tone.fond }]}>
                      <Text style={[styles.badgeTexte, { color: tone.texte }]}>{LABEL_STATUT[item.statut]}</Text>
                    </View>
                  </View>
                  <Text style={styles.ligne}>
                    Ch. {item.chambre.numero} · {dateCourte(item.dateArrivee)} → {dateCourte(item.dateDepart)}
                  </Text>
                  <Text style={styles.ligneSecondaire}>
                    {formatMontant(item.chambre.prixParNuit, item.chambre.devise)} / nuit
                    {miroir.estCreationEnAttente(item.id) ? " · en attente de synchro" : ""}
                    {item.origine === "SITE_PUBLIC" ? " · site public" : ""}
                  </Text>
                  <BadgePayeEnLigne paiements={acomptes.get(item.id)} />
                  {demandesBloquees.has(item.id) && <Text style={styles.chambreDejaPrise}>Chambre déjà réservée par un autre client</Text>}
                  {item.note && <Text style={styles.noteTexte}>Note : {item.note}</Text>}
                  {item.preEnregistreLe && (
                    <Text style={styles.preEnregistre}>
                      ✓ Pré-enregistré{item.heureArriveePrevue ? ` · arrivée vers ${item.heureArriveePrevue}` : ""}
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  entete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: espacements.s4,
    paddingBottom: espacements.s2,
  },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  boutons: { paddingHorizontal: espacements.s4, gap: espacements.s2, paddingBottom: espacements.s2 },
  boutonArrivee: { minHeight: 52, borderRadius: rayons.lg, backgroundColor: couleurs.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  boutonArriveeTexte: { color: "#fff", fontWeight: "800", fontSize: 16 },
  boutonReservation: {
    minHeight: 44,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  boutonReservationTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 14 },
  compteurs: { flexDirection: "row", gap: espacements.s2, paddingHorizontal: espacements.s4, paddingBottom: espacements.s2 },
  compteur: { flex: 1, borderRadius: rayons.md, paddingVertical: espacements.s2, alignItems: "center" },
  compteurValeur: { fontSize: 22, fontWeight: "800" },
  compteurLibelle: { fontSize: 12, fontWeight: "700" },
  segmentsDefilants: { flexGrow: 0 },
  info: { fontSize: 13, fontWeight: "600", color: couleurs.succes, backgroundColor: couleurs.succesClair, marginHorizontal: espacements.s4, marginBottom: espacements.s2, padding: espacements.s3, borderRadius: rayons.sm },
  titreGroupe: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  segments: { flexDirection: "row", paddingHorizontal: espacements.s4, gap: espacements.s2, paddingBottom: espacements.s2 },
  segment: {
    paddingHorizontal: espacements.s4,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    backgroundColor: couleurs.surface200,
  },
  segmentActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  segmentTexte: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  segmentTexteActif: { color: "#fff" },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  liste: { padding: espacements.s4, paddingBottom: 24, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7 },
  videTexte: { fontSize: 14, color: couleurs.encreAttenuee },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  clientNom: { fontSize: 16, fontWeight: "700", color: couleurs.encre, flex: 1 },
  badge: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  ligne: { fontSize: 14, color: couleurs.encre },
  ligneSecondaire: { fontSize: 12, color: couleurs.encreAttenuee },
  noteTexte: { fontSize: 12, color: couleurs.violet, fontStyle: "italic" },
  chambreDejaPrise: { fontSize: 12, fontWeight: "700", color: couleurs.danger },
  preEnregistre: { fontSize: 12, fontWeight: "600", color: couleurs.succes },
});
