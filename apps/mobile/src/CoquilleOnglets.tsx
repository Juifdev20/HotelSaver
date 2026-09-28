import * as React from "react";
import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, BedDouble, CalendarDays, ClipboardList, Menu, ShoppingCart } from "lucide-react-native";
import { couleurs } from "./tokens";
import { IdOnglet, libelleOnglet, ongletsPourRole } from "./navigation";
import { useSession } from "./contexteSession";
import { EcranTableauDeBord } from "./ecrans/EcranTableauDeBord";
import { EcranChambres } from "./ecrans/EcranChambres";
import { EcranCaisse } from "./ecrans/EcranCaisse";
import { EcranComptesOuverts } from "./ecrans/EcranComptesOuverts";
import { EcranCompteCafeteria } from "./ecrans/EcranCompteCafeteria";
import { EcranReservations } from "./ecrans/EcranReservations";
import { EcranBientot } from "./ecrans/EcranBientot";
import { EcranPlus } from "./ecrans/EcranPlus";

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

  if (compteId) {
    return (
      <EcranCompteCafeteria
        client={client}
        compteId={compteId}
        onRetour={() => {
          setCompteId(null);
          navigation.navigate("comptes-ouverts");
        }}
      />
    );
  }
  return <EcranCaisse onCompteOuvert={setCompteId} onRetour={() => navigation.navigate("tableau-de-bord")} />;
}

/** Onglet "Comptes" (CAFETARIA) : même détail de compte que "Caisse", mais
 * "Retour" depuis la liste reste sur cet onglet (rien à quitter). */
function EcranOngletComptesOuverts({ navigation }: { navigation: BottomTabNavigationProp<ParamListOnglets> }) {
  const { client } = useSession();
  const [compteId, setCompteId] = useState<string | null>(null);

  if (compteId) {
    return <EcranCompteCafeteria client={client} compteId={compteId} onRetour={() => setCompteId(null)} />;
  }
  return (
    <EcranComptesOuverts onOuvrirCompte={setCompteId} onRetour={() => navigation.navigate("tableau-de-bord")} />
  );
}

const ICONES: Record<IdOnglet, typeof LayoutDashboard> = {
  "tableau-de-bord": LayoutDashboard,
  chambres: BedDouble,
  reservations: CalendarDays,
  caisse: ShoppingCart,
  "comptes-ouverts": ClipboardList,
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
              if (onglet.id === "chambres") return <EcranChambres />;
              if (onglet.id === "reservations") return <EcranReservations />;
              if (onglet.id === "caisse") return <EcranOngletCaisse {...props} />;
              if (onglet.id === "comptes-ouverts") return <EcranOngletComptesOuverts {...props} />;
              if (onglet.id === "plus") return <EcranPlus />;
              return <EcranBientot titre={libelleOnglet(onglet.id)} />;
            }}
          </Tab.Screen>
        );
      })}
    </Tab.Navigator>
  );
}
