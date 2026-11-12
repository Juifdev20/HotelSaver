import * as React from "react";
import { useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, BedDouble, CalendarDays, ClipboardList, Menu, ShoppingCart, Wallet } from "lucide-react-native";
import { couleurs, fonds } from "./tokens";
import { retourReglagesDemande } from "./theme/theme";
import { IdOnglet, libelleOnglet, ongletsPourRole } from "./navigation";
import { useSession } from "./contexteSession";
import { EcranTableauDeBord } from "./ecrans/EcranTableauDeBord";
import { EcranChambres } from "./ecrans/EcranChambres";
import { EcranVente } from "./ecrans/EcranVente";
import { FournisseurVente, useVente } from "./vente/ContexteVente";
import { FournisseurDemandeSejour, useDemandeSejour } from "./sejours/ContexteDemandeSejour";
import { Role } from "@hotel-chicago/types";
import { EcranEnCours } from "./ecrans/EcranEnCours";
import { EcranCompteCafeteria } from "./ecrans/EcranCompteCafeteria";
import { useNotifications } from "./notifications/ContexteNotifications";
import { useNombreComptesOuverts } from "./hooks/useNombreComptesOuverts";
import { EcranReservations } from "./ecrans/EcranReservations";
import { EcranBientot } from "./ecrans/EcranBientot";
import { EcranPlus } from "./ecrans/EcranPlus";
import { EcranDepenses } from "./ecrans/EcranDepenses";

type ParamListOnglets = Record<IdOnglet, undefined>;
const Tab = createBottomTabNavigator<ParamListOnglets>();

function EcranAccueilConnecte({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { client, utilisateur } = useSession();
  return (
    <EcranTableauDeBord
      client={client}
      utilisateur={utilisateur}
      onAllerAuxChambres={() => navigation.navigate("chambres")}
    />
  );
}

/** Onglet « Vente » (CAFETARIA, 11/11/2026) : on arrive directement sur les produits ; la table n'est créée que si le client reste. Voir EcranVente. */
function EcranOngletVente({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  return <EcranVente onRetour={() => navigation.navigate("tableau-de-bord")} />;
}

/** Onglet "Comptes" (CAFETARIA) : même détail de compte que "Caisse", mais
 * "Retour" depuis la liste reste sur cet onglet (rien à quitter). Une
 * notification « commande web » ouvre directement le détail du compte. */
function EcranOngletComptesOuverts({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { client, utilisateur } = useSession();
  const { choisirOnglet } = useVente();
  const { demandeCompte, consommerDemandeCompte } = useNotifications();
  const [compteId, setCompteId] = useState<string | null>(null);

  useEffect(() => {
    if (demandeCompte) {
      setCompteId(demandeCompte.compteId);
      consommerDemandeCompte();
    }
  }, [demandeCompte, consommerDemandeCompte]);

  if (compteId) {
    return <EcranCompteCafeteria client={client} compteId={compteId} onRetour={() => setCompteId(null)} />;
  }
  return (
    <EcranEnCours
      onOuvrirCompte={(id, compte) => {
        // La cafétaria reprend une table dans « Vente » (son onglet, avec les produits) ; une commande du site et le patron gardent le détail du compte.
        if (utilisateur.role === Role.CAFETARIA && compte && compte.origine !== "SITE_PUBLIC") {
          choisirOnglet(id);
          navigation.navigate("caisse");
          return;
        }
        setCompteId(id);
      }}
      onRetour={() => navigation.navigate("tableau-de-bord")}
    />
  );
}

/** Onglet "Réserv." (RECEPTIONNISTE/PATRON) : une notification qui porte un
 * id de réservation (demande arrivée, annulation, départ dépassé) ouvre
 * directement son détail — même mécanisme que demandeCompte pour la
 * cafétaria. */
function EcranOngletReservations({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { demandeReservation, consommerDemandeReservation } = useNotifications();
  const { demande, consommer } = useDemandeSejour();
  const [reservationId, setReservationId] = useState<string | null>(null);
  // Demande venue de l'onglet Chambres (arrivée, départ, voir le séjour) : lue une fois, avec une clé qui force le remontage.
  const [demandeChambre, setDemandeChambre] = useState<{ cle: number; demande: NonNullable<typeof demande> } | null>(null);

  useEffect(() => {
    if (demandeReservation) {
      setReservationId(demandeReservation.reservationId);
      setDemandeChambre(null);
      consommerDemandeReservation();
    }
  }, [demandeReservation, consommerDemandeReservation]);

  useEffect(() => {
    if (demande) {
      setReservationId(null);
      setDemandeChambre({ cle: Date.now(), demande });
      consommer();
    }
  }, [demande, consommer]);

  // La clé force le remontage quand une nouvelle notification ou demande cible une
  // autre réservation — reservationInitiale n'est lue qu'au montage.
  return (
    <EcranReservations
      key={reservationId ?? (demandeChambre ? `demande-${demandeChambre.cle}` : "liste")}
      reservationInitiale={reservationId ?? undefined}
      demandeInitiale={demandeChambre?.demande ?? null}
      onRetour={() => navigation.navigate("tableau-de-bord")}
    />
  );
}

/** Onglet « Chambres » : le tableau de cartes. Ses actions (arrivée, départ, voir) ouvrent « Séjours » sur la bonne page. */
function EcranOngletChambres({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { demander } = useDemandeSejour();
  return (
    <EcranChambres
      onRetour={() => navigation.navigate("tableau-de-bord")}
      onArrivee={(chambreId) => {
        demander({ type: "nouvelle", chambreId });
        navigation.navigate("reservations");
      }}
      onFacturer={(reservationId) => {
        demander({ type: "facturer", reservationId });
        navigation.navigate("reservations");
      }}
      onVoirSejour={(reservationId) => {
        demander({ type: "detail", reservationId });
        navigation.navigate("reservations");
      }}
    />
  );
}

const ICONES: Record<IdOnglet, typeof LayoutDashboard> = {
  "tableau-de-bord": LayoutDashboard,
  chambres: BedDouble,
  reservations: CalendarDays,
  caisse: ShoppingCart,
  "comptes-ouverts": ClipboardList,
  depenses: Wallet,
  plus: Menu,
};

/** Barre d'onglets filtrée par rôle — voir `navigation.ts` (matrice 9.3) et
 * la maquette mobile (Accueil/Chambres/Réservations/Plus). */
export function CoquilleOnglets() {
  const { utilisateur } = useSession();
  // Les onglets des fonctions que la formule de l'hôtel n'ouvre pas disparaissent ; « Accueil » et « Plus » restent toujours (barre jamais vide,
  // et si l'onglet affiché disparaît, la navigation retombe sur le premier : l'Accueil).
  const onglets = ongletsPourRole(utilisateur.role, utilisateur.fonctions);
  // Pastille « En cours » : tables ouvertes (base locale, hors ligne compris).
  const nombreEnCours = useNombreComptesOuverts(onglets.some((o) => o.id === "comptes-ouverts"));

  return (
    <FournisseurVente>
    <FournisseurDemandeSejour>
    <Tab.Navigator
      // Après un changement d'apparence l'arbre est remonté : on revient dans Plus (où se trouvent les Paramètres) plutôt qu'à l'Accueil.
      initialRouteName={retourReglagesDemande() && onglets.some((o) => o.id === "plus") ? "plus" : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: couleurs.bleu,
        tabBarInactiveTintColor: couleurs.encreAttenuee,
        tabBarStyle: { borderTopColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
      }}
    >
      {onglets.map((onglet) => {
        const Icone = ICONES[onglet.id];
        return (
          <Tab.Screen
            key={onglet.id}
            name={onglet.id}
            options={{
              title: onglet.libelle,
              tabBarIcon: ({ color, size }) => <Icone color={color} size={size} />,
              tabBarBadge: onglet.id === "comptes-ouverts" && nombreEnCours > 0 ? nombreEnCours : undefined,
              tabBarBadgeStyle: { backgroundColor: fonds.danger },
            }}
          >
            {(props) => {
              if (onglet.id === "tableau-de-bord") return <EcranAccueilConnecte {...props} />;
              if (onglet.id === "chambres") return <EcranOngletChambres {...props} />;
              if (onglet.id === "reservations") return <EcranOngletReservations {...props} />;
              if (onglet.id === "caisse") return <EcranOngletVente {...props} />;
              if (onglet.id === "comptes-ouverts") return <EcranOngletComptesOuverts {...props} />;
              if (onglet.id === "depenses") return <EcranDepenses onRetour={() => props.navigation.navigate("tableau-de-bord")} />;
              if (onglet.id === "plus") return <EcranPlus />;
              return <EcranBientot titre={libelleOnglet(onglet.id)} />;
            }}
          </Tab.Screen>
        );
      })}
    </Tab.Navigator>
    </FournisseurDemandeSejour>
    </FournisseurVente>
  );
}
