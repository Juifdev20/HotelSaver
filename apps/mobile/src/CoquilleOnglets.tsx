import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { LayoutDashboard, BedDouble, CalendarDays, Menu } from "lucide-react-native";
import { couleurs } from "./tokens";
import { IdOnglet, libelleOnglet, ongletsPourRole } from "./navigation";
import { useSession } from "./contexteSession";
import { EcranTableauDeBord } from "./ecrans/EcranTableauDeBord";
import { EcranChambres } from "./ecrans/EcranChambres";
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

function EcranChambresConnecte() {
  const { client } = useSession();
  return <EcranChambres client={client} />;
}

const ICONES: Record<IdOnglet, typeof LayoutDashboard> = {
  "tableau-de-bord": LayoutDashboard,
  chambres: BedDouble,
  reservations: CalendarDays,
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
              if (onglet.id === "chambres") return <EcranChambresConnecte />;
              if (onglet.id === "plus") return <EcranPlus />;
              return <EcranBientot titre={libelleOnglet(onglet.id)} />;
            }}
          </Tab.Screen>
        );
      })}
    </Tab.Navigator>
  );
}
