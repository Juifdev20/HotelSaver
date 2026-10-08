import * as React from "react";
import { useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, BedDouble, CalendarDays, ClipboardList, Menu, ShoppingCart, Wallet } from "lucide-react-native";
import { couleurs } from "./tokens";
import { IdOnglet, libelleOnglet, ongletsPourRole } from "./navigation";
import { useSession } from "./contexteSession";
import { EcranTableauDeBord } from "./ecrans/EcranTableauDeBord";
import { EcranChambres } from "./ecrans/EcranChambres";
import { EcranCaisse } from "./ecrans/EcranCaisse";
import { EcranComptesOuverts } from "./ecrans/EcranComptesOuverts";
import { EcranCompteCafeteria } from "./ecrans/EcranCompteCafeteria";
import { useNotifications } from "./notifications/ContexteNotifications";
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

/** Onglet "Caisse" (CAFETARIA) : ouvre un compte puis passe directement à
 * son détail, comme le faisait "Caisse" depuis Plus (28/09/2026) — sauf
 * qu'ici pas de liste parente vers laquelle revenir : une fois le compte
 * encaissé/consulté, "Retour" mène à "Comptes" (son propre onglet), pas à
 * l'ancien écran Plus. */
function EcranOngletCaisse({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { client } = useSession();
  const [compteId, setCompteId] = useState<string | null>(null);
  const [venteRapide, setVenteRapide] = useState(false);

  if (compteId) {
    return (
      <EcranCompteCafeteria
        client={client}
        compteId={compteId}
        ouvrirAjoutAuDemarrage={venteRapide}
        onRetour={() => {
          setCompteId(null);
          setVenteRapide(false);
          navigation.navigate("comptes-ouverts");
        }}
      />
    );
  }
  return (
    <EcranCaisse
      onCompteOuvert={(id, options) => {
        setVenteRapide(options?.venteRapide === true);
        setCompteId(id);
      }}
      onRetour={() => navigation.navigate("tableau-de-bord")}
    />
  );
}

/** Onglet "Comptes" (CAFETARIA) : même détail de compte que "Caisse", mais
 * "Retour" depuis la liste reste sur cet onglet (rien à quitter). Une
 * notification « commande web » ouvre directement le détail du compte. */
function EcranOngletComptesOuverts({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { client } = useSession();
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
    <EcranComptesOuverts onOuvrirCompte={setCompteId} onRetour={() => navigation.navigate("tableau-de-bord")} />
  );
}

/** Onglet "Réserv." (RECEPTIONNISTE/PATRON) : une notification qui porte un
 * id de réservation (demande arrivée, annulation, départ dépassé) ouvre
 * directement son détail — même mécanisme que demandeCompte pour la
 * cafétaria. */
function EcranOngletReservations({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { demandeReservation, consommerDemandeReservation } = useNotifications();
  const [reservationId, setReservationId] = useState<string | null>(null);

  useEffect(() => {
    if (demandeReservation) {
      setReservationId(demandeReservation.reservationId);
      consommerDemandeReservation();
    }
  }, [demandeReservation, consommerDemandeReservation]);

  // La clé force le remontage quand une nouvelle notification cible une
  // autre réservation — reservationInitiale n'est lue qu'au montage.
  return (
    <EcranReservations
      key={reservationId ?? "liste"}
      reservationInitiale={reservationId ?? undefined}
      onRetour={() => navigation.navigate("tableau-de-bord")}
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
  const onglets = ongletsPourRole(utilisateur.role);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: couleurs.bleu,
        tabBarInactiveTintColor: couleurs.encreAttenuee,
        tabBarStyle: { borderTopColor: couleurs.bordure },
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
            }}
          >
            {(props) => {
              if (onglet.id === "tableau-de-bord") return <EcranAccueilConnecte {...props} />;
              if (onglet.id === "chambres") return <EcranChambres onRetour={() => props.navigation.navigate("tableau-de-bord")} />;
              if (onglet.id === "reservations") return <EcranOngletReservations {...props} />;
              if (onglet.id === "caisse") return <EcranOngletCaisse {...props} />;
              if (onglet.id === "comptes-ouverts") return <EcranOngletComptesOuverts {...props} />;
              if (onglet.id === "depenses") return <EcranDepenses onRetour={() => props.navigation.navigate("tableau-de-bord")} />;
              if (onglet.id === "plus") return <EcranPlus />;
              return <EcranBientot titre={libelleOnglet(onglet.id)} />;
            }}
          </Tab.Screen>
        );
      })}
    </Tab.Navigator>
  );
}
